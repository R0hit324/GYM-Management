-- =====================================================================
-- 0013_receipt_storage_insert_path_check.sql
-- Stage 2H: database-level receipt storage INSERT path-shape validation.
--
-- Adds a WITH CHECK constraint on the `receipts` INSERT policy so that the
-- expected object path shape (`{member_uuid}/{payment_uuid}.pdf`) is enforced
-- at the database/storage-policy level, not only via application-side validation.
--
-- Forward-only, clean-reset compatible. No historical migration is rewritten.

begin;

drop policy if exists receipts_insert_receptionist on storage.objects;

create policy receipts_insert_receptionist on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.app_profile_role() = 'receptionist'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  );

commit;
