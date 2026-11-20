/**
 * Live authentication provider — the Supabase-backed implementation of the
 * `AuthProvider` contract.
 *
 * It is deliberately a *session/MFA gate*, not a second source of truth:
 *
 *  - Identity comes from Supabase Auth (`signInWithPassword`, OTPs, TOTP).
 *  - Authorisation comes from the database: every session is stamped with
 *    the immutable `profiles.role` read through RLS. A missing profile is
 *    deny-by-default; the only self-service way to obtain one is
 *    `provision_member_profile()`, which is caller-only and hard-codes the
 *    `member` role (migration 0005).
 *  - Staff sessions are only reported as signed-in once the Supabase session
 *    reaches `aal2` (TOTP verified), because `verify_payment`,
 *    `create_reversal`, `decide_freeze` and `mint_attendance_token` all
 *    reject `aal1` JWTs server-side. A staff account without an enrolled
 *    TOTP factor cannot complete sign-in.
 *  - The role shown on the login screen is an expectation. It never grants
 *    anything: the session role is read from the database and a mismatch is
 *    a coarse `invalid` (no account enumeration).
 *
 * No codes are ever surfaced: `demoCode` is never set here.
 *
 * The provider uses the ONE shared Supabase client
 * (`@/services/supabase/client`) — never a second client or auth stack.
 */
import { isEmail, isPhone } from '@/utils/format';
import type { AppSupabaseClient } from '@/services/supabase/client';
import { getSupabaseClient } from '@/services/supabase/client';
import { checkPassword } from '@/services/auth/demo-provider';
import type {
  AuthChallenge,
  AuthProvider,
  AuthRole,
  AuthSession,
  ChallengeOutcome,
  ChallengeRequest,
  CompleteSignInResult,
  MemberSignUpInput,
  MfaEnrollmentResult,
  MfaEnrollmentStart,
  PasswordResetResult,
  PendingContact,
  RefreshResult,
  SessionTokens,
  SignInResult,
  SignUpResult,
  VerificationKind,
  VerifyOutcome,
} from '@/services/auth/types';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface ProfileRow {
  role: AuthRole;
  display_name: string | null;
  phone: string | null;
  /**
   * Durable authorisation switch owned by the staff admin functions.
   * Missing on very old deployments, so only an explicit `false` denies.
   */
  is_active?: boolean | null;
}

interface LiveUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}

interface SupabaseSessionLike {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
  user: LiveUser;
}

interface LivePending {
  userId: string;
  role: AuthRole;
  email: string;
  phone: string | null;
  displayName: string;
  expiresAt: number;
  emailDone: boolean;
  phoneDone: boolean;
  mfaDone: boolean;
}

interface LiveChallenge {
  challengeId: string;
  kind: AuthChallenge['kind'];
  targetHint: string;
  expiresAt: number;
  resendAllowedAt: number;
  attemptsLeft: number;
  pendingAuthId: string | null;
  email: string | null;
  phone: string | null;
  /** MFA only — Supabase factor + challenge ids. */
  factorId: string | null;
  supabaseChallengeId: string | null;
}

const PENDING_LIFETIME_MS = 10 * 60_000;
const CODE_LIFETIME_MS = 5 * 60_000;
const RESET_LIFETIME_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 10_000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_REQUESTS = 5;
const REQUEST_WINDOW_MS = 10 * 60_000;

function randomId(prefix: string): string {
  let out = '';
  for (let i = 0; i < 4; i++) out += Math.random().toString(36).slice(2, 10);
  return `${prefix}-${out}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `${phone.slice(0, Math.max(0, phone.length - 4)).replace(/\d/g, '•')}${phone.slice(-4)}`;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(3, user.length - 2))}@${domain}`;
}

function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function errorStatus(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

function isExpiredError(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'otp_expired' || code === 'mfa_challenge_expired' || errorStatus(error) === 403;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class LiveAuthProvider implements AuthProvider {
  readonly mode = 'live' as const;

  private pending = new Map<string, LivePending>();
  private challenges = new Map<string, LiveChallenge>();
  private lastSentAt = new Map<string, number>();
  private requestCounts = new Map<string, { count: number; windowStart: number }>();

  // ------------------------------------------------------------------
  // Sign in / sign up
  // ------------------------------------------------------------------

  async signIn(email: string, password: string, expectedRole: AuthRole): Promise<SignInResult> {
    const client = await getSupabaseClient();
    if (!client) return { status: 'invalid' };

    const normalisedEmail = email.trim().toLowerCase();
    const { data, error } = await client.auth.signInWithPassword({
      email: normalisedEmail,
      password,
    });
    if (error || !data.session || !data.user) {
      if (errorStatus(error) === 429) return { status: 'rate_limited', retryAfterSeconds: 60 };
      return { status: 'invalid' };
    }

    const user = data.user as LiveUser;
    let profile = await this.readProfile(client, user.id);

    // Self-service profiles are member-only. Staff profiles are provisioned
    // service-side; a staff account without one is refused rather than
    // silently downgraded to a member profile.
    if (!profile && expectedRole === 'member') {
      await this.provision(client, user, null, null);
      profile = await this.readProfile(client, user.id);
    }

    if (!profile || profile.is_active === false || profile.role !== expectedRole) {
      await this.safeSignOut(client);
      return { status: 'invalid' };
    }

    const pendingId = randomId('live-pa');
    const emailDone = Boolean(user.email_confirmed_at);
    const phoneDone = Boolean(user.phone_confirmed_at);
    const missing: VerificationKind[] = [];
    if (!emailDone) missing.push('email');
    if (profile.role === 'member' && !phoneDone) missing.push('phone');

    this.pending.set(pendingId, {
      userId: user.id,
      role: profile.role,
      email: (user.email ?? normalisedEmail).toLowerCase(),
      phone: user.phone ?? profile.phone ?? null,
      displayName: profile.display_name ?? this.metadataName(user) ?? 'Member',
      expiresAt: Date.now() + PENDING_LIFETIME_MS,
      emailDone,
      phoneDone,
      mfaDone: false,
    });

    if (missing.length > 0) {
      return { status: 'verification_required', pendingAuthId: pendingId, missing };
    }

    if (profile.role !== 'member') {
      const levels = await this.aal(client);
      if (levels.nextLevel !== 'aal2') {
        // No verified TOTP factor yet. Keep the aal1 session ONLY for
        // first-time enrolment: every authority function still refuses
        // aal1, so this grants nothing. Signing the account in as if MFA
        // were complete would misrepresent the session.
        return {
          status: 'mfa_enrollment_required',
          pendingAuthId: pendingId,
          email: (user.email ?? normalisedEmail).toLowerCase(),
        };
      }
      const challenge = await this.createMfaChallenge(client, pendingId, user);
      if (!challenge) {
        this.pending.delete(pendingId);
        await this.safeSignOut(client);
        return { status: 'invalid' };
      }
      return {
        status: 'mfa_required',
        pendingAuthId: pendingId,
        challenge: this.publicChallenge(challenge),
      };
    }

    return { status: 'ok', pendingAuthId: pendingId };
  }

  async signUpMember(input: MemberSignUpInput): Promise<SignUpResult> {
    const name = input.fullName.trim();
    if (name.split(/\s+/).length < 2) return { status: 'invalid', field: 'name' };

    const phone = input.phone.trim();
    if (!isPhone(phone)) return { status: 'invalid', field: 'phone' };

    const email = input.email.trim().toLowerCase();
    if (!isEmail(email)) return { status: 'invalid', field: 'email' };

    if (checkPassword(input.password) !== 'ok') return { status: 'invalid', field: 'password' };

    // The plan is validated server-side when the join application is
    // submitted; the catalogue is not readable before authentication.
    if (!input.planId.trim()) return { status: 'invalid', field: 'plan' };

    const client = await getSupabaseClient();
    if (!client) return { status: 'invalid', field: 'email' };

    const existing = await client.auth.getSession();
    const currentUser = existing.data.session?.user as LiveUser | undefined;
    const currentEmail = currentUser?.email?.toLowerCase();

    let userId: string | null = null;
    let provisionWith: { sessionUser: LiveUser; name: string } | null = null;

    if (currentUser && currentEmail === email) {
      // A verified email/phone challenge already created this auth user
      // (passwordless session). Attach the password instead of duplicating.
      const { data, error } = await client.auth.updateUser({
        password: input.password,
        data: { full_name: name, phone },
      });
      if (error) return this.mapSignUpError(error);
      userId = data.user?.id ?? currentUser.id;
      provisionWith = { sessionUser: (data.user ?? currentUser) as LiveUser, name };
    } else {
      const { data, error } = await client.auth.signUp({
        email,
        password: input.password,
        options: { data: { full_name: name, phone } },
      });
      if (error) return this.mapSignUpError(error);
      if (!data.user) return { status: 'invalid', field: 'email' };
      if ((data.user.identities?.length ?? 0) === 0) return { status: 'duplicate', field: 'email' };
      userId = data.user.id;
      if (data.session) {
        provisionWith = { sessionUser: data.session.user as LiveUser, name };
      }
    }

    if (provisionWith) {
      await this.provision(client, provisionWith.sessionUser, name, phone);
      // The join flow returns to sign-in; never leave an implicit session.
      await this.safeSignOut(client);
    }

    return { status: 'ok', userId, email };
  }

  // ------------------------------------------------------------------
  // Challenges
  // ------------------------------------------------------------------

  async requestChallenge(request: ChallengeRequest): Promise<ChallengeOutcome> {
    const client = await getSupabaseClient();
    if (!client) return { status: 'invalid' };
    this.sweep();

    if (request.kind === 'mfa') {
      const pending = this.pending.get(request.pendingAuthId);
      if (!pending || pending.expiresAt <= Date.now()) return { status: 'invalid' };
      const challenge = await this.createMfaChallenge(client, request.pendingAuthId, {
        id: pending.userId,
        email: pending.email,
      });
      if (!challenge) return { status: 'invalid' };
      return { status: 'issued', challenge: this.publicChallenge(challenge) };
    }

    if (request.kind === 'password-reset') {
      const email = request.email.trim().toLowerCase();
      if (!isEmail(email)) return { status: 'invalid' };
      const throttled = this.consumeRequestSlot(`password-reset:${email}`);
      if (throttled) return throttled;

      // Supabase deliberately reports success for unknown addresses too.
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (errorStatus(error) === 429) return { status: 'rate_limited', retryAfterSeconds: 60 };

      const challenge = this.storeChallenge({
        kind: 'password-reset',
        targetHint: `Reset code for ${maskEmail(email)}`,
        lifetimeMs: RESET_LIFETIME_MS,
        pendingAuthId: null,
        email,
        phone: null,
      });
      return { status: 'issued', challenge: this.publicChallenge(challenge) };
    }

    // email-code / phone-otp ------------------------------------------------
    let email: string | null = null;
    let phone: string | null = null;
    let pendingAuthId: string | null = null;

    if (request.kind === 'email-code') {
      email = request.email.trim().toLowerCase();
      if (!isEmail(email)) return { status: 'invalid' };

      if (request.pendingAuthId) {
        const pending = this.pending.get(request.pendingAuthId);
        if (!pending || pending.expiresAt <= Date.now()) return { status: 'invalid' };
        // A linked challenge can only verify the account's own address.
        if (pending.email !== email) return { status: 'invalid' };
        pendingAuthId = request.pendingAuthId;

        const throttled = this.consumeRequestSlot(`email:${email}`);
        if (throttled) return throttled;

        const { error } = await client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        if (error) return this.mapChallengeError(error);
      } else {
        const throttled = this.consumeRequestSlot(`email:${email}`);
        if (throttled) return throttled;
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true },
        });
        if (error) return this.mapChallengeError(error);
      }
    } else {
      // phone-otp
      if (request.pendingAuthId) {
        const pending = this.pending.get(request.pendingAuthId);
        if (!pending || pending.expiresAt <= Date.now()) return { status: 'invalid' };
        if (!pending.phone) return { status: 'invalid' };
        phone = pending.phone;
        pendingAuthId = request.pendingAuthId;

        const throttled = this.consumeRequestSlot(`phone:${normalisePhone(phone)}`);
        if (throttled) return throttled;

        // Linking a number to the signed-in account: Supabase sends the OTP
        // through `updateUser`, verified as `phone_change`.
        const { error } = await client.auth.updateUser({ phone });
        if (error) return this.mapChallengeError(error);
      } else {
        phone = request.phone.trim();
        if (!isPhone(phone)) return { status: 'invalid' };

        const throttled = this.consumeRequestSlot(`phone:${normalisePhone(phone)}`);
        if (throttled) return throttled;

        const { error } = await client.auth.signInWithOtp({
          phone,
          options: { shouldCreateUser: true },
        });
        if (error) return this.mapChallengeError(error);
      }
    }

    const challenge = this.storeChallenge({
      kind: request.kind,
      targetHint:
        request.kind === 'email-code'
          ? `Email to ${maskEmail(email!)}`
          : `SMS to ${maskPhone(phone!)}`,
      lifetimeMs: CODE_LIFETIME_MS,
      pendingAuthId,
      email,
      phone,
    });
    return { status: 'issued', challenge: this.publicChallenge(challenge) };
  }

  async getChallenge(challengeId: string): Promise<AuthChallenge | null> {
    const found = this.challenges.get(challengeId);
    if (!found || found.expiresAt <= Date.now()) return null;
    return this.publicChallenge(found);
  }

  async getPendingContact(pendingAuthId: string): Promise<PendingContact | null> {
    const pending = this.pending.get(pendingAuthId);
    if (!pending || pending.expiresAt <= Date.now()) return null;
    const missing: VerificationKind[] = [];
    if (!pending.emailDone) missing.push('email');
    if (pending.role === 'member' && !pending.phoneDone) missing.push('phone');
    return { email: pending.email, phone: pending.phone, missing };
  }

  async verifyChallenge(challengeId: string, code: string): Promise<VerifyOutcome> {
    const client = await getSupabaseClient();
    if (!client) return { status: 'expired' };
    this.sweep();

    const found = this.challenges.get(challengeId);
    if (!found) return { status: 'expired' };
    if (found.expiresAt <= Date.now()) {
      this.challenges.delete(challengeId);
      return { status: 'expired' };
    }
    if (found.attemptsLeft <= 0) {
      this.challenges.delete(challengeId);
      return { status: 'locked' };
    }
    if (found.kind === 'password-reset' || found.kind === 'mfa') {
      return { status: 'invalid_code' };
    }

    const token = code.trim();
    let error: unknown = null;

    if (found.kind === 'email-code' && found.email) {
      ({ error } = await client.auth.verifyOtp({
        email: found.email,
        token,
        type: 'email',
      }));
    } else if (found.kind === 'phone-otp' && found.phone) {
      ({ error } = await client.auth.verifyOtp({
        phone: found.phone,
        token,
        type: found.pendingAuthId ? 'phone_change' : 'sms',
      }));
    } else {
      return { status: 'invalid_code' };
    }

    if (error) {
      found.attemptsLeft -= 1;
      if (isExpiredError(error)) {
        this.challenges.delete(challengeId);
        return { status: 'expired' };
      }
      if (found.attemptsLeft <= 0) {
        this.challenges.delete(challengeId);
        return { status: 'locked' };
      }
      return { status: 'invalid_code' };
    }

    this.challenges.delete(challengeId);

    if (found.pendingAuthId) {
      const pending = this.pending.get(found.pendingAuthId);
      if (pending) {
        const { data } = await client.auth.getUser();
        const user = data.user as LiveUser | null;
        if (user) {
          pending.emailDone = Boolean(user.email_confirmed_at);
          pending.phoneDone = Boolean(user.phone_confirmed_at);
          pending.phone = user.phone ?? pending.phone;
        }
      }
    }

    return { status: 'ok', challenge: this.publicChallenge(found) };
  }

  async verifyMfa(pendingAuthId: string, challengeId: string, code: string): Promise<VerifyOutcome> {
    const client = await getSupabaseClient();
    if (!client) return { status: 'expired' };
    this.sweep();

    const pending = this.pending.get(pendingAuthId);
    const found = this.challenges.get(challengeId);
    if (
      !pending ||
      !found ||
      found.kind !== 'mfa' ||
      found.pendingAuthId !== pendingAuthId ||
      !found.factorId ||
      !found.supabaseChallengeId
    ) {
      return { status: 'expired' };
    }
    if (found.expiresAt <= Date.now()) {
      this.challenges.delete(challengeId);
      return { status: 'expired' };
    }
    if (found.attemptsLeft <= 0) {
      this.challenges.delete(challengeId);
      return { status: 'locked' };
    }

    const { error } = await client.auth.mfa.verify({
      factorId: found.factorId,
      challengeId: found.supabaseChallengeId,
      code: code.trim(),
    });

    if (error) {
      found.attemptsLeft -= 1;
      if (isExpiredError(error)) {
        this.challenges.delete(challengeId);
        return { status: 'expired' };
      }
      if (found.attemptsLeft <= 0) {
        this.challenges.delete(challengeId);
        return { status: 'locked' };
      }
      return { status: 'invalid_code' };
    }

    const levels = await this.aal(client);
    if (levels.currentLevel !== 'aal2') {
      // Do not claim success unless the server actually promoted the session.
      pending.mfaDone = false;
      return { status: 'invalid_code' };
    }

    this.challenges.delete(challengeId);
    pending.mfaDone = true;
    return { status: 'ok', challenge: this.publicChallenge(found) };
  }

  // ------------------------------------------------------------------
  // First-time staff MFA enrolment (live only)
  // ------------------------------------------------------------------

  async startMfaEnrollment(pendingAuthId: string): Promise<MfaEnrollmentStart> {
    const client = await getSupabaseClient();
    if (!client) return { status: 'invalid' };
    this.sweep();

    const pending = this.pending.get(pendingAuthId);
    if (
      !pending ||
      pending.expiresAt <= Date.now() ||
      pending.role === 'member'
    ) {
      return { status: 'invalid' };
    }

    // The aal1 session must still belong to the pending account.
    const { data: userData, error: userError } = await client.auth.getUser();
    const user = userData.user as LiveUser | null;
    if (userError || !user || user.id !== pending.userId) return { status: 'invalid' };

    const { data: factors, error: listError } = await client.auth.mfa.listFactors();
    if (listError) return { status: 'invalid' };

    const verified = factors?.totp?.find((factor) => factor.status === 'verified');
    if (verified) return { status: 'already_enrolled' };

    // Remove abandoned unverified TOTP factors so repeated enrolment
    // attempts do not accumulate factors on the account.
    for (const factor of factors?.all ?? []) {
      if (factor.factor_type === 'totp' && factor.status === 'unverified') {
        try {
          await client.auth.mfa.unenroll({ factorId: factor.id });
        } catch {
          // A stale factor must not block a fresh enrolment.
        }
      }
    }

    const { data, error } = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Pulse ${pending.role === 'owner' ? 'Owner' : 'Reception'} · ${pending.email}`,
    });

    const enrollment = data as
      | { id?: string; type?: string; totp?: { secret?: string; uri?: string } }
      | null;
    if (
      error ||
      !enrollment?.id ||
      !enrollment.totp?.secret ||
      !enrollment.totp.uri
    ) {
      return { status: 'invalid' };
    }

    return {
      status: 'ready',
      enrollment: {
        factorId: enrollment.id,
        friendlyName: `Pulse ${pending.role === 'owner' ? 'Owner' : 'Reception'} · ${pending.email}`,
        // These are shown once to the signed-in staff member and never
        // persisted by the app.
        secret: enrollment.totp.secret,
        uri: enrollment.totp.uri,
      },
    };
  }

  async completeMfaEnrollment(
    pendingAuthId: string,
    factorId: string,
    code: string,
  ): Promise<MfaEnrollmentResult> {
    const client = await getSupabaseClient();
    if (!client) return { status: 'invalid' };
    this.sweep();

    const pending = this.pending.get(pendingAuthId);
    if (
      !pending ||
      pending.expiresAt <= Date.now() ||
      pending.role === 'member' ||
      !factorId
    ) {
      return { status: 'invalid' };
    }

    const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
      factorId,
    });
    if (challengeError || !challenge) {
      return { status: isExpiredError(challengeError) ? 'expired' : 'invalid' };
    }

    const { error } = await client.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });

    if (error) {
      if (errorStatus(error) === 429) return { status: 'locked' };
      if (isExpiredError(error)) return { status: 'expired' };
      return { status: 'invalid_code' };
    }

    const levels = await this.aal(client);
    if (levels.currentLevel !== 'aal2') {
      // Never claim AAL2 unless the server actually promoted the session.
      return { status: 'invalid_code' };
    }

    pending.mfaDone = true;
    return { status: 'ok' };
  }

  // ------------------------------------------------------------------
  // Pending sign-in completion, reset, sessions
  // ------------------------------------------------------------------

  async completeSignIn(pendingAuthId: string): Promise<CompleteSignInResult> {
    const client = await getSupabaseClient();
    if (!client) return { status: 'invalid' };
    this.sweep();

    const pending = this.pending.get(pendingAuthId);
    if (!pending || pending.expiresAt <= Date.now()) {
      this.pending.delete(pendingAuthId);
      return { status: 'invalid' };
    }

    const { data: userData, error: userError } = await client.auth.getUser();
    const user = userData.user as LiveUser | null;
    if (userError || !user || user.id !== pending.userId) {
      this.pending.delete(pendingAuthId);
      return { status: 'invalid' };
    }

    // Re-read the authoritative role: it must still match the pending check.
    const profile = await this.readProfile(client, pending.userId);
    if (!profile || profile.is_active === false || profile.role !== pending.role) {
      this.pending.delete(pendingAuthId);
      return { status: 'invalid' };
    }

    if (!user.email_confirmed_at) return { status: 'invalid' };
    if (pending.role === 'member' && !user.phone_confirmed_at) return { status: 'invalid' };

    let mfaVerified = true;
    if (pending.role !== 'member') {
      const levels = await this.aal(client);
      if (levels.currentLevel !== 'aal2') return { status: 'invalid' };
      mfaVerified = true;
    }

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    const session = sessionData.session as SupabaseSessionLike | null;
    if (sessionError || !session) return { status: 'invalid' };

    this.pending.delete(pendingAuthId);
    return {
      status: 'ok',
      session: this.toAuthSession(user, profile, session, mfaVerified),
      tokens: this.toTokens(session),
    };
  }

  async resetPassword(
    challengeId: string,
    code: string,
    newPassword: string,
  ): Promise<PasswordResetResult> {
    const client = await getSupabaseClient();
    if (!client) return { status: 'expired' };
    this.sweep();

    const found = this.challenges.get(challengeId);
    if (!found || found.kind !== 'password-reset' || !found.email) return { status: 'invalid_code' };
    if (checkPassword(newPassword) !== 'ok') return { status: 'invalid_password' };
    if (found.expiresAt <= Date.now()) {
      this.challenges.delete(challengeId);
      return { status: 'expired' };
    }
    if (found.attemptsLeft <= 0) {
      this.challenges.delete(challengeId);
      return { status: 'locked' };
    }

    const { error } = await client.auth.verifyOtp({
      email: found.email,
      token: code.trim(),
      type: 'recovery',
    });
    if (error) {
      found.attemptsLeft -= 1;
      if (isExpiredError(error)) {
        this.challenges.delete(challengeId);
        return { status: 'expired' };
      }
      if (found.attemptsLeft <= 0) {
        this.challenges.delete(challengeId);
        return { status: 'locked' };
      }
      return { status: 'invalid_code' };
    }

    const { error: updateError } = await client.auth.updateUser({ password: newPassword });
    if (updateError) return { status: 'invalid_password' };

    this.challenges.delete(challengeId);
    // Recovery invalidates the temporary session this verification created.
    await this.safeSignOut(client);
    return { status: 'ok' };
  }

  async refreshSession(refreshToken: string): Promise<RefreshResult> {
    const client = await getSupabaseClient();
    if (!client) return { status: 'revoked' };

    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    const session = data.session as SupabaseSessionLike | null;
    if (error || !session) return { status: 'revoked' };

    const built = await this.sessionFromSupabase(client, session);
    if (!built) return { status: 'revoked' };
    return { status: 'ok', session: built, tokens: this.toTokens(session) };
  }

  async signOut(_accessToken: string): Promise<void> {
    const client = await getSupabaseClient();
    if (!client) return;
    await this.safeSignOut(client);
  }

  async getSession(accessToken: string): Promise<AuthSession | null> {
    const client = await getSupabaseClient();
    if (!client) return null;

    // Validate the token against the Auth server (not just local state).
    const { data, error } = await client.auth.getUser(accessToken);
    const user = data.user as LiveUser | null;
    if (error || !user) return null;

    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData.session as SupabaseSessionLike | null;
    if (!session || session.user.id !== user.id) return null;

    return this.sessionFromSupabase(client, session);
  }

  // ------------------------------------------------------------------
  // Supabase helpers
  // ------------------------------------------------------------------

  private async readProfile(client: AppSupabaseClient, userId: string): Promise<ProfileRow | null> {
    const { data, error } = await client
      .from('profiles')
      .select('role, display_name, phone, is_active')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    return (data as ProfileRow | null) ?? null;
  }

  private async provision(
    client: AppSupabaseClient,
    user: LiveUser,
    name: string | null,
    phone: string | null,
  ): Promise<boolean> {
    const metaName = name ?? this.metadataName(user);
    const metaPhone = phone ?? this.metadataPhone(user) ?? user.phone ?? null;
    const { error } = await client.rpc('provision_member_profile', {
      p_display_name: metaName,
      p_phone: metaPhone,
    });
    return !error;
  }

  private async aal(client: AppSupabaseClient): Promise<{ currentLevel: string; nextLevel: string }> {
    const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return {
      currentLevel: data?.currentLevel ?? 'aal1',
      nextLevel: data?.nextLevel ?? 'aal1',
    };
  }

  private async createMfaChallenge(
    client: AppSupabaseClient,
    pendingAuthId: string,
    user: Pick<LiveUser, 'id'> & { email?: string | null },
  ): Promise<LiveChallenge | null> {
    const { data: factors, error } = await client.auth.mfa.listFactors();
    if (error) return null;
    const factor = factors?.totp?.find((entry) => entry.status === 'verified');
    if (!factor) return null;

    const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
      factorId: factor.id,
    });
    if (challengeError || !challenge) return null;

    // A resend replaces the previous MFA challenge for this pending sign-in.
    for (const [id, existing] of this.challenges) {
      if (existing.kind === 'mfa' && existing.pendingAuthId === pendingAuthId) {
        this.challenges.delete(id);
      }
    }

    const now = Date.now();
    const record: LiveChallenge = {
      challengeId: randomId('live-mfa'),
      kind: 'mfa',
      targetHint: user.email ? `Authenticator code · ${maskEmail(user.email)}` : 'Authenticator code',
      expiresAt: challenge.expires_at ? challenge.expires_at * 1000 : now + CODE_LIFETIME_MS,
      resendAllowedAt: now + RESEND_COOLDOWN_MS,
      attemptsLeft: MAX_CODE_ATTEMPTS,
      pendingAuthId,
      email: user.email ?? null,
      phone: null,
      factorId: factor.id,
      supabaseChallengeId: challenge.id,
    };
    this.challenges.set(record.challengeId, record);
    return record;
  }

  private storeChallenge(input: {
    kind: AuthChallenge['kind'];
    targetHint: string;
    lifetimeMs: number;
    pendingAuthId: string | null;
    email: string | null;
    phone: string | null;
  }): LiveChallenge {
    const now = Date.now();
    // A resend of the same purpose replaces the previous code.
    for (const [id, existing] of this.challenges) {
      if (
        existing.kind === input.kind &&
        existing.pendingAuthId === input.pendingAuthId &&
        (existing.email ?? existing.phone) === (input.email ?? input.phone)
      ) {
        this.challenges.delete(id);
      }
    }
    const record: LiveChallenge = {
      challengeId: randomId('live-ch'),
      kind: input.kind,
      targetHint: input.targetHint,
      expiresAt: now + input.lifetimeMs,
      resendAllowedAt: now + RESEND_COOLDOWN_MS,
      attemptsLeft: MAX_CODE_ATTEMPTS,
      pendingAuthId: input.pendingAuthId,
      email: input.email,
      phone: input.phone,
      factorId: null,
      supabaseChallengeId: null,
    };
    this.challenges.set(record.challengeId, record);
    return record;
  }

  private publicChallenge(found: LiveChallenge): AuthChallenge {
    const now = Date.now();
    return {
      challengeId: found.challengeId,
      kind: found.kind,
      expiresInSeconds: Math.max(0, Math.ceil((found.expiresAt - now) / 1000)),
      resendCooldownSeconds: Math.max(0, Math.ceil((found.resendAllowedAt - now) / 1000)),
      remainingAttempts: found.attemptsLeft,
      targetHint: found.targetHint,
      // Never populated by a live provider.
      demoCode: undefined,
    };
  }

  private consumeRequestSlot(key: string): ChallengeOutcome | null {
    const now = Date.now();
    const counts = this.requestCounts.get(key);
    if (counts && counts.windowStart + REQUEST_WINDOW_MS > now) {
      if (counts.count >= MAX_REQUESTS) {
        return {
          status: 'rate_limited',
          retryAfterSeconds: Math.ceil((counts.windowStart + REQUEST_WINDOW_MS - now) / 1000),
        };
      }
      counts.count += 1;
    } else {
      this.requestCounts.set(key, { count: 1, windowStart: now });
    }

    const last = this.lastSentAt.get(key);
    if (last !== undefined && last + RESEND_COOLDOWN_MS > now) {
      return { status: 'cooldown', retryAfterSeconds: Math.ceil((last + RESEND_COOLDOWN_MS - now) / 1000) };
    }
    this.lastSentAt.set(key, now);
    return null;
  }

  private async sessionFromSupabase(
    client: AppSupabaseClient,
    session: SupabaseSessionLike,
  ): Promise<AuthSession | null> {
    const user = session.user;
    const profile = await this.readProfile(client, user.id);
    if (!profile || profile.is_active === false) return null;

    let mfaVerified = true;
    if (profile.role !== 'member') {
      const levels = await this.aal(client);
      // A staff session that is not at AAL2 cannot write; do not report it.
      if (levels.currentLevel !== 'aal2') return null;
      mfaVerified = true;
    }

    return this.toAuthSession(user, profile, session, mfaVerified);
  }

  private toAuthSession(
    user: LiveUser,
    profile: ProfileRow,
    session: SupabaseSessionLike,
    mfaVerified: boolean,
  ): AuthSession {
    const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now();
    return {
      userId: user.id,
      role: profile.role,
      email: (user.email ?? '').toLowerCase(),
      phone: user.phone ?? profile.phone ?? null,
      displayName: profile.display_name ?? this.metadataName(user) ?? 'Member',
      emailVerified: Boolean(user.email_confirmed_at),
      phoneVerified: Boolean(user.phone_confirmed_at),
      mfaVerified,
      issuedAt: Date.now(),
      expiresAt,
    };
  }

  private toTokens(session: SupabaseSessionLike): SessionTokens {
    const accessExpiresAt = session.expires_at ? session.expires_at * 1000 : Date.now();
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      accessExpiresAt,
      // Supabase rotates refresh tokens; the server owns the real lifetime.
      // This value is a client-side hint only.
      refreshExpiresAt: accessExpiresAt + 7 * 24 * 60 * 60_000,
    };
  }

  private mapSignUpError(error: unknown): SignUpResult {
    const code = errorCode(error);
    if (code === 'user_already_exists' || code === 'email_exists') {
      return { status: 'duplicate', field: 'email' };
    }
    if (code === 'phone_exists') return { status: 'duplicate', field: 'phone' };
    if (errorStatus(error) === 429) return { status: 'invalid', field: 'email' };
    return { status: 'invalid', field: 'email' };
  }

  private mapChallengeError(error: unknown): ChallengeOutcome {
    if (errorStatus(error) === 429) return { status: 'rate_limited', retryAfterSeconds: 60 };
    return { status: 'invalid' };
  }

  private metadataName(user: LiveUser): string | null {
    const meta = user.user_metadata ?? {};
    const value = meta.full_name ?? meta.name;
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private metadataPhone(user: LiveUser): string | null {
    const value = (user.user_metadata ?? {}).phone;
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private async safeSignOut(client: AppSupabaseClient): Promise<void> {
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // Sign-out must never block the caller; token store clearing happens
      // in the session manager.
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, pending] of this.pending) {
      if (pending.expiresAt <= now) this.pending.delete(id);
    }
    for (const [id, challenge] of this.challenges) {
      if (challenge.expiresAt <= now) this.challenges.delete(id);
    }
  }
}

/** App singleton. */
export const liveAuthProvider = new LiveAuthProvider();
