-- =====================================================================
-- 0008_stage5_write_paths.sql — Phase 5: remaining integration gaps
--   (member contact edit, plan lifecycle, join application submit)
--
-- Follows the conventions of 0003_authority_functions.sql exactly:
--   * SECURITY DEFINER with `set search_path = 'public'`
--   * in-function `require_role(...)` gates (authoritative profiles.role)
--   * staff authority functions additionally pass `assert_aal2()`
--   * `audit_authority` writes the append-only audit trail
--   * client EXECUTE granted to `authenticated` only (revoked from
--     public / anon / service_role)
--   * internal helpers remain owner-only (no client EXECUTE)
--
-- No existing function, policy, grant, trigger, view, seed value or
-- business rule is modified here; only additive authority functions are
-- created. Client-mutation guard (trg_client_guard) and the deferred
-- reversal cap are untouched.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 8.1 update_member_contact — receptionist [REC] (+AAL2).
--     Contact fields only: phone (required) and email (optional).
--     Membership state is never edited here.
-- ---------------------------------------------------------------------
create function public.update_member_contact(p_member_id uuid, p_phone text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_member public.members%rowtype;
begin
  perform public.require_role(array['receptionist']);
  perform public.assert_aal2();

  select * into v_member
    from public.members
   where id = p_member_id
   for update;
  if not found then
    raise exception 'Member not found.'
      using errcode = 'P0002';
  end if;

  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'Member phone is required.'
      using errcode = '55000';
  end if;
  if p_email is not null and position('@' in p_email) = 0 then
    raise exception 'Member email is not valid.'
      using errcode = '55000';
  end if;

  update public.members
    set phone      = p_phone,
        email      = p_email,
        updated_at = now()
   where id = p_member_id;

  perform public.audit_authority(
    'member.contact_updated', 'members', p_member_id,
    jsonb_build_object('phone', v_member.phone, 'email', v_member.email),
    jsonb_build_object('phone', p_phone, 'email', p_email));

  return p_member_id;
end
$$;

-- ---------------------------------------------------------------------
-- 8.2 create_plan — owner only. Validates duration and positive price;
--     currency is fixed to INR by the plans schema constraint.
-- ---------------------------------------------------------------------
create function public.create_plan(
  p_name     text,
  p_duration text,
  p_price    numeric,
  p_currency text default 'INR',
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_id uuid;
begin
  perform public.require_role(array['owner']);

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Plan name is required.'
      using errcode = '55000';
  end if;
  if p_duration is null or p_duration not in ('monthly', 'quarterly', 'halfYearly', 'yearly') then
    raise exception 'Unsupported plan duration.'
      using errcode = '55000';
  end if;
  if p_price is null or p_price <= 0 then
    raise exception 'Plan price must be positive.'
      using errcode = '55000';
  end if;
  if p_currency is distinct from 'INR' then
    raise exception 'Plan currency must be INR.'
      using errcode = '55000';
  end if;

  insert into public.plans (name, duration, price, currency, is_active)
  values (p_name, p_duration, p_price, p_currency, coalesce(p_is_active, true))
  returning id into v_id;

  perform public.audit_authority(
    'plan.created', 'plans', v_id, null,
    jsonb_build_object('name', p_name, 'duration', p_duration, 'price', p_price,
                      'currency', p_currency, 'is_active', coalesce(p_is_active, true)));

  return v_id;
end
$$;

-- ---------------------------------------------------------------------
-- 8.3 deactivate_plan — owner only. Soft deactivation
--     (is_active = false); historical memberships are never touched.
-- ---------------------------------------------------------------------
create function public.deactivate_plan(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_plan public.plans%rowtype;
begin
  perform public.require_role(array['owner']);

  select * into v_plan
    from public.plans
   where id = p_plan_id
   for update;
  if not found then
    raise exception 'Plan not found.'
      using errcode = 'P0002';
  end if;

  update public.plans
    set is_active = false,
        updated_at = now()
   where id = p_plan_id;

  perform public.audit_authority(
    'plan.deactivated', 'plans', p_plan_id, to_jsonb(v_plan),
    jsonb_build_object('is_active', false));

  return p_plan_id;
end
$$;

-- ---------------------------------------------------------------------
-- 8.4 submit_join_application — member self-submission.
--     The applicant identity is bound to auth.uid(); contact data is the
--     caller's own; state is forced to 'submitted'. The insert happens
--     only inside this SECURITY DEFINER function (no broad client INSERT
--     grant is added).
-- ---------------------------------------------------------------------
create function public.submit_join_application(
  p_full_name text,
  p_phone     text,
  p_email     text,
  p_plan_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_id uuid;
begin
  perform public.require_role(array['member']);

  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'Applicant name is required.'
      using errcode = '55000';
  end if;
  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'Applicant phone is required.'
      using errcode = '55000';
  end if;

  insert into public.join_applications
    (auth_user_id, full_name, phone, email, plan_id, state,
     phone_verified, email_verified, created_at)
  values
    (auth.uid(), p_full_name, p_phone, p_email, p_plan_id, 'submitted',
     false, false, now())
  returning id into v_id;

  perform public.audit_authority(
    'join.submitted', 'join_applications', v_id, null,
    jsonb_build_object('auth_user_id', auth.uid(), 'plan_id', p_plan_id,
                      'state', 'submitted'));

  return v_id;
end
$$;

-- ---------------------------------------------------------------------
-- 8.5 EXECUTE grants (existing convention): new authority functions are
--     available to `authenticated` only; helpers/triggers unchanged.
-- ---------------------------------------------------------------------
revoke execute on function public.update_member_contact(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.update_member_contact(uuid, text, text)
  to authenticated;

revoke execute on function public.create_plan(text, text, numeric, text, boolean)
  from public, anon, service_role;
grant execute on function public.create_plan(text, text, numeric, text, boolean)
  to authenticated;

revoke execute on function public.deactivate_plan(uuid)
  from public, anon, service_role;
grant execute on function public.deactivate_plan(uuid)
  to authenticated;

revoke execute on function public.submit_join_application(text, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.submit_join_application(text, text, text, uuid)
  to authenticated;

commit;
