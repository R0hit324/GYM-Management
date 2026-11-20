/**
 * WS-8 — consent recording client.
 *
 * The server is the only writer (see migration 0012). This module:
 *   * builds the exact consent events the join flow presents,
 *   * refuses to claim consent when no event was recorded,
 *   * never sends a user id — the RPC always binds to auth.uid(),
 *   * keeps marketing separate from mandatory documents.
 *
 * Nothing here is called in demo mode: the demo provider stores nothing,
 * so the join screen says so instead of pretending a record exists.
 */
import { getSupabaseClient, type AppSupabaseClient } from '@/services/supabase/client';
import { CONSENT_DOCUMENT_VERSIONS } from '@/constants/legal';

export type ConsentType = 'privacy_policy' | 'terms_of_service' | 'marketing';
export type ConsentSource = 'member_join' | 'member_privacy_screen';

/** The three choices shown in the join review step; all start unselected. */
export interface ConsentChoiceState {
  privacyPolicy: boolean;
  termsOfService: boolean;
  marketing: boolean;
}

export const INITIAL_JOIN_CONSENT: Readonly<ConsentChoiceState> = Object.freeze({
  privacyPolicy: false,
  termsOfService: false,
  marketing: false,
});

export interface ConsentEvent {
  type: ConsentType;
  version: string;
  accepted: boolean;
  source: ConsentSource;
}

export type ConsentFailureKind = 'unauthenticated' | 'forbidden' | 'invalid' | 'unavailable' | 'unknown';

export type ConsentWriteResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: string; kind: ConsentFailureKind; recorded: number };

export interface ConsentHistoryRecord {
  id: string;
  type: ConsentType;
  version: string;
  accepted: boolean;
  source: ConsentSource;
  recordedAt: string;
}

/** Mandatory acknowledgements that are still missing. Marketing is never included. */
export function missingMandatoryConsents(state: ConsentChoiceState): ConsentType[] {
  const missing: ConsentType[] = [];
  if (!state.privacyPolicy) missing.push('privacy_policy');
  if (!state.termsOfService) missing.push('terms_of_service');
  return missing;
}

/** The join flow may continue only when both mandatory boxes are deliberate. */
export function isJoinConsentComplete(state: ConsentChoiceState): boolean {
  return missingMandatoryConsents(state).length === 0;
}

/**
 * Build the events for the review step. Privacy and terms are always
 * recorded as accepted (the flow is gated on them); marketing is recorded
 * with the user's actual choice, so a refusal is evidence too.
 */
export function buildJoinConsentEvents(state: ConsentChoiceState): ConsentEvent[] {
  return [
    {
      type: 'privacy_policy',
      version: CONSENT_DOCUMENT_VERSIONS.privacyPolicy,
      accepted: true,
      source: 'member_join',
    },
    {
      type: 'terms_of_service',
      version: CONSENT_DOCUMENT_VERSIONS.termsOfService,
      accepted: true,
      source: 'member_join',
    },
    {
      type: 'marketing',
      version: CONSENT_DOCUMENT_VERSIONS.privacyPolicy,
      accepted: state.marketing,
      source: 'member_join',
    },
  ];
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'The consent record could not be saved.';
}

function codeOf(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) return code;
  }
  return null;
}

function classify(error: unknown): ConsentFailureKind {
  const message = messageOf(error);
  const code = codeOf(error);
  if (/not configured/i.test(message)) return 'unavailable';
  if (code === '42501' || /authentication required|insufficient role/i.test(message)) {
    return /authentication required/i.test(message) ? 'unauthenticated' : 'forbidden';
  }
  if (code === '22023' || code === '22001' || code === '23514') return 'invalid';
  return 'unknown';
}

async function requireClient(): Promise<AppSupabaseClient> {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured for this build.');
  return client;
}

/** Append one consent event for the signed-in user. */
export async function recordConsent(event: ConsentEvent): Promise<ConsentWriteResult> {
  try {
    const client = await requireClient();
    const session = await client.auth.getSession();
    if (!session.data.session) {
      return {
        ok: false,
        kind: 'unauthenticated',
        error: 'Sign in and verify your contact details before accepting the documents.',
        recorded: 0,
      };
    }

    const { data, error } = await client.rpc('record_consent', {
      p_consent_type: event.type,
      p_document_version: event.version,
      p_accepted: event.accepted,
      p_source: event.source,
    });
    if (error) {
      return { ok: false, kind: classify(error), error: messageOf(error), recorded: 0 };
    }
    return { ok: true, ids: [String(data)] };
  } catch (error) {
    return { ok: false, kind: classify(error), error: messageOf(error), recorded: 0 };
  }
}

/**
 * Append a set of events in order. Stops at the first failure and reports
 * how many were already recorded; it never reports success for the set
 * unless every event was appended.
 */
export async function recordConsents(events: ConsentEvent[]): Promise<ConsentWriteResult> {
  const ids: string[] = [];
  for (const event of events) {
    const outcome = await recordConsent(event);
    if (!outcome.ok) {
      return { ...outcome, recorded: ids.length };
    }
    ids.push(...outcome.ids);
  }
  return { ok: true, ids };
}

/** Read the signed-in user's consent history (RLS narrows it to their own rows). */
export async function listMyConsentRecords(): Promise<
  { ok: true; data: ConsentHistoryRecord[] } | { ok: false; error: string; kind: ConsentFailureKind }
> {
  try {
    const client = await requireClient();
    const session = await client.auth.getSession();
    if (!session.data.session) {
      return { ok: false, kind: 'unauthenticated', error: 'Sign in to view your consent records.' };
    }
    const { data, error } = await client
      .from('consent_records')
      .select('id, consent_type, document_version, accepted, source, recorded_at')
      .order('recorded_at', { ascending: false });
    if (error) return { ok: false, kind: classify(error), error: messageOf(error) };
    return {
      ok: true,
      data: (data ?? []).map((row) => {
        const record = row as Record<string, unknown>;
        return {
          id: String(record.id),
          type: String(record.consent_type) as ConsentType,
          version: String(record.document_version),
          accepted: Boolean(record.accepted),
          source: String(record.source) as ConsentSource,
          recordedAt: String(record.recorded_at),
        };
      }),
    };
  } catch (error) {
    return { ok: false, kind: classify(error), error: messageOf(error) };
  }
}

/** Human label used by the privacy screen. */
export function consentTypeLabel(type: ConsentType): string {
  if (type === 'privacy_policy') return 'Privacy Policy';
  if (type === 'terms_of_service') return 'Terms of Service';
  return 'Marketing messages';
}
