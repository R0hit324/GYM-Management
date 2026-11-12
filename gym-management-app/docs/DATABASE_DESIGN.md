# Database Design (Part 1 — Mock/Prototype)

## Note
Part 1 has **no real database**. This doc documents the **projected schema** for Parts 2-3 when a backend (Supabase/SQLite/EAS Backup) is introduced.

## Entity Relationship Overview

### Members
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | Auto-generated |
| `name` | Text | Member full name |
| `email` | Text | Unique, lowercase |
| `phone` | Text | Optional |
| `subscription_status` | Enum: `active`, `frozen`, `expired` | Default `active` |
| `subscription_start` | Timestamptz | |
| `subscription_end` | Timestamptz | |
| `freeze_until` | Timestamptz | Null when not frozen |
| `created_at` | Timestamptz | |
| `updated_at` | Timestamptz | |

### CheckIns (Attendance)
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | |
| `member_id` | UUID (FK → members.id) | |
| `checked_in_at` | Timestamptz | |
| `door` | Boolean | Entry/exit flag |
| `status` | Enum: `verified`, `frozen`, `failed` | |
| `created_at` | Timestamptz | |

### Payments
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | |
| `member_id` | UUID (FK → members.id) | |
| `amount` | Numeric | In currency minor units |
| `upi_transaction_id` | Text | Optional, for UPI QR flow |
| `status` | Enum: `completed`, `pending`, `reversed` | Reversals never edit original |
| `recorded_at` | Timestamptz | |
| `receipt_path` | Text | Path to stored receipt |

### MembershipFreezes
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | |
| `member_id` | UUID (FK → members.id) | |
| `starts_at` | Timestamptz | |
| `ends_at` | Timestamptz | |
| `approved_by` | UUID (FK → staff/users) | Null until approved |
| `status` | Enum: `pending`, `approved`, `rejected` | |

### Staff/Users (for freeze approval, audit)
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | |
| `name` | Text | |
| `role` | Enum: `receptionist`, `owner` | |
| `created_at` | Timestamptz | |

## Key Constraints (Projected)
- **No partial payments**: A payment is either `completed` or not; no halfway states.
- **Inactivity = 30 consecutive days**: Queried via `check-ins` count where `checked_in_at` falls within a 30-day window per member; if zero, flag lost.
- **Freeze extends validity**: `subscription_end` is pushed by `ends_at - freeze_until` on approval.
- **Reversals not edits**: `payments` table — `status` changed to `reversed`; original row kept; new reversal row inserted.
- **UPI QR ≠ attendance QR**: Separate tables/columns; different validation logic.

## Projected Supabase (Part 2+)
- RLS policies per role:
  - Members: SELECT/INSERT own check-ins, own payments.
  - Receptionists: SELECT all check-ins, INSERT payments, UPDATE membership status.
  - Owners: Full DML on all tables.
- **QR tokens**: Time-limited signed URLs for attendance check-in; separate from UPI payment QR.
- **Audit logging**: All state changes (`payments.status` flips, `membership_status` updates) logged with actor, timestamp, old/new value.