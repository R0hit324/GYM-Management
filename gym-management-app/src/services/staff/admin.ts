/**
 * Staff administration client.
 *
 * Create / activate / deactivate are privileged operations and go through
 * the `staff-admin` Edge Function, which holds the service-role key
 * server-side. The app only ever sends its own user JWT (supabase-js adds
 * it automatically); no service key exists in the bundle.
 *
 * Deactivation has one deliberate fallback: if the Edge Function is
 * unavailable, the app calls the database authority function
 * `admin_set_staff_active(false)` directly. That function is owner + AAL2
 * gated and is the authoritative revocation, so the account is still
 * denied immediately. The result is reported honestly as
 * `sessionsBlocked: false`; the Edge-side GoTrue ban is not faked.
 *
 * If neither path works, the operation fails and the UI says so. There is
 * no client-side "assume it worked" branch.
 */
import type { StaffAccount } from '@/types/domain';
import { getSupabaseClient, type AppSupabaseClient } from '@/services/supabase/client';
import {
  hasStaffDraftErrors,
  normaliseStaffDraft,
  payloadHasRoleField,
  staffManageRefusal,
  validateStaffDraft,
  type StaffDraft,
} from '@/services/staff/rules';

export type StaffOutcome<T> =
  | { ok: true; data: T; warning?: string }
  | { ok: false; error: string };

export interface CreatedStaffAccount {
  userId: string;
  email: string;
}

export interface StaffAccessResult {
  userId: string;
  active: boolean;
  /** Present for deactivation; true only when the Edge ban was confirmed. */
  sessionsBlocked?: boolean;
}

interface EdgePayload {
  userId?: unknown;
  email?: unknown;
  active?: unknown;
  deactivated?: unknown;
  sessionsBlocked?: unknown;
  warning?: unknown;
  error?: unknown;
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'The request could not be completed.';
}

/** Read the Edge Function's JSON error without leaking anything else. */
async function edgeErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof context === 'object' && 'json' in context) {
    try {
      const body = (await (context as Response).json()) as EdgePayload;
      if (typeof body?.error === 'string' && body.error.trim()) return body.error;
    } catch {
      // Fall through to a coarse message.
    }
  }
  if (error instanceof Error && error.message && !/non-2xx|failed to send/i.test(error.message)) {
    return error.message;
  }
  return 'Staff administration is unavailable right now.';
}

async function requireClient(): Promise<AppSupabaseClient> {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Staff administration is unavailable in demo mode.');
  return client;
}

async function invokeStaffAdmin(
  client: AppSupabaseClient,
  body: Record<string, unknown>,
): Promise<StaffOutcome<EdgePayload>> {
  // Defence in depth: this flow has no role input, ever.
  if (payloadHasRoleField(body)) {
    return { ok: false, error: 'Role selection is not accepted by staff administration.' };
  }

  const { data, error } = await client.functions.invoke('staff-admin', { body });
  if (error) return { ok: false, error: await edgeErrorMessage(error) };
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'The staff service returned an unreadable response.' };
  }
  const payload = data as EdgePayload;
  const warning =
    typeof payload.warning === 'string' && payload.warning.trim() ? payload.warning : undefined;
  return { ok: true, data: payload, warning };
}

function firstDraftError(draft: StaffDraft): string | null {
  const errors = validateStaffDraft(draft);
  if (!hasStaffDraftErrors(errors)) return null;
  return (
    errors.displayName ??
    errors.email ??
    errors.phone ??
    errors.password ??
    'Check the staff details and try again.'
  );
}

/**
 * Create a Receptionist. The auth user is created by the Edge Function and
 * the profile is created by `admin_register_staff`; the role never comes
 * from the client. The temporary password is sent once and is not returned.
 */
export async function createStaffAccount(
  draft: StaffDraft,
): Promise<StaffOutcome<CreatedStaffAccount>> {
  const problem = firstDraftError(draft);
  if (problem) return { ok: false, error: problem };

  const value = normaliseStaffDraft(draft);

  try {
    const client = await requireClient();
    const outcome = await invokeStaffAdmin(client, {
      action: 'create',
      displayName: value.displayName,
      email: value.email,
      password: value.password,
      phone: value.phone || null,
    });
    if (!outcome.ok) return outcome;

    const userId = outcome.data.userId;
    const email = outcome.data.email;
    if (typeof userId !== 'string' || !userId) {
      return { ok: false, error: 'The staff service did not return the new account.' };
    }
    return {
      ok: true,
      data: {
        userId,
        email: typeof email === 'string' && email ? email : value.email,
      },
    };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}

/**
 * Activate or deactivate a receptionist.
 *
 * Activation requires the Edge Function (it must clear the GoTrue ban).
 * Deactivation is applied by the Edge Function first; if that is
 * unreachable, the database authority function is called directly so the
 * account is still revoked. `sessionsBlocked` is only true when the
 * Edge-side ban was actually confirmed.
 */
export async function setStaffActive(
  account: StaffAccount,
  active: boolean,
  actorId: string | null,
): Promise<StaffOutcome<StaffAccessResult>> {
  const refusal = staffManageRefusal(account, actorId);
  if (refusal) return { ok: false, error: refusal };
  if (typeof active !== 'boolean') {
    return { ok: false, error: 'An active flag is required.' };
  }

  try {
    const client = await requireClient();

    if (active) {
      const outcome = await invokeStaffAdmin(client, {
        action: 'activate',
        userId: account.userId,
      });
      if (!outcome.ok) return outcome;
      if (outcome.data.active !== true) {
        return { ok: false, error: 'The server did not confirm the account activation.' };
      }
      return {
        ok: true,
        data: { userId: account.userId, active: true },
        warning: outcome.warning,
      };
    }

    const edge = await invokeStaffAdmin(client, {
      action: 'deactivate',
      userId: account.userId,
    });

    if (edge.ok) {
      if (edge.data.deactivated !== true) {
        return { ok: false, error: 'The server did not confirm the account deactivation.' };
      }
      return {
        ok: true,
        data: {
          userId: account.userId,
          active: false,
          sessionsBlocked: edge.data.sessionsBlocked === true,
        },
        warning: edge.warning,
      };
    }

    // Fail-secure fallback: the database switch is the authoritative
    // revocation and does not need the service-role key.
    const { error } = await client.rpc('admin_set_staff_active', {
      p_user_id: account.userId,
      p_active: false,
    });
    if (error) {
      return {
        ok: false,
        error: `${edge.error} The database deactivation also failed: ${messageOf(error)}`,
      };
    }

    return {
      ok: true,
      data: { userId: account.userId, active: false, sessionsBlocked: false },
      warning:
        `The account is deactivated and denied by the database, but the auth-side session block ` +
        `could not be applied (${edge.error}). Existing access tokens are denied and expire normally.`,
    };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}
