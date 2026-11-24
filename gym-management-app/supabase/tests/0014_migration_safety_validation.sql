-- =====================================================================
-- tests/0014_migration_safety_validation.sql
-- Batch R-2 (M3) — Migration safety regression suite (MIGRATION SAFETY).
--
-- Batch R-2 authorization scope: migration reapplication / partial-failure
-- safety remediation (finding M3). Historical migrations (0001-0013) are
-- immutable and were NOT modified by this batch.
--
-- This suite is authored to the established validation-suite pattern
-- (see supabase/tests/0009_receipt_issuance_validation.sql):
--   * suite_results schema + check_fail / check_ok / check_true helpers
--   * fixture prefix 3b4 (reserved for Batch R-2 fixtures)
--   * per-assertion result rows
--   * cleanup + verdict (fail -> raise; pass -> raise notice)
--
-- Assertions (catalog-level, safe on a freshly reset local stack):
--   T-01 migration history table present
--   T-02 core schema table (public.profiles, migration 0001 artifact) present
--   T-03 authority function (public.verify_payment(uuid), migration 0003) present
--   T-04 storage INSERT policy receipts_insert_receptionist (migration 0013 artifact) present
--
-- NOTE (Batch R-2 scope): assertions that require executing a migration twice
-- or forcing a partial failure are intentionally NOT fabricated here; the
-- reapplication guard is the Supabase migration-history mechanism
-- (supabase_migrations.schema_migrations + `supabase db push` skip behaviour),
-- and partial-failure semantics for already-applied migrations cannot be
-- re-tested without rewriting immutable history (out of scope for R-2).
-- =====================================================================

drop schema if exists suite_results cascade;
create schema suite_results;

create table suite_results.t_results (
  num    text,
  label  text,
  passed boolean,
  detail text
);
grant usage on schema suite_results to public;
grant all on suite_results.t_results to public;

create function suite_results.check_fail(
  p_num text, p_label text, p_stmt text, p_want_sqlstate text, p_want_err text default null
) returns void language plpgsql as $cf$
declare
  v_ok     boolean;
  v_detail text;
  v_state  text;
  v_msg    text;
begin
  begin
    execute p_stmt;
    v_ok := false;
    v_detail := 'statement unexpectedly succeeded';
  exception when others then
    get stacked diagnostics v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    if left(v_state, 2) <> left(p_want_sqlstate, 2) then
      v_ok := false;
      v_detail := format('SQLSTATE %s (wanted %s): %s', v_state, p_want_sqlstate, v_msg);
    elsif p_want_err is not null and position(lower(p_want_err) in lower(v_msg)) = 0 then
      v_ok := false;
      v_detail := format('wrong violation (SQLSTATE %s, wanted "%s" in message): %s',
                         v_state, p_want_sqlstate, v_msg);
    else
      v_ok := true;
      v_detail := format('rejected as expected (SQLSTATE %s): %s', v_state, v_msg);
    end if;
  end;
  insert into suite_results.t_results values (p_num, p_label, v_ok, v_detail);
end $cf$;

create function suite_results.check_ok(p_num text, p_label text, p_stmt text)
returns void language plpgsql as $co$
declare
  v_ok     boolean;
  v_detail text;
  v_msg    text;
  v_rows   bigint;
begin
  begin
    execute p_stmt;
    get diagnostics v_rows = ROW_COUNT;
    if v_rows = 0 then
      v_ok := false;
      v_detail := 'statement matched no rows (vacuous pass rejected)';
    else
      v_ok := true;
      v_detail := format('accepted as expected (%s row(s))', v_rows);
    end if;
  exception when others then
    get stacked diagnostics v_msg = MESSAGE_TEXT;
    v_ok := false;
    v_detail := format('expected success, got error: %s', v_msg);
  end;
  insert into suite_results.t_results values (p_num, p_label, v_ok, v_detail);
end $co$;

create function suite_results.check_true(p_num text, p_label text, p_ok boolean, p_detail text)
returns void language plpgsql as $ct$
begin
  insert into suite_results.t_results
  values (p_num, p_label, coalesce(p_ok, false),
          case when p_ok is null
               then 'NULL condition (treated as FAIL): ' || coalesce(p_detail, '')
               else p_detail end);
end $ct$;

grant execute on function suite_results.check_fail(text,text,text,text,text) to public;
grant execute on function suite_results.check_ok(text,text,text) to public;
grant execute on function suite_results.check_true(text,text,boolean,text) to public;

-- =====================================================================
-- Migration-safety assertions (Batch R-2 / M3)
-- =====================================================================
-- T-01: migration history table is present and queryable.
select suite_results.check_true(
  '01', 'migration history table supabase_migrations.schema_migrations is queryable',
  exists (select 1 from information_schema.tables t
          where t.table_schema = 'supabase_migrations' and t.table_name = 'schema_migrations'),
  'supabase_migrations.schema_migrations not found');

-- T-02: core schema table from migration 0001 exists (history/schema consistency).
select suite_results.check_true(
  '02', 'core schema table public.profiles exists (migration 0001 artifact present)',
  to_regclass('public.profiles') is not null,
  'public.profiles missing');

-- T-03: authority function from migration 0003 exists (uuid-arg overload).
select suite_results.check_true(
  '03', 'authority function public.verify_payment(uuid) exists (migration 0003 artifact present)',
  exists (select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'verify_payment'),
  'public.verify_payment(uuid) missing');

-- T-04: storage INSERT policy from migration 0013 exists (policy artifact present).
select suite_results.check_true(
  '04', 'storage INSERT policy receipts_insert_receptionist exists (migration 0013 artifact present)',
  exists (select 1 from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname = 'receipts_insert_receptionist'),
  'storage policy receipts_insert_receptionist missing');

-- =====================================================================
-- Cleanup and verdict
-- =====================================================================
select num, passed, label, detail
  from suite_results.t_results
 where not passed
 order by num;

do $v$
declare
  v_total integer;
  v_fail  integer;
begin
  select count(*), count(*) filter (where not passed)
    into v_total, v_fail
    from suite_results.t_results;

  raise notice '0014 migration safety validation: % of % assertions passed', v_total - v_fail, v_total;

  if v_fail > 0 then
    raise exception '0014 MIGRATION SAFETY VALIDATION FAILED: % of % assertions failed', v_fail, v_total;
  end if;
end
$v$;

drop schema suite_results cascade;
