/**
 * WS-8 — privacy request client.
 *
 * A request is a reviewed workflow record, not an automated erasure or
 * export. Intake and resolution are server functions; the tables are
 * read-only to clients. This module never deletes or exports data.
 */
import { getSupabaseClient } from '@/services/supabase/client';

export type PrivacyRequestType =
  | 'account_deletion'
  | 'data_export'
  | 'data_correction'
  | 'privacy_inquiry';

export type PrivacyRequestState =
  | 'submitted'
  | 'in_review'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type PrivacyResolutionState = 'in_review' | 'completed' | 'rejected';

export interface PrivacyRequestRecord {
  id: string;
  authUserId: string;
  requestType: PrivacyRequestType;
  details: string | null;
  state: PrivacyRequestState;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type PrivacyFailureKind = 'unauthenticated' | 'forbidden' | 'invalid' | 'unavailable' | 'unknown';

export type PrivacyResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: PrivacyFailureKind };

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'The privacy request could not be completed.';
}

function codeOf(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) return code;
  }
  return null;
}

function classify(error: unknown): PrivacyFailureKind {
  const message = messageOf(error);
  const code = codeOf(error);
  if (/not configured/i.test(message)) return 'unavailable';
  if (code === '42501' || /authentication required|insufficient role|multi-factor/i.test(message)) {
    return /authentication required/i.test(message) ? 'unauthenticated' : 'forbidden';
  }
  if (code === '22023' || code === '22001' || code === '23514' || code === '55000' || code === 'P0002') {
    return 'invalid';
  }
  return 'unknown';
}

function mapRow(row: Record<string, unknown>): PrivacyRequestRecord {
  return {
    id: String(row.id),
    authUserId: String(row.auth_user_id),
    requestType: String(row.request_type) as PrivacyRequestType,
    details: row.details === null || row.details === undefined ? null : String(row.details),
    state: String(row.state) as PrivacyRequestState,
    resolutionNote:
      row.resolution_note === null || row.resolution_note === undefined
        ? null
        : String(row.resolution_note),
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at === null || row.resolved_at === undefined ? null : String(row.resolved_at),
  };
}

export function privacyRequestTypeLabel(type: PrivacyRequestType): string {
  if (type === 'account_deletion') return 'Account deletion';
  if (type === 'data_export') return 'Copy of my data';
  if (type === 'data_correction') return 'Correct my details';
  return 'Privacy question';
}

export function privacyRequestStateLabel(state: PrivacyRequestState): string {
  if (state === 'submitted') return 'Submitted';
  if (state === 'in_review') return 'In review';
  if (state === 'completed') return 'Completed';
  if (state === 'rejected') return 'Rejected';
  return 'Cancelled';
}

/** Member-initiated request. The server binds it to auth.uid(). */
export async function requestPrivacyAction(
  type: PrivacyRequestType,
  details?: string | null,
): Promise<PrivacyResult<string>> {
  try {
    const client = await getSupabaseClient();
    if (!client) return { ok: false, kind: 'unavailable', error: 'Supabase is not configured for this build.' };
    const session = await client.auth.getSession();
    if (!session.data.session) {
      return {
        ok: false,
        kind: 'unauthenticated',
        error: 'Sign in before submitting a privacy request.',
      };
    }
    const trimmed = details?.trim();
    const { data, error } = await client.rpc('request_privacy_action', {
      p_request_type: type,
      p_details: trimmed ? trimmed : null,
    });
    if (error) return { ok: false, kind: classify(error), error: messageOf(error) };
    return { ok: true, data: String(data) };
  } catch (error) {
    return { ok: false, kind: classify(error), error: messageOf(error) };
  }
}

async function listRequests(ownOnly: boolean): Promise<PrivacyResult<PrivacyRequestRecord[]>> {
  try {
    const client = await getSupabaseClient();
    if (!client) return { ok: false, kind: 'unavailable', error: 'Supabase is not configured for this build.' };
    const session = await client.auth.getSession();
    if (!session.data.session) {
      return { ok: false, kind: 'unauthenticated', error: 'Sign in to view privacy requests.' };
    }

    let query = client
      .from('privacy_requests')
      .select('id, auth_user_id, request_type, details, state, resolution_note, created_at, resolved_at')
      .order('created_at', { ascending: false });

    if (ownOnly) {
      query = query.eq('auth_user_id', session.data.session.user.id);
    }

    const { data, error } = await query;
    if (error) return { ok: false, kind: classify(error), error: messageOf(error) };
    return { ok: true, data: (data ?? []).map((row) => mapRow(row as Record<string, unknown>)) };
  } catch (error) {
    return { ok: false, kind: classify(error), error: messageOf(error) };
  }
}

/** The signed-in user's own queue (RLS plus an explicit own-user filter). */
export async function listMyPrivacyRequests(): Promise<PrivacyResult<PrivacyRequestRecord[]>> {
  return listRequests(true);
}

/** Owner queue (RLS allows the Owner; a member gets only their own rows). */
export async function listAllPrivacyRequests(): Promise<PrivacyResult<PrivacyRequestRecord[]>> {
  return listRequests(false);
}

/** Owner + AAL2 workflow status update. Does not erase or export anything. */
export async function resolvePrivacyRequest(
  requestId: string,
  state: PrivacyResolutionState,
  note?: string | null,
): Promise<PrivacyResult<string>> {
  try {
    const client = await getSupabaseClient();
    if (!client) return { ok: false, kind: 'unavailable', error: 'Supabase is not configured for this build.' };
    const trimmed = note?.trim();
    const { data, error } = await client.rpc('resolve_privacy_request', {
      p_request_id: requestId,
      p_state: state,
      p_note: trimmed ? trimmed : null,
    });
    if (error) return { ok: false, kind: classify(error), error: messageOf(error) };
    return { ok: true, data: String(data) };
  } catch (error) {
    return { ok: false, kind: classify(error), error: messageOf(error) };
  }
}
