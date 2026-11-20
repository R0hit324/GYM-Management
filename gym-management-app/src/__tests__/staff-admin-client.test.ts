/**
 * WS-5 — staff administration client.
 *
 * The Edge Function and RPC are mocked: no network, no service-role key, no
 * real auth user. These tests prove the client:
 *   * never sends a role field,
 *   * reports server refusals instead of inventing success,
 *   * falls back to the database revocation when the Edge Function is down,
 *   * reports honestly when neither path works,
 *   * refuses self/owner targets before any call.
 *
 * Authority itself is server-side (Edge Function + SQL functions); these
 * are the client-side contracts only.
 */
import type { AppSupabaseClient } from '@/services/supabase/client';
import { getSupabaseClient } from '@/services/supabase/client';
import {
  createStaffAccount,
  setStaffActive,
  type StaffDraft,
} from '@/services/staff';
import type { StaffAccount } from '@/types/domain';

jest.mock('@/services/supabase/client', () => ({
  getSupabaseClient: jest.fn(),
}));

const mockedGetClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>;

const OWNER_ID = 'owner-1111';

const validDraft: StaffDraft = {
  displayName: '  Front   Desk ',
  email: ' FRONT@Example.COM ',
  phone: ' +919811000001 ',
  password: 'Pulse#Front1',
};

function makeAccount(overrides: Partial<StaffAccount> = {}): StaffAccount {
  return {
    userId: 'rec-2222',
    displayName: 'Front Desk',
    role: 'receptionist',
    email: 'front@example.com',
    phone: '+919811000001',
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    lastSignInAt: null,
    ...overrides,
  };
}

function makeClient() {
  const invoke = jest.fn();
  const rpc = jest.fn();
  const client = { functions: { invoke }, rpc } as unknown as AppSupabaseClient;
  mockedGetClient.mockResolvedValue(client);
  return { client, invoke, rpc };
}

/** Shape supabase-js uses for a non-2xx Edge Function response. */
function edgeError(body: unknown) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: { json: async () => body },
  };
}

beforeEach(() => {
  mockedGetClient.mockReset();
  mockedGetClient.mockResolvedValue(null);
});

describe('createStaffAccount', () => {
  it('sends a receptionist create payload with no role field and normalised values', async () => {
    const { invoke } = makeClient();
    invoke.mockResolvedValue({
      data: { userId: 'rec-2222', email: 'front@example.com' },
      error: null,
    });

    const outcome = await createStaffAccount(validDraft);

    expect(outcome).toEqual({
      ok: true,
      data: { userId: 'rec-2222', email: 'front@example.com' },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe('staff-admin');

    const body = invoke.mock.calls[0][1].body as Record<string, unknown>;
    expect(body).toEqual({
      action: 'create',
      displayName: 'Front Desk',
      email: 'front@example.com',
      password: 'Pulse#Front1',
      phone: '+919811000001',
    });
    expect(body).not.toHaveProperty('role');
  });

  it('sends null (not an empty string) when the optional phone is blank', async () => {
    const { invoke } = makeClient();
    invoke.mockResolvedValue({ data: { userId: 'rec-1' }, error: null });

    await createStaffAccount({ ...validDraft, phone: '   ' });

    expect(invoke.mock.calls[0][1].body.phone).toBeNull();
  });

  it('refuses an invalid draft locally and never calls the server', async () => {
    const { invoke } = makeClient();
    const outcome = await createStaffAccount({
      ...validDraft,
      email: 'not-an-email',
      password: 'short',
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/valid email/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('surfaces the server error message from an Edge failure', async () => {
    const { invoke } = makeClient();
    invoke.mockResolvedValue({
      data: null,
      error: edgeError({ error: 'Only an owner can create staff accounts.' }),
    });

    const outcome = await createStaffAccount(validDraft);

    expect(outcome).toEqual({ ok: false, error: 'Only an owner can create staff accounts.' });
  });

  it('fails closed when the Edge Function response is unreadable', async () => {
    const { invoke } = makeClient();
    invoke.mockResolvedValue({ data: 'not-an-object', error: null });

    const outcome = await createStaffAccount(validDraft);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/unreadable/i);
  });

  it('does not claim success when the server omits the new user id', async () => {
    const { invoke } = makeClient();
    invoke.mockResolvedValue({ data: { email: 'front@example.com' }, error: null });

    const outcome = await createStaffAccount(validDraft);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/did not return/i);
  });

  it('fails securely when the app has no live client (demo mode)', async () => {
    mockedGetClient.mockResolvedValue(null);
    const outcome = await createStaffAccount(validDraft);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/demo mode/i);
  });

  it('catches a thrown transport error without leaking a stack trace', async () => {
    const { invoke } = makeClient();
    invoke.mockRejectedValue(new Error('Network request failed'));

    const outcome = await createStaffAccount(validDraft);

    expect(outcome).toEqual({ ok: false, error: 'Network request failed' });
  });
});

describe('deactivate', () => {
  it('reports sessions blocked only when the Edge ban is confirmed', async () => {
    const { invoke, rpc } = makeClient();
    invoke.mockResolvedValue({
      data: { deactivated: true, sessionsBlocked: true },
      error: null,
    });

    const outcome = await setStaffActive(makeAccount(), false, OWNER_ID);

    expect(outcome).toEqual({
      ok: true,
      data: { userId: 'rec-2222', active: false, sessionsBlocked: true },
      warning: undefined,
    });
    expect(invoke).toHaveBeenCalledWith('staff-admin', {
      body: { action: 'deactivate', userId: 'rec-2222' },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not claim the account was deactivated when the server says otherwise', async () => {
    const { invoke } = makeClient();
    invoke.mockResolvedValue({ data: { deactivated: false }, error: null });

    const outcome = await setStaffActive(makeAccount(), false, OWNER_ID);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/did not confirm/i);
  });

  it('falls back to the database revocation when the Edge Function is unreachable', async () => {
    const { invoke, rpc } = makeClient();
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'Failed to send a request to the Edge Function' },
    });
    rpc.mockResolvedValue({ data: 'rec-2222', error: null });

    const outcome = await setStaffActive(makeAccount(), false, OWNER_ID);

    expect(rpc).toHaveBeenCalledWith('admin_set_staff_active', {
      p_user_id: 'rec-2222',
      p_active: false,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data).toEqual({
        userId: 'rec-2222',
        active: false,
        sessionsBlocked: false,
      });
      // The warning must state the truth: no auth-side block was applied.
      expect(outcome.warning).toMatch(/auth-side session block/i);
      expect(outcome.warning).toMatch(/expire normally/i);
    }
  });

  it('fails and reports both errors when the Edge and database paths both fail', async () => {
    const { invoke, rpc } = makeClient();
    invoke.mockResolvedValue({
      data: null,
      error: edgeError({ error: 'Staff service unavailable.' }),
    });
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Insufficient role for this operation.' },
    });

    const outcome = await setStaffActive(makeAccount(), false, OWNER_ID);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain('Staff service unavailable.');
      expect(outcome.error).toContain('Insufficient role for this operation.');
    }
  });

  it('refuses self-deactivation before calling any server path', async () => {
    const { invoke, rpc } = makeClient();
    const outcome = await setStaffActive(
      makeAccount({ userId: OWNER_ID, role: 'receptionist' }),
      false,
      OWNER_ID,
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/own account/i);
    expect(invoke).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses an owner target before calling any server path', async () => {
    const { invoke, rpc } = makeClient();
    const outcome = await setStaffActive(makeAccount({ role: 'owner' }), false, OWNER_ID);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/owner accounts/i);
    expect(invoke).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses when there is no session actor id', async () => {
    const { invoke } = makeClient();
    const outcome = await setStaffActive(makeAccount(), false, null);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/session/i);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('activation', () => {
  it('requires the Edge Function (the GoTrue ban must be cleared)', async () => {
    const { invoke, rpc } = makeClient();
    invoke.mockResolvedValue({ data: { active: true }, error: null });

    const outcome = await setStaffActive(makeAccount({ isActive: false }), true, OWNER_ID);

    expect(outcome).toEqual({
      ok: true,
      data: { userId: 'rec-2222', active: true },
      warning: undefined,
    });
    expect(invoke).toHaveBeenCalledWith('staff-admin', {
      body: { action: 'activate', userId: 'rec-2222' },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails rather than reporting a partial activation when the ban is not cleared', async () => {
    const { invoke } = makeClient();
    invoke.mockResolvedValue({ data: { active: false }, error: null });

    const outcome = await setStaffActive(makeAccount({ isActive: false }), true, OWNER_ID);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/did not confirm/i);
  });

  it('does not fall back to the database on activation failure', async () => {
    const { invoke, rpc } = makeClient();
    invoke.mockResolvedValue({
      data: null,
      error: edgeError({ error: 'The auth account could not be unbanned.' }),
    });

    const outcome = await setStaffActive(makeAccount({ isActive: false }), true, OWNER_ID);

    expect(outcome).toEqual({ ok: false, error: 'The auth account could not be unbanned.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a missing active flag', async () => {
    const { invoke } = makeClient();
    const outcome = await setStaffActive(
      makeAccount(),
      undefined as unknown as boolean,
      OWNER_ID,
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/active flag/i);
    expect(invoke).not.toHaveBeenCalled();
  });
});
