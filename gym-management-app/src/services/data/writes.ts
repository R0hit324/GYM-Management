/**
 * Write layer — Phase 4, Stage 3.
 *
 * Every write goes through the ONE shared Supabase client and the verified
 * authority functions (or the authorised `payments` INSERT). The server owns
 * all decisions: money, membership arithmetic, freeze eligibility, token
 * expiry, replay refusal, AAL2 and role gates. This module never simulates a
 * success and never re-implements a business rule — it passes the caller's
 * input and returns either the server's value or its error, untranslated.
 *
 * The only client-side additions are presentation classifications used to
 * pick an honest screen state (e.g. "expired code" vs "invalid code"). The
 * raw server message is always preserved and shown.
 */
import { getSupabaseClient, type AppSupabaseClient } from '@/services/supabase/client';

import { PAYMENT_COLUMNS } from './queries';
import type { PaymentRow } from './rows';

export type WriteFailureKind =
  | 'aal2'
  | 'forbidden'
  | 'notFound'
  | 'overlap'
  | 'duplicate'
  | 'conflict'
  | 'unavailable'
  | 'unknown';

export type WriteOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string | null; kind: WriteFailureKind };

/** What a failed member scan should show, derived from the server message. */
export type CheckInFailureKind =
  | 'invalidToken'
  | 'expiredToken'
  | 'replay'
  | 'pendingPayment'
  | 'unlinked';

async function requireClient(): Promise<AppSupabaseClient> {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured for this build.');
  return client;
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'The request could not be completed.';
}

function codeOf(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) return code;
  }
  return null;
}

/**
 * Classify a server error for screen state selection only. The message is
 * never replaced — UI always keeps the server's wording.
 */
export function classifyWriteError(error: unknown): WriteFailureKind {
  const message = messageOf(error);
  const code = codeOf(error);
  if (/multi-factor authentication|AAL2/i.test(message)) return 'aal2';
  if (/self-verification|self-rejection|self-reversal|segregation of duties/i.test(message)) {
    return 'forbidden';
  }
  if (/not permitted|not authorized|Only receptionists|requires a signed-in/i.test(message)) {
    return 'forbidden';
  }
  if (code === '42501') return 'forbidden';
  if (code === 'P0002' || /not found\.?$/i.test(message)) return 'notFound';
  if (code === '23P01' || /overlap|overlapping/i.test(message)) return 'overlap';
  if (code === '23505' || /duplicate key|already exists/i.test(message)) return 'duplicate';
  if (code === '55000') return 'conflict';
  if (/Failed to fetch|Network request failed|network/i.test(message)) return 'unavailable';
  return 'unknown';
}

function failure<T>(error: unknown): WriteOutcome<T> {
  return {
    ok: false,
    error: messageOf(error),
    code: codeOf(error),
    kind: classifyWriteError(error),
  };
}

/** Map a failed check-in to the screen state the backend's rule implies. */
export function checkInFailureKind(
  outcome: Extract<WriteOutcome<unknown>, { ok: false }>,
): CheckInFailureKind | null {
  const { error } = outcome;
  if (/No member record is linked/i.test(error)) return 'unlinked';
  if (/payment is pending/i.test(error)) return 'pendingPayment';
  if (/already been used by this member/i.test(error)) return 'replay';
  if (/token has expired/i.test(error)) return 'expiredToken';
  if (/token is invalid/i.test(error)) return 'invalidToken';
  return null;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

/**
 * Member self check-in. The token is the plaintext shown by the entrance;
 * the server hashes it, checks expiry/replay and decides every state.
 * Returns the new attendance event id.
 */
export async function checkIn(
  token: string,
  door = 'main',
): Promise<WriteOutcome<string>> {
  try {
    const client = await requireClient();
    const { data, error } = await client.rpc('check_in', {
      p_token: token,
      p_door: door,
    });
    if (error) return failure(error);
    return { ok: true, data: String(data) };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Receptionist mints a one-time attendance token (AAL2 required server-side).
 * Only the plaintext token is returned here; the server stores just its hash.
 * Passing a validity lets the screen compute the same local countdown the
 * server uses; the server still enforces the 5–600 s bound.
 */
export async function mintAttendanceToken(
  validitySeconds?: number,
): Promise<WriteOutcome<string>> {
  try {
    const client = await requireClient();
    const { data, error } = await client.rpc('mint_attendance_token', {
      p_validity_seconds: validitySeconds ?? null,
    });
    if (error) return failure(error);
    if (typeof data !== 'string' || data.length === 0) {
      return {
        ok: false,
        error: 'The server did not return an attendance token.',
        code: null,
        kind: 'unknown',
      };
    }
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface RecordPaymentInput {
  memberId: string;
  planId: string;
  method: 'upi' | 'cash';
  discountPct: number;
  utr?: string;
  note?: string;
}

/**
 * Record a payment through the authorised INSERT. The 0002 override trigger
 * forces state/entry_type/attribution and computes the server-authoritative
 * prices; the returned row is what the screen must display.
 */
export async function recordPayment(
  input: RecordPaymentInput,
): Promise<WriteOutcome<PaymentRow>> {
  try {
    const client = await requireClient();
    const utr = input.utr?.trim();
    const { data, error } = await client
      .from('payments')
      .insert({
        member_id: input.memberId,
        plan_id: input.planId,
        method: input.method,
        utr: input.method === 'upi' && utr ? utr : null,
        discount_pct: input.discountPct,
        note: input.note ?? null,
      })
      .select(PAYMENT_COLUMNS)
      .single();
    if (error) return failure(error);
    return { ok: true, data: data as unknown as PaymentRow };
  } catch (error) {
    return failure(error);
  }
}

export async function verifyPayment(paymentId: string): Promise<WriteOutcome<string>> {
  try {
    const client = await requireClient();
    const { data, error } = await client.rpc('verify_payment', {
      p_payment_id: paymentId,
    });
    if (error) return failure(error);
    return { ok: true, data: String(data) };
  } catch (error) {
    return failure(error);
  }
}

export async function rejectPayment(paymentId: string): Promise<WriteOutcome<string>> {
  try {
    const client = await requireClient();
    const { data, error } = await client.rpc('reject_payment', {
      p_payment_id: paymentId,
    });
    if (error) return failure(error);
    return { ok: true, data: String(data) };
  } catch (error) {
    return failure(error);
  }
}

export async function createReversal(
  originalPaymentId: string,
  amount: number,
  note?: string,
): Promise<WriteOutcome<string>> {
  try {
    const client = await requireClient();
    const { data, error } = await client.rpc('create_reversal', {
      p_original_payment_id: originalPaymentId,
      p_amount: amount,
      p_note: note?.trim() ? note.trim() : null,
    });
    if (error) return failure(error);
    return { ok: true, data: String(data) };
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Owner writes
// ---------------------------------------------------------------------------

export async function updatePlanPrice(
  planId: string,
  price: number,
): Promise<WriteOutcome<string>> {
  try {
    const client = await requireClient();
    const { data, error } = await client.rpc('update_plan_price', {
      p_plan_id: planId,
      p_price: price,
    });
    if (error) return failure(error);
    return { ok: true, data: String(data) };
  } catch (error) {
    return failure(error);
  }
}

export interface UpdateGymSettingsInput {
  gymTimezone?: string;
  upiId?: string | null;
  attendanceTokenValiditySeconds?: number;
}

export async function updateGymSettings(
  input: UpdateGymSettingsInput,
): Promise<WriteOutcome<string>> {
  try {
    const client = await requireClient();
    const { data, error } = await client.rpc('update_gym_settings', {
      p_gym_timezone: input.gymTimezone ?? null,
      p_upi_id: input.upiId ?? null,
      p_upi_qr_path: null, // Not used by the app — server only
      p_attendance_token_validity_seconds: input.attendanceTokenValiditySeconds ?? null,
    });
    if (error) return failure(error);
    return { ok: true, data: String(data) };
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Freezes
// ---------------------------------------------------------------------------

export async function requestFreeze(
  memberId: string,
  startDate: string,
  endDate: string,
  reason: string,
): Promise<WriteOutcome<string>> {
  try {
    const client = await requireClient();
    const { data, error } = await client.rpc('request_freeze', {
      p_member_id: memberId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_reason: reason,
    });
    if (error) return failure(error);
    return { ok: true, data: String(data) };
  } catch (error) {
    return failure(error);
  }
}

export async function decideFreeze(
  freezeId: string,
  approve: boolean,
): Promise<WriteOutcome<string>> {
  try {
    const client = await requireClient();
    const { data, error } = await client.rpc('decide_freeze', {
      p_freeze_id: freezeId,
      p_approve: approve,
    });
    if (error) return failure(error);
    return { ok: true, data: String(data) };
  } catch (error) {
    return failure(error);
  }
}

export async function endFreeze(freezeId: string): Promise<WriteOutcome<string>> {
  try {
    const client = await requireClient();
    const { data, error } = await client.rpc('end_freeze', {
      p_freeze_id: freezeId,
    });
    if (error) return failure(error);
    return { ok: true, data: String(data) };
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Owner follow-up events (INSERT)
// ---------------------------------------------------------------------------

export type FollowUpChannel = 'called' | 'messaged' | 'visited';
export type FollowUpOutcome = 'won' | 'lost' | 'open';

export interface RecordFollowUpInput {
  /** The acting staff member's id (their authenticated user id). The RLS
   *  WITH CHECK requires `actor = auth.uid()`, so the client sends the
   *  session identity and the server enforces the equality. */
  actor: string;
  memberId: string;
  channel: FollowUpChannel;
  outcome: FollowUpOutcome;
  note?: string;
}

/**
 * Record a follow-up event (lost-member follow-up / won-back tracking).
 * Direct INSERT into follow_up_events (authenticated INSERT grant; the
 * followups_insert_staff RLS policy requires the staff role and
 * `actor = auth.uid()`). The server stamps `created_at`; corrections are new
 * rows, never edits (the client-mutation guard blocks UPDATE/DELETE).
 */
export async function recordFollowUp(
  input: RecordFollowUpInput,
): Promise<WriteOutcome<string>> {
  try {
    const client = await requireClient();
    const { data, error } = await client
      .from('follow_up_events')
      .insert({
        actor: input.actor,
        member_id: input.memberId,
        channel: input.channel,
        outcome: input.outcome,
        note: input.note?.trim() ? input.note.trim() : null,
      })
      .select('id')
      .single();
    if (error) return failure(error);
    return { ok: true, data: String(data?.id) };
  } catch (error) {
    return failure(error);
  }
}
