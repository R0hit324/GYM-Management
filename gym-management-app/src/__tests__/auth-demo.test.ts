/**
 * Auth provider tests (Part 2). The demo provider is pure TypeScript with
 * an injectable clock, so every security rule a live backend would enforce
 * is tested here directly against the contract in `services/auth/types.ts`:
 *
 * - credential checks against the account's immutable role
 * - sign-in rate limiting with lockout
 * - one-time codes: expiry, resend cooldown, per-target request throttle,
 *   attempt caps, single-use replay protection
 * - staff MFA gating before session issue
 * - unverified-member sign-in verification (linked challenges)
 * - duplicate signup rejection and the password policy
 * - password reset incl. enumeration safety and session revocation
 * - refresh-token rotation, reuse rejection, access expiry, logout
 */
import { DemoAuthProvider, checkPassword, demoCredentials } from '@/services/auth/demo-provider';
import type { MemberSignUpInput } from '@/services/auth/types';

/** Mutable test clock: every provider call reads `clock` at call time. */
type ProviderConfig = Partial<ConstructorParameters<typeof DemoAuthProvider>[0]>;
function makeProvider(config: ProviderConfig = {}) {
  let clock = 1_700_000_000_000;
  const provider = new DemoAuthProvider({ now: () => clock, ...config });
  return {
    provider,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

function memberInput(overrides: Partial<MemberSignUpInput> = {}): MemberSignUpInput {
  return {
    fullName: 'Rohit Sharma',
    phone: '9876545121',
    email: 'rohit@example.com',
    password: 'Pulse#Member9',
    planId: 'plan-monthly',
    ...overrides,
  };
}

describe('checkPassword (shared policy)', () => {
  it('accepts 8+ characters with a letter and a digit', () => {
    expect(checkPassword('abcd1234')).toBe('ok');
    expect(checkPassword('Pulse#Owner1')).toBe('ok');
  });

  it('rejects anything under 8 characters', () => {
    expect(checkPassword('ab1')).toBe('short');
    expect(checkPassword('')).toBe('short');
  });

  it('rejects 8+ characters without both a letter and a digit', () => {
    expect(checkPassword('abcdefgh')).toBe('weak');
    expect(checkPassword('12345678')).toBe('weak');
  });
});

describe('signIn — the three seeded roles', () => {
  it('signs a verified member straight through to a session', async () => {
    const { provider } = makeProvider();
    const cred = demoCredentials.find((c) => c.role === 'member')!;
    const result = await provider.signIn(cred.email, cred.password, 'member');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const done = await provider.completeSignIn(result.pendingAuthId);
    expect(done.status).toBe('ok');
    if (done.status !== 'ok') return;
    expect(done.session.role).toBe('member');
    expect(done.session.mfaVerified).toBe(false);
  });

  it('requires MFA for staff before any session is issued', async () => {
    const { provider } = makeProvider();
    const cred = demoCredentials.find((c) => c.role === 'owner')!;
    const result = await provider.signIn(cred.email, cred.password, 'owner');
    expect(result.status).toBe('mfa_required');
    if (result.status !== 'mfa_required') return;
    // MFA is a real single-use challenge with a demo code surfaced.
    expect(result.challenge.demoCode).toMatch(/^\d{6}$/);
    // Completing without MFA is refused — the gate is provider-side.
    const early = await provider.completeSignIn(result.pendingAuthId);
    expect(early.status).toBe('invalid');
    const verified = await provider.verifyMfa(result.pendingAuthId, result.challenge.challengeId, result.challenge.demoCode!);
    expect(verified.status).toBe('ok');
    const done = await provider.completeSignIn(result.pendingAuthId);
    expect(done.status).toBe('ok');
    if (done.status !== 'ok') return;
    expect(done.session.role).toBe('owner');
    expect(done.session.mfaVerified).toBe(true);
  });

  it('requires MFA for the receptionist too', async () => {
    const { provider } = makeProvider();
    const cred = demoCredentials.find((c) => c.role === 'receptionist')!;
    const result = await provider.signIn(cred.email, cred.password, 'receptionist');
    expect(result.status).toBe('mfa_required');
  });

  it('rejects a wrong MFA code and never completes the sign-in', async () => {
    const { provider } = makeProvider();
    const cred = demoCredentials.find((c) => c.role === 'owner')!;
    const result = await provider.signIn(cred.email, cred.password, 'owner');
    if (result.status !== 'mfa_required') throw new Error('expected mfa_required');
    const wrong = await provider.verifyMfa(result.pendingAuthId, result.challenge.challengeId, '000000' === result.challenge.demoCode ? '111111' : '000000');
    expect(wrong.status).toBe('invalid_code');
    const done = await provider.completeSignIn(result.pendingAuthId);
    expect(done.status).toBe('invalid');
  });

  it('refuses a mismatched pending id / challenge pair for MFA', async () => {
    const { provider } = makeProvider();
    const cred = demoCredentials.find((c) => c.role === 'owner')!;
    const result = await provider.signIn(cred.email, cred.password, 'owner');
    if (result.status !== 'mfa_required') throw new Error('expected mfa_required');
    const other = await provider.verifyMfa('pa-nope', result.challenge.challengeId, result.challenge.demoCode!);
    expect(other.status).toBe('expired');
  });
});

describe('signIn — credentials and role validation', () => {
  it('rejects a wrong password with one coarse result', async () => {
    const { provider } = makeProvider();
    const result = await provider.signIn('arjun@example.com', 'WrongPass1', 'member');
    expect(result.status).toBe('invalid');
  });

  it('rejects an unknown account with the same coarse result', async () => {
    const { provider } = makeProvider();
    const result = await provider.signIn('nobody@example.com', 'Whatever1', 'member');
    expect(result.status).toBe('invalid');
  });

  it('rejects a valid member password against the owner role — the UI pick is never evidence', async () => {
    const { provider } = makeProvider();
    const member = demoCredentials.find((c) => c.role === 'member')!;
    const owner = demoCredentials.find((c) => c.role === 'owner')!;
    expect((await provider.signIn(member.email, member.password, 'owner')).status).toBe('invalid');
    expect((await provider.signIn(owner.email, owner.password, 'receptionist')).status).toBe('invalid');
  });

  it('locks the account after the configured number of failures, then recovers', async () => {
    const { provider, advance } = makeProvider({ maxSignInAttempts: 3, signInLockMs: 60_000 });
    for (let i = 0; i < 3; i++) {
      expect((await provider.signIn('arjun@example.com', 'WrongPass1', 'member')).status).toBe('invalid');
    }
    // Locked: even the CORRECT password is refused while the lock runs.
    const locked = await provider.signIn('arjun@example.com', 'Pulse#Member1', 'member');
    expect(locked.status).toBe('rate_limited');
    if (locked.status !== 'rate_limited') return;
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);
    // After the lock expires the correct password works again.
    advance(61_000);
    const recovered = await provider.signIn('arjun@example.com', 'Pulse#Member1', 'member');
    expect(recovered.status).toBe('ok');
  });
});

describe('challenges — expiry, cooldown, throttle, attempts, replay', () => {
  it('expires the code after its lifetime', async () => {
    const { provider, advance } = makeProvider({ codeLifetimeMs: 1000 });
    const outcome = await provider.requestChallenge({ kind: 'email-code', email: 'someone@example.com' });
    expect(outcome.status).toBe('issued');
    if (outcome.status !== 'issued') return;
    expect(outcome.challenge.demoCode).toMatch(/^\d{6}$/);
    advance(2000);
    const verify = await provider.verifyChallenge(outcome.challenge.challengeId, outcome.challenge.demoCode!);
    expect(verify.status).toBe('expired');
  });

  it('enforces the resend cooldown between sends', async () => {
    const { provider, advance } = makeProvider();
    const first = await provider.requestChallenge({ kind: 'phone-otp', phone: '9876500011' });
    expect(first.status).toBe('issued');
    const second = await provider.requestChallenge({ kind: 'phone-otp', phone: '9876500011' });
    expect(second.status).toBe('cooldown');
    if (second.status !== 'cooldown') return;
    expect(second.retryAfterSeconds).toBe(30);
    // After the cooldown a resend is issued, and it replaces the old code.
    advance(31_000);
    const third = await provider.requestChallenge({ kind: 'phone-otp', phone: '9876500011' });
    expect(third.status).toBe('issued');
  });

  it('throttles requests per target inside the sliding window', async () => {
    const { provider, advance } = makeProvider({ maxRequestsPerTarget: 2 });
    const email = 'throttled@example.com';
    expect((await provider.requestChallenge({ kind: 'email-code', email })).status).toBe('issued');
    // Second request is inside the window but hits the send cooldown first.
    expect((await provider.requestChallenge({ kind: 'email-code', email })).status).toBe('cooldown');
    // Third request exhausts the per-target quota → hard rate limit.
    const third = await provider.requestChallenge({ kind: 'email-code', email });
    expect(third.status).toBe('rate_limited');
    // A different target is throttled independently.
    expect((await provider.requestChallenge({ kind: 'email-code', email: 'other@example.com' })).status).toBe('issued');
    // The window sliding past frees the original target.
    advance(10 * 60_000 + 1_000);
    expect((await provider.requestChallenge({ kind: 'email-code', email })).status).toBe('issued');
  });

  it('locks the challenge after the configured number of wrong attempts', async () => {
    const { provider } = makeProvider({ maxCodeAttempts: 5 });
    const outcome = await provider.requestChallenge({ kind: 'email-code', email: 'attempts@example.com' });
    if (outcome.status !== 'issued') throw new Error('expected issued');
    const code = outcome.challenge.demoCode!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      expect((await provider.verifyChallenge(outcome.challenge.challengeId, wrong)).status).toBe('invalid_code');
    }
    // Fifth wrong attempt invalidates the challenge entirely.
    expect((await provider.verifyChallenge(outcome.challenge.challengeId, wrong)).status).toBe('locked');
    // And the real code no longer works — the challenge is gone.
    expect((await provider.verifyChallenge(outcome.challenge.challengeId, code)).status).toBe('expired');
  });

  it('accepts each code exactly once (replay protection)', async () => {
    const { provider } = makeProvider();
    const outcome = await provider.requestChallenge({ kind: 'email-code', email: 'replay@example.com' });
    if (outcome.status !== 'issued') throw new Error('expected issued');
    const code = outcome.challenge.demoCode!;
    expect((await provider.verifyChallenge(outcome.challenge.challengeId, code)).status).toBe('ok');
    // Second use of the SAME code is refused.
    expect((await provider.verifyChallenge(outcome.challenge.challengeId, code)).status).toBe('expired');
  });

  it('rejects malformed targets coarsely', async () => {
    const { provider } = makeProvider();
    expect((await provider.requestChallenge({ kind: 'email-code', email: 'not-an-email' })).status).toBe('invalid');
    expect((await provider.requestChallenge({ kind: 'phone-otp', phone: '123' })).status).toBe('invalid');
  });

  it('getChallenge returns live metadata and null for expired ones', async () => {
    const { provider, advance } = makeProvider({ codeLifetimeMs: 1000 });
    const outcome = await provider.requestChallenge({ kind: 'email-code', email: 'meta@example.com' });
    if (outcome.status !== 'issued') throw new Error('expected issued');
    expect((await provider.getChallenge(outcome.challenge.challengeId))?.remainingAttempts).toBe(5);
    advance(2000);
    expect(await provider.getChallenge(outcome.challenge.challengeId)).toBeNull();
  });
});

describe('unverified member — linked sign-in verification', () => {
  async function makeUnverifiedMember() {
    const { provider, advance } = makeProvider();
    const input = memberInput();
    const created = await provider.signUpMember(input);
    expect(created.status).toBe('ok');
    const pending = await provider.signIn(input.email, input.password, 'member');
    expect(pending.status).toBe('verification_required');
    if (pending.status !== 'verification_required') throw new Error('expected verification_required');
    expect(pending.missing).toEqual(['email', 'phone']);
    return { provider, advance, input, pendingAuthId: pending.pendingAuthId };
  }

  it('creates the account unverified when no verified claims accompany the submission', async () => {
    const { provider } = makeProvider();
    const created = await provider.signUpMember(memberInput());
    if (created.status !== 'ok') throw new Error('expected ok');
    const pending = await provider.signIn('rohit@example.com', 'Pulse#Member9', 'member');
    expect(pending.status).toBe('verification_required');
  });

  it('marks claims verified only through verified single-use challenges', async () => {
    const { provider } = makeProvider();
    const created = await provider.signUpMember(
      memberInput({ verifiedEmail: 'rohit@example.com', verifiedPhone: '9876545121' }),
    );
    expect(created.status).toBe('ok');
    // Matching claims → fully verified → straight through to a session.
    const pending = await provider.signIn('rohit@example.com', 'Pulse#Member9', 'member');
    expect(pending.status).toBe('ok');
    // Mismatched claims must NOT count as verification.
    const other = await provider.signUpMember(
      memberInput({
        email: 'rohit2@example.com',
        phone: '9876545199',
        verifiedEmail: 'rohit@example.com', // someone else's verified email claim
        verifiedPhone: '9876545199',
      }),
    );
    if (other.status !== 'ok') throw new Error('expected ok');
    const pending2 = await provider.signIn('rohit2@example.com', 'Pulse#Member9', 'member');
    expect(pending2.status).toBe('verification_required');
    if (pending2.status !== 'verification_required') return;
    // Only the email check is outstanding now.
    expect(pending2.missing).toEqual(['email']);
  });

  it('refuses completeSignIn while checks are outstanding', async () => {
    const { provider, pendingAuthId } = await makeUnverifiedMember();
    expect((await provider.completeSignIn(pendingAuthId)).status).toBe('invalid');
  });

  it('walks email then phone via linked challenges, then completes the sign-in', async () => {
    const { provider, input, pendingAuthId } = await makeUnverifiedMember();

    // The contact comes from the account, not from the client: a mismatched
    // email for the linked pending auth is refused.
    expect(
      (await provider.requestChallenge({ kind: 'email-code', email: 'intruder@example.com', pendingAuthId })).status,
    ).toBe('invalid');

    const emailOutcome = await provider.requestChallenge({ kind: 'email-code', email: input.email, pendingAuthId });
    expect(emailOutcome.status).toBe('issued');
    if (emailOutcome.status !== 'issued') return;
    expect((await provider.verifyChallenge(emailOutcome.challenge.challengeId, emailOutcome.challenge.demoCode!)).status).toBe('ok');

    // Phone: the challenge target is derived from the account — whatever
    // phone the client sends is ignored for a linked request.
    const phoneOutcome = await provider.requestChallenge({ kind: 'phone-otp', phone: '1000000000', pendingAuthId });
    expect(phoneOutcome.status).toBe('issued');
    if (phoneOutcome.status !== 'issued') return;
    expect(phoneOutcome.challenge.targetHint).toContain('••••••5121'); // the account's own number, masked
    expect((await provider.verifyChallenge(phoneOutcome.challenge.challengeId, phoneOutcome.challenge.demoCode!)).status).toBe('ok');

    // getPendingContact reflects the account's contact details throughout.
    const contact = await provider.getPendingContact(pendingAuthId);
    expect(contact?.email).toBe(input.email);
    expect(contact?.phone).toBe('9876545121');

    const done = await provider.completeSignIn(pendingAuthId);
    expect(done.status).toBe('ok');
    if (done.status !== 'ok') return;
    expect(done.session.emailVerified).toBe(true);
    expect(done.session.phoneVerified).toBe(true);
  });

  it('refuses linked challenges once the pending sign-in is gone', async () => {
    const { provider, advance, pendingAuthId } = await makeUnverifiedMember();
    // A failed completion does NOT consume the pending — it survives so
    // the member can finish the checks. Only success or expiry consumes it.
    expect((await provider.completeSignIn(pendingAuthId)).status).toBe('invalid');
    expect((await provider.getPendingContact(pendingAuthId))?.email).toBe('rohit@example.com');
    // After the pending lifetime passes, linked challenges are refused.
    advance(11 * 60_000);
    const outcome = await provider.requestChallenge({
      kind: 'email-code',
      email: 'rohit@example.com',
      pendingAuthId,
    });
    expect(outcome.status).toBe('invalid');
    expect(await provider.getPendingContact(pendingAuthId)).toBeNull();
  });
});

describe('signUpMember — validation and duplicates', () => {
  it('rejects invalid fields before anything is created', async () => {
    const { provider } = makeProvider();
    expect((await provider.signUpMember(memberInput({ fullName: 'Cher' }))).status).toBe('invalid');
    expect((await provider.signUpMember(memberInput({ phone: '12345' }))).status).toBe('invalid');
    expect((await provider.signUpMember(memberInput({ email: 'nope' }))).status).toBe('invalid');
    expect((await provider.signUpMember(memberInput({ password: 'short1' }))).status).toBe('invalid');
    expect((await provider.signUpMember(memberInput({ password: 'nodigitshere' }))).status).toBe('invalid');
    expect((await provider.signUpMember(memberInput({ planId: 'plan-none' }))).status).toBe('invalid');
  });

  it('rejects a duplicate email', async () => {
    const { provider } = makeProvider();
    const result = await provider.signUpMember(memberInput({ email: 'arjun@example.com' }));
    expect(result).toMatchObject({ status: 'duplicate', field: 'email' });
  });

  it('rejects a duplicate phone regardless of formatting', async () => {
    const { provider } = makeProvider();
    const result = await provider.signUpMember(memberInput({ phone: '+91 98765 45120' }));
    expect(result).toMatchObject({ status: 'duplicate', field: 'phone' });
  });
});

describe('password reset — recovery with enumeration safety', () => {
  it('resets the password and revokes every existing session', async () => {
    const { provider } = makeProvider();
    // A live member session exists before recovery.
    const signIn = await provider.signIn('arjun@example.com', 'Pulse#Member1', 'member');
    if (signIn.status !== 'ok') throw new Error('expected ok');
    const before = await provider.completeSignIn(signIn.pendingAuthId);
    if (before.status !== 'ok') throw new Error('expected ok');

    const outcome = await provider.requestChallenge({ kind: 'password-reset', email: 'arjun@example.com' });
    expect(outcome.status).toBe('issued');
    if (outcome.status !== 'issued') return;
    const code = outcome.challenge.demoCode!;
    // Wrong code costs an attempt, not the challenge.
    expect((await provider.resetPassword(outcome.challenge.challengeId, '000000' === code ? '111111' : '000000', 'NewPass1234')).status).toBe('invalid_code');
    // Correct code + valid password → reset succeeds.
    expect((await provider.resetPassword(outcome.challenge.challengeId, code, 'NewPass1234')).status).toBe('ok');
    // Single use.
    expect((await provider.resetPassword(outcome.challenge.challengeId, code, 'OtherPass1234')).status).toBe('expired');
    // Every pre-existing session is dead.
    expect(await provider.getSession(before.tokens.accessToken)).toBeNull();
    expect((await provider.refreshSession(before.tokens.refreshToken)).status).toBe('revoked');
    // Old password is gone; the new one signs in.
    expect((await provider.signIn('arjun@example.com', 'Pulse#Member1', 'member')).status).toBe('invalid');
    expect((await provider.signIn('arjun@example.com', 'NewPass1234', 'member')).status).toBe('ok');
  });

  it('never reveals whether an unknown email has an account', async () => {
    const { provider } = makeProvider();
    const outcome = await provider.requestChallenge({ kind: 'password-reset', email: 'ghost@example.com' });
    // Same coarse 'issued' as a real account…
    expect(outcome.status).toBe('issued');
    if (outcome.status !== 'issued') return;
    // …but no demo code, because there is nothing to deliver to.
    expect(outcome.challenge.demoCode).toBeUndefined();
  });

  it('enforces the password policy on reset', async () => {
    const { provider } = makeProvider();
    const outcome = await provider.requestChallenge({ kind: 'password-reset', email: 'arjun@example.com' });
    if (outcome.status !== 'issued') throw new Error('expected issued');
    const code = outcome.challenge.demoCode!;
    expect((await provider.resetPassword(outcome.challenge.challengeId, code, 'short1')).status).toBe('invalid_password');
    expect((await provider.resetPassword(outcome.challenge.challengeId, code, 'nodigitshere')).status).toBe('invalid_password');
  });
});

describe('sessions — rotation, expiry, revocation', () => {
  async function signedInSession() {
    const { provider, advance } = makeProvider();
    const signIn = await provider.signIn('arjun@example.com', 'Pulse#Member1', 'member');
    if (signIn.status !== 'ok') throw new Error('expected ok');
    const done = await provider.completeSignIn(signIn.pendingAuthId);
    if (done.status !== 'ok') throw new Error('expected ok');
    return { provider, advance, tokens: done.tokens, session: done.session };
  }

  it('rotates the refresh token single-use and kills the old pair', async () => {
    const { provider, tokens } = await signedInSession();
    const first = await provider.refreshSession(tokens.refreshToken);
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') throw new Error('expected ok');
    // New pair differs from the old.
    expect(first.tokens.accessToken).not.toBe(tokens.accessToken);
    expect(first.tokens.refreshToken).not.toBe(tokens.refreshToken);
    // The old access token is dead.
    expect(await provider.getSession(tokens.accessToken)).toBeNull();
    // Reusing the OLD refresh token is refused — rotation detected.
    expect((await provider.refreshSession(tokens.refreshToken)).status).toBe('revoked');
    // The new refresh token still works.
    expect((await provider.refreshSession(first.tokens.refreshToken)).status).toBe('ok');
  });

  it('refreshes transparently after the access token expires', async () => {
    const { provider, advance, tokens } = await signedInSession();
    advance(16 * 60_000); // past the 15-minute access lifetime
    // Expired access is refused — but purely: the session is NOT revoked,
    // so the restore path can still use the refresh token.
    expect(await provider.getSession(tokens.accessToken)).toBeNull();
    const refreshed = await provider.refreshSession(tokens.refreshToken);
    expect(refreshed.status).toBe('ok');
    if (refreshed.status !== 'ok') throw new Error('expected ok');
    expect(refreshed.session.role).toBe('member');
  });

  it('signOut revokes both tokens immediately', async () => {
    const { provider, tokens } = await signedInSession();
    await provider.signOut(tokens.accessToken);
    expect(await provider.getSession(tokens.accessToken)).toBeNull();
    expect((await provider.refreshSession(tokens.refreshToken)).status).toBe('revoked');
  });

  it('revokes everything when the refresh lifetime passes', async () => {
    const { provider, advance, tokens } = await signedInSession();
    advance(8 * 24 * 60 * 60_000); // past the 7-day refresh lifetime
    expect((await provider.refreshSession(tokens.refreshToken)).status).toBe('revoked');
  });
});
