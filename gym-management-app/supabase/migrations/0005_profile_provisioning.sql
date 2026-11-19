-- =====================================================================
-- 0005_profile_provisioning.sql
-- Phase 4, Stage 1 — live auth / profile provisioning.
--
-- Why this exists:
--   `profiles` is a 1:1 mirror of auth.users and is service-only for
--   writes (0002: INSERT to service_role, UPDATE to service_role, and the
--   client-mutation guard on every table). A self-registering member
--   therefore has no client path to create their own profile row, which
--   would leave every RLS policy default-denying them forever.
--
--   This migration adds ONE narrowly-scoped path:
--
--     provision_member_profile(display_name, phone)
--
--   It can only create the caller's OWN profile, and only with the
--   hard-coded role 'member'. It is idempotent and never changes an
--   existing profile — in particular it can never elevate a role, so it
--   adds no privilege-escalation surface. Staff (receptionist / owner)
--   profiles remain service-created / service-updated, exactly as the
--   authoritative role model requires.
--
--   No table grants, policies or triggers change. No auth.users trigger is
--   added, so the validation suites' direct auth.users fixtures are
--   unaffected.
-- =====================================================================

begin;

create function public.provision_member_profile(
  p_display_name text default null,
  p_phone        text default null
) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_role  text;
  v_name  text;
  v_phone text;
begin
  if v_actor is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  -- Existing profile: return it untouched. Role is immutable here.
  select p.role into v_role
    from public.profiles p
    where p.id = v_actor;
  if v_role is not null then
    return v_actor;
  end if;

  v_name  := nullif(btrim(coalesce(p_display_name, '')), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');

  -- Hard-coded 'member': a self-provisioned profile can never be staff.
  insert into public.profiles (id, display_name, role, phone)
  values (v_actor, coalesce(v_name, 'Member'), 'member', v_phone)
  on conflict (id) do nothing;

  perform public.audit_authority(
    'profile.provisioned', 'profiles', v_actor, null,
    jsonb_build_object('role', 'member'));

  return v_actor;
end
$$;

-- Least privilege: authenticated only; no PUBLIC / anon / service_role.
revoke execute on function public.provision_member_profile(text, text)
  from public, anon, service_role;
grant execute on function public.provision_member_profile(text, text)
  to authenticated;

commit;
