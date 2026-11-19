-- =====================================================================
-- seed.sql — local development seed (Phase 4, Stage 1)
-- ---------------------------------------------------------------------
-- Applied by `supabase db reset` after migrations (see supabase/config.toml
-- `[db.seed] sql_paths = ["./seed.sql"]`).
--
-- Scope: exactly the rows the backend needs to initialise:
--   1. the app_settings singleton (id = 1) — required by
--      app_gym_date(), mint_attendance_token() and update_gym_settings();
--   2. the four membership plans configured in the app's plan catalogue.
--
-- Idempotent: re-running is a no-op. Never touches profiles, members,
-- payments or any transactional data — those are created only through the
-- authority functions / application flow.
--
-- Local only. No remote database is touched by this file.
-- =====================================================================

begin;

-- 1. app_settings singleton ------------------------------------------------
-- Defaults: Asia/Kolkata, 60 s attendance-token validity (0001 defaults).
insert into public.app_settings (id) values (1)
on conflict (id) do nothing;

-- 2. membership plans ------------------------------------------------------
-- Stable ids keep the local baseline reproducible. Names/durations mirror
-- the app catalogue in src/data/demo.ts.
insert into public.plans (id, name, duration, price, is_active) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Monthly',    'monthly',    1200.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Quarterly',  'quarterly',  3000.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Half yearly', 'halfYearly', 5500.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Yearly',     'yearly',     9600.00, true)
on conflict (id) do nothing;

commit;
