/**
 * WS-5 — live auth MFA gate and first-time TOTP enrolment.
 *
 * The Supabase client is mocked: no network, no real factor, no real
 * session. These tests pin the security-relevant contract:
 *   * staff sign-in never reports success at AAL1;
 *   * an account with no verified factor is routed to enrolment only;
 *   * an active verified factor still requires the normal challenge;
 *   * an inactive profile is refused (deactivation is not just a UI hint);
 *   * a role mismatch is a coarse `invalid` and signs out;
 *   * enrolment never claims AAL2 unless the server promoted the session;
 *   * wrong/expired/locked codes are reported honestly.
 *
 * Enrolment is the supported first-run path for a newly created
 * Receptionist. It does not bypass MFA: without a verified code the
 * workspace stays closed.
 */
import { getSupabaseClient } from '@/services/supabase/client';
import type { AppSupabaseClient } from '@/services/supabase/client';
import { LiveAuthProvider } from '@/services/auth/live-provider';

jest.mock('@/services/supabase/client', () => ({
  getSupabaseClient: jest.fn(),
}));

const mockedGetClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>;

interface Profile {
  role: 'owner' | 'receptionist' | 'member';
  display_name: string | null;
  phone: string | null;
  is_active: boolean;
}

interface FakeFactor {
  id: string;
  factor_type: 'totp' | 'phone';
  status: 'verified' | 'unverified';
  friendly_name?: string;
}

const USER_ID = 'user-1111';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    role: 'receptionist',
    display_name: 'Front Desk',
    phone: null,
    is_active: true,
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'staff@example.com',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    phone_confirmed_at: null,
    user_metadata: {},
    ...overrides,
  };
}

interface ClientOptions {
  profile?: Profile | null;
  aal?: { currentLevel: string; nextLevel: string };
  factors?: FakeFactor[];
  passwordError?: unknown;
  listError?: unknown;
  challengeError?: unknown;
  verifyError?: unknown;
  enrollError?: unknown;
  user?: Record<string, unknown>;
}

function setupClient(options: ClientOptions = {}) {
  const user = makeUser(options.user);
  const session = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };

  const profileQuery = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(async () => ({
      data: options.profile === undefined ? makeProfile() : options.profile,
      error: null,
    })),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);
  const from = jest.fn(() => profileQuery);

  const factors = options.factors ?? [];

  const auth = {
    signInWithPassword: jest.fn(async () => {
      if (options.passwordError) return { data: { session: null, user: null }, error: options.passwordError };
      return { data: { session, user }, error: null };
    }),
    getUser: jest.fn(async () => ({ data: { user }, error: null })),
    getSession: jest.fn(async () => ({ data: { session }, error: null })),
    signOut: jest.fn(async () => ({ error: null })),
    mfa: {
      getAuthenticatorAssuranceLevel: jest.fn(async () => ({
        data: options.aal ?? { currentLevel: 'aal1', nextLevel: 'aal1' },
      })),
      listFactors: jest.fn(async () =>
        options.listError
          ? { data: null, error: options.listError }
          : {
              data: {
                all: factors,
                totp: factors.filter(
                  (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
                ),
              },
              error: null,
            },
      ),
      challenge: jest.fn(async () =>
        options.challengeError
          ? { data: null, error: options.challengeError }
          : {
              data: { id: 'sb-challenge-1', expires_at: Math.floor(Date.now() / 1000) + 300 },
              error: null,
            },
      ),
      verify: jest.fn(async () => ({ data: {}, error: options.verifyError ?? null })),
      enroll: jest.fn(async () =>
        options.enrollError
          ? { data: null, error: options.enrollError }
          : {
              data: {
                id: 'factor-new',
                type: 'totp',
                totp: { secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Pulse?secret=JBSWY3DPEHPK3PXP' },
              },
              error: null,
            },
      ),
      unenroll: jest.fn(async () => ({ data: {}, error: null })),
    },
  };

  const rpc = jest.fn(async () => ({ data: USER_ID, error: null }));
  const client = { auth, from, rpc } as unknown as AppSupabaseClient;
  mockedGetClient.mockResolvedValue(client);

  return { client, auth, from, profileQuery, user, session };
}

beforeEach(() => {
  mockedGetClient.mockReset();
  mockedGetClient.mockResolvedValue(null);
});

async function signIn(provider: LiveAuthProvider, expectedRole: 'owner' | 'receptionist' | 'member' = 'receptionist') {
  return provider.signIn('Staff@Example.com', 'Pulse#Staff1', expectedRole);
}

describe('staff sign-in MFA gate', () => {
  it('routes an account with no verified factor to enrolment instead of signing in', async () => {
    const provider = new LiveAuthProvider();
    const { auth } = setupClient({
      profile: makeProfile(),
      aal: { currentLevel: 'aal1', nextLevel: 'aal1' },
      factors: [],
    });

    const result = await signIn(provider);

    expect(result.status).toBe('mfa_enrollment_required');
    if (result.status === 'mfa_enrollment_required') {
      expect(result.pendingAuthId).toMatch(/^live-pa-/);
      expect(result.email).toBe('staff@example.com');
    }
    // The AAL1 session is kept only for enrolment; it is not signed out
    // because no sign-in has been reported yet.
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('requires the normal TOTP challenge when a verified factor exists', async () => {
    const provider = new LiveAuthProvider();
    const { auth } = setupClient({
      profile: makeProfile(),
      aal: { currentLevel: 'aal1', nextLevel: 'aal2' },
      factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
    });

    const result = await signIn(provider);

    expect(result.status).toBe('mfa_required');
    if (result.status === 'mfa_required') {
      expect(result.challenge.kind).toBe('mfa');
      expect(result.challenge.demoCode).toBeUndefined();
      expect(result.challenge.remainingAttempts).toBeGreaterThan(0);
    }
    expect(auth.mfa.challenge).toHaveBeenCalledWith({ factorId: 'factor-1' });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('refuses an inactive profile and signs the session out', async () => {
    const provider = new LiveAuthProvider();
    const { auth } = setupClient({
      profile: makeProfile({ is_active: false }),
      aal: { currentLevel: 'aal2', nextLevel: 'aal2' },
      factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
    });

    const result = await signIn(provider);

    expect(result).toEqual({ status: 'invalid' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('refuses a role mismatch with one coarse invalid result', async () => {
    const provider = new LiveAuthProvider();
    const { auth } = setupClient({
      profile: makeProfile({ role: 'receptionist' }),
      aal: { currentLevel: 'aal2', nextLevel: 'aal2' },
    });

    const result = await provider.signIn('staff@example.com', 'Pulse#Staff1', 'owner');

    expect(result).toEqual({ status: 'invalid' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('refuses a staff account with no profile at all', async () => {
    const provider = new LiveAuthProvider();
    const { auth } = setupClient({ profile: null });

    const result = await signIn(provider);

    expect(result).toEqual({ status: 'invalid' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not demand MFA from a member', async () => {
    const provider = new LiveAuthProvider();
    const { auth } = setupClient({
      profile: makeProfile({ role: 'member', is_active: true }),
      user: { phone_confirmed_at: '2026-01-02T00:00:00.000Z' },
    });

    const result = await provider.signIn('staff@example.com', 'Pulse#Staff1', 'member');

    expect(result.status).toBe('ok');
    expect(auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });
});

describe('first-time TOTP enrolment', () => {
  async function beginEnrollment(options: ClientOptions = {}) {
    const provider = new LiveAuthProvider();
    const setup = setupClient({
      profile: makeProfile(),
      aal: { currentLevel: 'aal1', nextLevel: 'aal1' },
      factors: [],
      ...options,
    });
    const signedIn = await signIn(provider);
    if (signedIn.status !== 'mfa_enrollment_required') {
      throw new Error(`expected enrolment, got ${signedIn.status}`);
    }
    return { provider, setup, pending: signedIn.pendingAuthId };
  }

  it('returns a one-time factor secret and otpauth URI, never persisted', async () => {
    const { provider, setup, pending } = await beginEnrollment();

    const outcome = await provider.startMfaEnrollment(pending);

    expect(outcome.status).toBe('ready');
    if (outcome.status === 'ready') {
      expect(outcome.enrollment.factorId).toBe('factor-new');
      expect(outcome.enrollment.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(outcome.enrollment.uri).toMatch(/^otpauth:\/\/totp\//);
      expect(outcome.enrollment.friendlyName).toContain('Reception');
    }
    expect(setup.auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: expect.stringContaining('Reception'),
    });
  });

  it('reports an existing verified factor instead of enrolling a second one', async () => {
    const { provider, setup, pending } = await beginEnrollment({
      factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
    });

    const outcome = await provider.startMfaEnrollment(pending);

    expect(outcome).toEqual({ status: 'already_enrolled' });
    expect(setup.auth.mfa.enroll).not.toHaveBeenCalled();
  });

  it('removes abandoned unverified factors before enrolling', async () => {
    const { provider, setup, pending } = await beginEnrollment({
      factors: [
        { id: 'stale-1', factor_type: 'totp', status: 'unverified' },
        { id: 'phone-1', factor_type: 'phone', status: 'unverified' },
      ],
    });

    await provider.startMfaEnrollment(pending);

    expect(setup.auth.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(setup.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale-1' });
  });

  it('refuses enrolment for an unknown or expired pending sign-in', async () => {
    const provider = new LiveAuthProvider();
    setupClient({ profile: makeProfile() });

    await expect(provider.startMfaEnrollment('live-pa-missing')).resolves.toEqual({
      status: 'invalid',
    });
  });

  it('refuses enrolment for a member pending sign-in', async () => {
    const provider = new LiveAuthProvider();
    setupClient({
      profile: makeProfile({ role: 'member' }),
      user: { phone_confirmed_at: '2026-01-02T00:00:00.000Z' },
    });
    const signedIn = await provider.signIn('staff@example.com', 'Pulse#Staff1', 'member');
    if (signedIn.status !== 'ok') throw new Error('member should sign in');

    await expect(provider.startMfaEnrollment(signedIn.pendingAuthId)).resolves.toEqual({
      status: 'invalid',
    });
  });

  it('fails closed when the factor cannot be created', async () => {
    const { provider, pending } = await beginEnrollment({
      enrollError: { message: 'Enrolment unavailable', status: 500 },
    });

    await expect(provider.startMfaEnrollment(pending)).resolves.toEqual({ status: 'invalid' });
  });

  it('verifies the factor, reaches AAL2 and then completes the same sign-in', async () => {
    const { provider, setup, pending } = await beginEnrollment();
    const aal = setup.auth.mfa.getAuthenticatorAssuranceLevel;
    aal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } });

    const verified = await provider.completeMfaEnrollment(pending, 'factor-new', '123456');

    expect(verified).toEqual({ status: 'ok' });
    expect(setup.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: 'factor-new' });
    expect(setup.auth.mfa.verify).toHaveBeenCalledWith({
      factorId: 'factor-new',
      challengeId: 'sb-challenge-1',
      code: '123456',
    });

    const completed = await provider.completeSignIn(pending);
    expect(completed.status).toBe('ok');
    if (completed.status === 'ok') {
      expect(completed.session.role).toBe('receptionist');
      expect(completed.session.mfaVerified).toBe(true);
    }
  });

  it('reports a wrong code without unlocking the workspace', async () => {
    const { provider, pending } = await beginEnrollment({
      verifyError: { message: 'Invalid TOTP code entered', status: 422 },
    });

    await expect(
      provider.completeMfaEnrollment(pending, 'factor-new', '000000'),
    ).resolves.toEqual({ status: 'invalid_code' });
    await expect(provider.completeSignIn(pending)).resolves.toEqual({ status: 'invalid' });
  });

  it('reports an expired factor challenge', async () => {
    const { provider, pending } = await beginEnrollment({
      verifyError: { message: 'Challenge expired', code: 'mfa_challenge_expired', status: 403 },
    });

    await expect(
      provider.completeMfaEnrollment(pending, 'factor-new', '123456'),
    ).resolves.toEqual({ status: 'expired' });
  });

  it('reports rate limiting as locked', async () => {
    const { provider, pending } = await beginEnrollment({
      verifyError: { message: 'Too many requests', status: 429 },
    });

    await expect(
      provider.completeMfaEnrollment(pending, 'factor-new', '123456'),
    ).resolves.toEqual({ status: 'locked' });
  });

  it('never claims success when the server did not promote the session to AAL2', async () => {
    const { provider, setup, pending } = await beginEnrollment();
    // Verification succeeds, but the session stays at AAL1.
    setup.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
    });

    await expect(
      provider.completeMfaEnrollment(pending, 'factor-new', '123456'),
    ).resolves.toEqual({ status: 'invalid_code' });
    await expect(provider.completeSignIn(pending)).resolves.toEqual({ status: 'invalid' });
  });

  it('reports an unavailable challenge as invalid rather than success', async () => {
    const { provider, pending } = await beginEnrollment({
      challengeError: { message: 'Challenge service unavailable', status: 500 },
    });

    await expect(
      provider.completeMfaEnrollment(pending, 'factor-new', '123456'),
    ).resolves.toEqual({ status: 'invalid' });
  });
});
