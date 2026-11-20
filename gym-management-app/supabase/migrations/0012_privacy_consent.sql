-- =====================================================================
-- 0012_privacy_consent.sql
-- Production Readiness — Stage 2B, WS-8: privacy, consent and user rights.
--
-- Why this exists:
--   The member joining flow collected name, phone, email and a plan with
--   no privacy/terms acknowledgement, no consent record and no account
--   deletion / data-export request path. This migration adds the minimum
--   server-controlled record keeping needed to support the legal drafts
--   and the in-app request workflow. It does not publish anything, does
--   not delete data and does not automate account erasure.
--
-- What this migration adds (and nothing else):
--   1. `consent_records` — append-only acceptance/rejection evidence bound
--      to the authenticated user. No IP address, device fingerprint,
--      password, token or OTP is stored.
--   2. `privacy_requests` — a member-initiated request queue for account
--      deletion, data export, correction and privacy questions. Requests
--      are reviewed by the Owner; the database never deletes a member,
--      payment, receipt or audit row.
--   3. `record_consent(...)` — caller-only consent writer. The target user
--      is always `auth.uid()`; there is no user-id parameter, so one
--      account cannot record consent for another.
--   4. `request_privacy_action(...)` — caller-only request intake.
--   5. `resolve_privacy_request(...)` — Owner + AAL2 workflow status update
--      only. It records a decision; it does not execute an erasure.
--   6. Append-only guards, least-privilege grants and owner/member RLS.
--
-- What this migration deliberately does NOT do:
--   * It does not apply any remote change. It is a local migration file.
--   * It does not create retention/purge jobs or delete any row.
--   * It does not delete auth users (that remains an Owner/Admin API
--     operation, reviewed against payment/audit retention).
--   * It does not weaken RLS, RBAC, AAL2 or the existing audit system.
--
-- Audit note:
--   `audit_log_entries.actor` references `profiles(id)`. A join-flow
--   consent can be recorded after OTP verification but before the member
--   profile row exists, so `record_consent` writes an audit row only when
--   a profile exists. The consent row itself is the durable evidence in
--   that pre-profile window. `privacy_requests` actions require an active
--   profile and therefore always write the normal audit row.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Consent evidence (append-only)
-- ---------------------------------------------------------------------
create table public.consent_records (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid not null references auth.users (id) on delete cascade,
  consent_type     text not null,
  document_version text not null,
  accepted         boolean not null,
  source           text not null,
  recorded_at      timestamptz not null default now(),
  constraint consent_records_type_check
    check (consent_type in ('privacy_policy', 'terms_of_service', 'marketing')),
  constraint consent_records_source_check
    check (source in ('member_join', 'member_privacy_screen')),
  constraint consent_records_version_check
    check (btrim(document_version) <> ''),
  constraint consent_records_acceptance_check
    check (accepted or consent_type = 'marketing')
);

comment on table public.consent_records is
  'Append-only consent/acknowledgement evidence. Bound to auth.uid(); no IP, fingerprint, password, token or OTP is stored. Mandatory documents can only be recorded as accepted; marketing may be accepted or declined.';

comment on column public.consent_records.document_version is
  'The version identifier of the document the user saw. A new version creates a new row; earlier rows are never edited.';

comment on column public.consent_records.source is
  'Where the acceptance/decline happened: the online join flow or the member privacy screen.';

create index consent_records_user_time_idx
  on public.consent_records (auth_user_id, recorded_at desc);

create index consent_records_type_time_idx
  on public.consent_records (consent_type, recorded_at desc);

-- ---------------------------------------------------------------------
-- 2. Privacy requests (member-initiated, Owner-reviewed)
-- ---------------------------------------------------------------------
create table public.privacy_requests (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid not null references auth.users (id) on delete cascade,
  request_type     text not null,
  details          text,
  state            text not null default 'submitted',
  resolution_note  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid references auth.users (id) on delete set null,
  constraint privacy_requests_type_check
    check (request_type in ('account_deletion', 'data_export', 'data_correction', 'privacy_inquiry')),
  constraint privacy_requests_state_check
    check (state in ('submitted', 'in_review', 'completed', 'rejected', 'cancelled')),
  constraint privacy_requests_details_length
    check (details is null or char_length(details) <= 2000),
  constraint privacy_requests_resolution_note_length
    check (resolution_note is null or char_length(resolution_note) <= 2000),
  constraint privacy_requests_closed_timestamp
    check ((state in ('completed', 'rejected', 'cancelled')) = (resolved_at is not null))
);

comment on table public.privacy_requests is
  'Member-initiated privacy request queue. A row is a request, never an erasure. Owner review is auditable; financial, receipt and audit records are NOT deleted by this table.';

comment on column public.privacy_requests.state is
  'submitted -> in_review -> completed/rejected. A completed request means the reviewed action was recorded by the Owner; it does not prove an automatic deletion.';

create index privacy_requests_user_time_idx
  on public.privacy_requests (auth_user_id, created_at desc);

create index privacy_requests_state_time_idx
  on public.privacy_requests (state, created_at desc);

-- ---------------------------------------------------------------------
-- 3. RLS — members see only their own rows; Owners see the queue.
--    Receptionists have no access to either table.
-- ---------------------------------------------------------------------
alter table public.consent_records enable row level security;
alter table public.consent_records force row level security;
alter table public.privacy_requests enable row level security;
alter table public.privacy_requests force row level security;

create policy consent_records_select_own on public.consent_records
  for select to authenticated
  using (auth_user_id = auth.uid());

create policy consent_records_select_owner on public.consent_records
  for select to authenticated
  using (public.app_profile_role() = 'owner');

create policy privacy_requests_select_own on public.privacy_requests
  for select to authenticated
  using (auth_user_id = auth.uid());

create policy privacy_requests_select_owner on public.privacy_requests
  for select to authenticated
  using (public.app_profile_role() = 'owner');

-- ---------------------------------------------------------------------
-- 4. Table privileges — read-only for clients; every write is an RPC.
--    No INSERT/UPDATE/DELETE grant is added to authenticated or anon.
-- ---------------------------------------------------------------------
grant select on public.consent_records, public.privacy_requests to authenticated;
grant select on public.consent_records, public.privacy_requests to service_role;

-- ---------------------------------------------------------------------
-- 5. Client-mutation guards (append-only consent; RPC-only requests).
-- ---------------------------------------------------------------------
create trigger trg_client_guard
  before insert or update or delete on public.consent_records
  for each row execute function public.assert_no_client_mutation();

create trigger trg_client_guard
  before insert or update or delete on public.privacy_requests
  for each row execute function public.assert_no_client_mutation();

create trigger trg_updated_at
  before update on public.privacy_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. record_consent — caller-only append.
--    The target is auth.uid(); there is deliberately no p_user_id.
-- ---------------------------------------------------------------------
create function public.record_consent(
  p_consent_type     text,
  p_document_version text,
  p_accepted         boolean,
  p_source           text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  if p_consent_type is null
     or p_consent_type not in ('privacy_policy', 'terms_of_service', 'marketing') then
    raise exception 'Unsupported consent type.'
      using errcode = '22023';
  end if;

  if p_source is null
     or p_source not in ('member_join', 'member_privacy_screen') then
    raise exception 'Unsupported consent source.'
      using errcode = '22023';
  end if;

  if p_document_version is null or btrim(p_document_version) = '' then
    raise exception 'A consent version is required.'
      using errcode = '22023';
  end if;

  if p_accepted is null then
    raise exception 'An acceptance value is required.'
      using errcode = '22023';
  end if;

  if p_accepted is false and p_consent_type <> 'marketing' then
    raise exception 'Mandatory documents must be accepted before they are recorded.'
      using errcode = '22023';
  end if;

  insert into public.consent_records
    (auth_user_id, consent_type, document_version, accepted, source)
  values
    (v_actor, p_consent_type, btrim(p_document_version), p_accepted, p_source)
  returning id into v_id;

  -- The audit actor FK needs a profiles row. During the join flow the
  -- consent row can legitimately arrive before the profile exists; the
  -- append-only consent row is then the evidence. Never invent an actor.
  if exists (select 1 from public.profiles p where p.id = v_actor) then
    perform public.audit_authority(
      'consent.recorded', 'consent_records', v_id, null,
      jsonb_build_object(
        'consent_type', p_consent_type,
        'document_version', btrim(p_document_version),
        'accepted', p_accepted,
        'source', p_source
      ));
  end if;

  return v_id;
end
$$;

comment on function public.record_consent(text, text, boolean, text) is
  'Caller-only append of a consent/acknowledgement. Target is always auth.uid(). No IP, fingerprint or secret is stored.';

-- ---------------------------------------------------------------------
-- 7. request_privacy_action — caller-only request intake.
-- ---------------------------------------------------------------------
create function public.request_privacy_action(
  p_request_type text,
  p_details      text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid;
  v_id    uuid;
  v_note  text;
begin
  -- Any active role may request their own privacy action. The UI exposes
  -- this to members; staff requests are handled through the Owner.
  perform public.require_role(array['member', 'receptionist', 'owner']);
  v_actor := auth.uid();

  if p_request_type is null
     or p_request_type not in ('account_deletion', 'data_export', 'data_correction', 'privacy_inquiry') then
    raise exception 'Unsupported privacy request type.'
      using errcode = '22023';
  end if;

  v_note := nullif(btrim(coalesce(p_details, '')), '');
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'The request details are too long.'
      using errcode = '22001';
  end if;

  insert into public.privacy_requests
    (auth_user_id, request_type, details, state)
  values
    (v_actor, p_request_type, v_note, 'submitted')
  returning id into v_id;

  perform public.audit_authority(
    'privacy.requested', 'privacy_requests', v_id, null,
    jsonb_build_object('request_type', p_request_type, 'state', 'submitted'));

  return v_id;
end
$$;

comment on function public.request_privacy_action(text, text) is
  'Caller-only intake for account deletion, data export, correction and privacy questions. Creates a reviewed request; never deletes or exports data by itself.';

-- ---------------------------------------------------------------------
-- 8. resolve_privacy_request — Owner + AAL2 workflow status only.
-- ---------------------------------------------------------------------
create function public.resolve_privacy_request(
  p_request_id uuid,
  p_state      text,
  p_note       text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = 'public'
as $$
declare
  v_request public.privacy_requests%rowtype;
  v_note    text;
begin
  perform public.require_role(array['owner']);
  perform public.assert_aal2();

  if p_state is null or p_state not in ('in_review', 'completed', 'rejected') then
    raise exception 'Unsupported request state.'
      using errcode = '22023';
  end if;

  select * into v_request
    from public.privacy_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'Privacy request not found.'
      using errcode = 'P0002';
  end if;

  if v_request.state in ('completed', 'rejected', 'cancelled') then
    raise exception 'This privacy request is already closed.'
      using errcode = '55000';
  end if;

  if p_state = 'in_review' and v_request.state <> 'submitted' then
    raise exception 'Only a submitted request can move to review.'
      using errcode = '55000';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'The resolution note is too long.'
      using errcode = '22001';
  end if;

  update public.privacy_requests
     set state = p_state,
         resolution_note = v_note,
         resolved_at = case when p_state in ('completed', 'rejected') then now() else null end,
         resolved_by = case when p_state in ('completed', 'rejected') then auth.uid() else null end
   where id = p_request_id;

  perform public.audit_authority(
    'privacy.request_resolved', 'privacy_requests', p_request_id,
    jsonb_build_object('state', v_request.state),
    jsonb_build_object('state', p_state, 'note', v_note));

  return p_request_id;
end
$$;

comment on function public.resolve_privacy_request(uuid, text, text) is
  'Owner + AAL2 workflow update (in_review / completed / rejected). Explicitly does NOT delete a user, payment, receipt or audit row; the Owner performs any approved action separately and records the note here.';

-- ---------------------------------------------------------------------
-- 9. Least-privilege RPC grants — authenticated only.
-- ---------------------------------------------------------------------
revoke execute on function public.record_consent(text, text, boolean, text)
  from public, anon, service_role;
grant execute on function public.record_consent(text, text, boolean, text)
  to authenticated;

revoke execute on function public.request_privacy_action(text, text)
  from public, anon, service_role;
grant execute on function public.request_privacy_action(text, text)
  to authenticated;

revoke execute on function public.resolve_privacy_request(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.resolve_privacy_request(uuid, text, text)
  to authenticated;

commit;
