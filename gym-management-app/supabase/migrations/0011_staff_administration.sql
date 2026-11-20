-- =====================================================================
-- 0011_staff_administration.sql
-- Production Readiness — Stage 2B, WS-5: secure staff administration.
--
-- Why this exists:
--   `profiles` is the authoritative authorisation source and is
--   service-only for writes (0002). Before this migration there was no
--   supported way for the Owner to create a Receptionist account, review
--   the staff directory, or revoke a staff member's access. Staff were
--   provisioned by hand in the dashboard, which is an operational gap.
--
-- What this migration adds (and nothing else):
--   1. `profiles.is_active` — a durable authorisation switch. An inactive
--      profile resolves to NULL through `app_profile_role()` and is
--      refused by `require_role()`, so every RLS policy and every
--      authority function denies it immediately. Deactivation is
--      therefore a database-level authorisation revocation, not a
--      client-side hint.
--   2. Owner-gated, AAL2-gated staff administration functions:
--        admin_staff_assert()                 internal guard
--        admin_staff_directory()              owner-only directory read
--        admin_register_staff(uuid,text,text) profile creation, role
--                                             HARD-CODED to receptionist
--        admin_set_staff_active(uuid,boolean) activate/deactivate a
--                                             receptionist (never self,
--                                             never an owner/member)
--        admin_record_staff_sessions_blocked  audit acknowledgement for
--                                             the server-side ban
--   3. Least-privilege grants: authenticated EXECUTE only; anon and
--      service_role have no EXECUTE. The internal guard is owner-only.
--
-- What this migration deliberately does NOT do:
--   * It does not create auth users. Password/email creation is a GoTrue
--     admin operation and lives in the `staff-admin` Edge Function, which
--     uses the server-side service-role key. The app never holds a
--     service-role key.
--   * It does not add an owner-creation or role-change path. The role is
--     a literal `'receptionist'` in `admin_register_staff`; there is no
--     role parameter to escalate. `profiles_role_guard` and the
--     service-only grants from 0002 remain in force.
--   * It does not weaken MFA/AAL2. Every administrative function calls
--     `assert_aal2()`; staff sign-in still reaches AAL2 through a
--     verified TOTP factor (the app now supports first-time enrolment).
--
-- Session revocation note:
--   GoTrue exposes no "logout this user's sessions" admin endpoint. The
--   Edge Function applies a long `ban_duration` (which blocks new tokens
--   and refresh) and this database switch denies every request from an
--   already-issued token as soon as it is read. That is the strongest
--   revocation this stack supports; it is documented honestly in the
--   WS-5 report rather than claimed as an instant token wipe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Durable authorisation switch
-- ---------------------------------------------------------------------
alter table public.profiles
  add column is_active boolean not null default true;

comment on column public.profiles.is_active is
  'Authorisation switch owned by service_role/owner admin functions. false denies every RLS policy and authority function for this profile immediately.';

create index profiles_active_role_idx on public.profiles (is_active, role);

-- ---------------------------------------------------------------------
-- 2. Make the existing authorisation helpers honour is_active
--    (CREATE OR REPLACE keeps the same signatures, ACLs and owners.)
-- ---------------------------------------------------------------------
create or replace function public.app_profile_role() returns text
language sql
stable
security definer
set search_path = 'public'
as $$
  select p.role
    from public.profiles p
   where p.id = auth.uid()
     and p.is_active
$$;

comment on function public.app_profile_role() is
  'Returns the authoritative active profiles.role for auth.uid(), or NULL when no active profile exists (default deny). Inactive accounts resolve to NULL, so every RLS policy denies them.';

create or replace function public.require_role(p_allowed text[]) returns text
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid;
  v_role  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;
  select p.role into v_role
    from public.profiles p
   where p.id = v_actor
     and p.is_active;
  if v_role is null or not (v_role = any (p_allowed)) then
    raise exception 'Insufficient role for this operation.'
      using errcode = '42501';
  end if;
  return v_role;
end
$$;

comment on function public.require_role(text[]) is
  'Authoritative role gate: reads an ACTIVE profiles.role for auth.uid() (never JWT claims) and refuses unless allowed. Inactive accounts are denied.';

revoke execute on function public.app_profile_role()
  from public, anon, service_role;
grant execute on function public.app_profile_role() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Internal guard — owner + AAL2, returns the acting user id
-- ---------------------------------------------------------------------
create function public.admin_staff_assert() returns uuid
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;
  -- require_role resolves the ACTIVE role from profiles, not from the JWT.
  perform public.require_role(array['owner']);
  perform public.assert_aal2();
  return v_actor;
end
$$;

comment on function public.admin_staff_assert() is
  'Internal staff-administration guard: authenticated owner at AAL2. Returns the actor id. No client EXECUTE.';

-- ---------------------------------------------------------------------
-- 4. Staff directory — owner-only inspection
--    Email and last sign-in live in auth.users (profiles is a mirror).
--    The function is SECURITY DEFINER so the owner can read the mirror
--    fields without a second auth client. No secrets are selected.
-- ---------------------------------------------------------------------
create function public.admin_staff_directory()
returns table (
  user_id          uuid,
  display_name     text,
  role             text,
  email            text,
  phone            text,
  is_active        boolean,
  created_at       timestamptz,
  last_sign_in_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  perform public.admin_staff_assert();

  return query
    select p.id,
           p.display_name,
           p.role,
           lower(coalesce(u.email, ''))::text,
           p.phone,
           p.is_active,
           p.created_at,
           u.last_sign_in_at
      from public.profiles p
      left join auth.users u on u.id = p.id
     where p.role in ('owner', 'receptionist')
     order by case p.role when 'owner' then 0 else 1 end,
              p.display_name;
end
$$;

comment on function public.admin_staff_directory() is
  'Owner + AAL2 staff directory (owners and receptionists only). Reads auth.users email/last_sign_in_at through definer rights; never returns a key or token.';

-- ---------------------------------------------------------------------
-- 5. Register a receptionist profile
--    The auth user already exists (created by the staff-admin Edge
--    Function with the service-role key). This function creates ONLY the
--    mirror profile and hard-codes the role. It cannot create an owner,
--    promote anyone, or touch an existing profile.
-- ---------------------------------------------------------------------
create function public.admin_register_staff(
  p_user_id      uuid,
  p_display_name text,
  p_phone        text default null
) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor      uuid;
  v_name       text;
  v_phone      text;
begin
  v_actor := public.admin_staff_assert();

  if p_user_id is null then
    raise exception 'A staff auth user id is required.'
      using errcode = '55000';
  end if;

  v_name := btrim(coalesce(p_display_name, ''));
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Staff display name must be between 2 and 120 characters.'
      using errcode = '55000';
  end if;

  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  if v_phone is not null and length(v_phone) > 32 then
    raise exception 'Staff phone number is too long.'
      using errcode = '55000';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'The auth account does not exist.'
      using errcode = 'P0002';
  end if;

  if exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'This account already has a profile.'
      using errcode = '55000';
  end if;

  -- A linked member account must never be repurposed as staff.
  if exists (select 1 from public.members m where m.auth_user_id = p_user_id) then
    raise exception 'This auth account is linked to a member record.'
      using errcode = '42501';
  end if;

  insert into public.profiles (id, display_name, role, phone, is_active)
  values (p_user_id, v_name, 'receptionist', v_phone, true);

  perform public.audit_authority(
    'staff.created', 'profiles', p_user_id, null,
    jsonb_build_object(
      'role', 'receptionist',
      'display_name', v_name,
      'is_active', true));

  return p_user_id;
end
$$;

comment on function public.admin_register_staff(uuid, text, text) is
  'Owner + AAL2: create the profile mirror for an EXISTING auth user. Role is the literal receptionist; there is no role parameter and no promotion path.';

-- ---------------------------------------------------------------------
-- 6. Activate / deactivate a receptionist
--    * self-target refused (no self-deactivation / lockout)
--    * owner and member targets refused (an owner can never be
--      deactivated or modified through staff administration)
--    * idempotent with no audit row when nothing changes
-- ---------------------------------------------------------------------
create function public.admin_set_staff_active(
  p_user_id uuid,
  p_active  boolean
) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor   uuid;
  v_profile public.profiles%rowtype;
begin
  v_actor := public.admin_staff_assert();

  if p_user_id is null then
    raise exception 'A staff user id is required.'
      using errcode = '55000';
  end if;
  if p_active is null then
    raise exception 'An active flag is required.'
      using errcode = '55000';
  end if;

  if p_user_id = v_actor then
    raise exception 'You cannot change the status of your own account.'
      using errcode = '42501';
  end if;

  select * into v_profile
    from public.profiles
   where id = p_user_id
   for update;
  if not found then
    raise exception 'Staff account not found.'
      using errcode = 'P0002';
  end if;

  if v_profile.role <> 'receptionist' then
    raise exception 'Only receptionist accounts can be activated or deactivated.'
      using errcode = '42501';
  end if;

  if v_profile.is_active = p_active then
    return v_profile.id;
  end if;

  update public.profiles
     set is_active = p_active,
         updated_at = now()
   where id = v_profile.id
     and is_active = v_profile.is_active;
  if not found then
    raise exception 'Staff account was changed concurrently.'
      using errcode = '55000';
  end if;

  perform public.audit_authority(
    case when p_active then 'staff.activated' else 'staff.deactivated' end,
    'profiles', v_profile.id,
    jsonb_build_object('is_active', v_profile.is_active),
    jsonb_build_object('is_active', p_active, 'role', v_profile.role));

  return v_profile.id;
end
$$;

comment on function public.admin_set_staff_active(uuid, boolean) is
  'Owner + AAL2: activate/deactivate a receptionist profile. Refuses self and any owner/member target. is_active=false denies the account immediately through app_profile_role/require_role.';

-- ---------------------------------------------------------------------
-- 7. Audit acknowledgement for the server-side session block
--    The ban itself is a GoTrue admin action in the Edge Function. This
--    function records that the block was applied, so the audit trail
--    matches the auth-side action. It changes no profile state.
-- ---------------------------------------------------------------------
create function public.admin_record_staff_sessions_blocked(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid;
  v_role  text;
begin
  v_actor := public.admin_staff_assert();

  select p.role into v_role
    from public.profiles p
   where p.id = p_user_id;
  if v_role is null then
    raise exception 'Staff account not found.'
      using errcode = 'P0002';
  end if;
  if v_role <> 'receptionist' then
    raise exception 'Only receptionist sessions can be blocked.'
      using errcode = '42501';
  end if;

  perform public.audit_authority(
    'staff.sessions_blocked', 'profiles', p_user_id, null,
    jsonb_build_object(
      'method', 'gotrue_ban',
      'note', 'Existing access tokens are denied by profiles.is_active; refresh and new sign-in are blocked.'));

  return p_user_id;
end
$$;

comment on function public.admin_record_staff_sessions_blocked(uuid) is
  'Owner + AAL2: audit acknowledgement that the GoTrue ban was applied for a receptionist. Changes no profile state.';

-- ---------------------------------------------------------------------
-- 8. Least-privilege ACLs
--    RPC surface: authenticated ONLY (in-function owner + AAL2 gates).
--    The internal guard has no client EXECUTE at all.
-- ---------------------------------------------------------------------
revoke execute on function public.admin_staff_assert()
  from public, anon, authenticated, service_role;

revoke execute on function public.admin_staff_directory()
  from public, anon, service_role;
grant execute on function public.admin_staff_directory() to authenticated;

revoke execute on function public.admin_register_staff(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.admin_register_staff(uuid, text, text)
  to authenticated;

revoke execute on function public.admin_set_staff_active(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.admin_set_staff_active(uuid, boolean)
  to authenticated;

revoke execute on function public.admin_record_staff_sessions_blocked(uuid)
  from public, anon, service_role;
grant execute on function public.admin_record_staff_sessions_blocked(uuid)
  to authenticated;

commit;
