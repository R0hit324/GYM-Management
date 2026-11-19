/**
 * Demo authentication provider — the Part 2 stand-in for the real backend.
 *
 * It is a COMPLETE implementation of the `AuthProvider` contract with real
 * security logic: credential checks against immutable account roles,
 * sign-in rate limiting with lockout, one-time codes with expiry /
 * resend cooldown / attempt caps / replay protection, staff MFA, pending
 * sign-in states, refresh-token rotation and logout revocation. It is NOT
 * a fake success machine — every rule a live backend enforces is enforced
 * here.
 *
 * What it cannot do (and says so honestly everywhere in the UI):
 * - nothing is actually delivered: no SMS, no email. The challenge code is
 *   surfaced on screen through `demoCode` (demo-only contract field).
 * - all state is in-memory, so accounts/sessions end when the app process
 *   ends. Session restore across restarts becomes real with the live
 *   provider (the session storage layer is already built for it).
 *
 * The UI must keep the demo badges visible while `provider.mode === 'demo'`.
 */
import { demoPlans } from '@/data/demo';
import { isEmail, isPhone } from '@/utils/format';
import type {
  AuthChallenge,
  AuthProvider,
  AuthRole,
  AuthSession,
  ChallengeOutcome,
  ChallengeRequest,
  CompleteSignInResult,
  MemberSignUpInput,
  PasswordResetResult,
  PendingContact,
  RefreshResult,
  SessionTokens,
  SignInResult,
  SignUpResult,
  VerifyOutcome,
} from '@/services/auth/types';

interface DemoAccount {
  userId: string;
  role: AuthRole;
  email: string; // normalised (lowercase)
  phone: string | null;
  displayName: string;
  password: string;
  planId: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
}

interface DemoPendingAuth {
  userId: string;
  createdAt: number;
  expiresAt: number;
  mfaDone: boolean;
  emailDone: boolean;
  phoneDone: boolean;
}

interface DemoChallenge {
  challengeId: string;
  kind: AuthChallenge['kind'];
  code: string;
  createdAt: number;
  expiresAt: number;
  resendAllowedAt: number;
  attemptsLeft: number;
  targetHint: string;
  /** Login/join account linkage where one applies. */
  pendingAuthId: string | null;
  /** Lowercased email the challenge belongs to (login verification / reset). */
  emailKey: string | null;
  /** Phone the challenge belongs to (join flow). */
  phone: string | null;
  /** True when this reset challenge belongs to a real account. */
  resetTargetExists: boolean;
}

interface DemoSession {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  session: AuthSession;
}

export interface DemoProviderConfig {
  /** Injectable clock (tests advance it). Default Date.now. */
  now?: () => number;
  accessLifetimeMs?: number;
  refreshLifetimeMs?: number;
  codeLifetimeMs?: number;
  resetCodeLifetimeMs?: number;
  resendCooldownMs?: number;
  maxCodeAttempts?: number;
  maxSignInAttempts?: number;
  signInLockMs?: number;
  pendingLifetimeMs?: number;
  /** Challenge requests allowed per target inside `requestWindowMs`. */
  maxRequestsPerTarget?: number;
  requestWindowMs?: number;
}

const DEFAULTS = {
  accessLifetimeMs: 15 * 60_000,
  refreshLifetimeMs: 7 * 24 * 60 * 60_000,
  codeLifetimeMs: 5 * 60_000,
  resetCodeLifetimeMs: 10 * 60_000,
  resendCooldownMs: 30_000,
  maxCodeAttempts: 5,
  maxSignInAttempts: 5,
  signInLockMs: 60_000,
  pendingLifetimeMs: 10 * 60_000,
  maxRequestsPerTarget: 5,
  requestWindowMs: 10 * 60_000,
} as const;

export type PasswordCheck = 'ok' | 'short' | 'weak';

/** Shared password policy: at least 8 characters with a letter and a digit. */
export function checkPassword(password: string): PasswordCheck {
  if (password.length < 8) return 'short';
  return /[A-Za-z]/.test(password) && /\d/.test(password) ? 'ok' : 'weak';
}

/** Demo identities shown honestly on the login screen while mode=demo. */
export const demoCredentials = [
  { role: 'owner' as AuthRole, email: 'owner@pulse.demo', password: 'Pulse#Owner1', mfa: true },
  { role: 'receptionist' as AuthRole, email: 'reception@pulse.demo', password: 'Pulse#Front1', mfa: true },
  { role: 'member' as AuthRole, email: 'arjun@example.com', password: 'Pulse#Member1', mfa: false },
];

function randomId(prefix: string): string {
  let out = '';
  for (let i = 0; i < 4; i++) out += Math.random().toString(36).slice(2, 10);
  return `${prefix}-${out}`;
}

function randomCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `${phone.slice(0, Math.max(0, phone.length - 4)).replace(/\d/g, '•')}${phone.slice(-4)}`;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const shown = user.slice(0, 2);
  return `${shown}${'•'.repeat(Math.max(3, user.length - 2))}@${domain}`;
}

type DemoConfig = Required<DemoProviderConfig>;

export class DemoAuthProvider implements AuthProvider {
  readonly mode = 'demo' as const;

  private readonly cfg: DemoConfig;
  private accounts = new Map<string, DemoAccount>();
  private pending = new Map<string, DemoPendingAuth>();
  private challenges = new Map<string, DemoChallenge>();
  private sessions = new Map<string, DemoSession>();
  private refreshIndex = new Map<string, string>(); // refreshToken -> accessToken
  private userSessions = new Map<string, Set<string>>(); // userId -> access tokens
  private signInFailures = new Map<string, { count: number; lockedUntil: number }>();
  private lastSendAt = new Map<string, number>();
  private requestCounts = new Map<string, { count: number; windowStart: number }>();

  constructor(config: DemoProviderConfig = {}) {
    this.cfg = {
      ...DEFAULTS,
      ...config,
      now: config.now ?? Date.now,
    };
    this.seedAccounts();
  }

  private get now(): number {
    return this.cfg.now();
  }

  private seedAccounts() {
    for (const cred of demoCredentials) {
      const phone = cred.role === 'member' ? '+91 98765 45120' : null;
      this.accounts.set(cred.email.toLowerCase(), {
        userId: `demo-${cred.role}`,
        role: cred.role,
        email: cred.email.toLowerCase(),
        phone,
        displayName: cred.role === 'owner' ? 'Gym Owner' : cred.role === 'receptionist' ? 'Front Desk' : 'Arjun Mehta',
        password: cred.password,
        planId: cred.role === 'member' ? 'plan-monthly' : null,
        emailVerified: true,
        phoneVerified: true,
      });
    }
  }

  // ------------------------------------------------------------------
  // Sign in / sign up
  // ------------------------------------------------------------------

  async signIn(email: string, password: string, expectedRole: AuthRole): Promise<SignInResult> {
    this.sweep();
    const key = email.trim().toLowerCase();
    const lock = this.signInFailures.get(key);
    if (lock && lock.lockedUntil > this.now) {
      return { status: 'rate_limited', retryAfterSeconds: Math.ceil((lock.lockedUntil - this.now) / 1000) };
    }

    const account = this.accounts.get(key);
    // The expected role is an expectation, never evidence: the password AND
    // the account's immutable role must both match. One coarse failure.
    if (!account || account.password !== password || account.role !== expectedRole) {
      const next = { count: (lock?.count ?? 0) + 1, lockedUntil: 0 };
      if (next.count >= this.cfg.maxSignInAttempts) {
        next.lockedUntil = this.now + this.cfg.signInLockMs;
        next.count = 0;
      }
      this.signInFailures.set(key, next);
      return { status: 'invalid' };
    }

    this.signInFailures.delete(key);
    const pendingId = randomId('pa');
    this.pending.set(pendingId, {
      userId: account.userId,
      createdAt: this.now,
      expiresAt: this.now + this.cfg.pendingLifetimeMs,
      mfaDone: false,
      emailDone: false,
      phoneDone: false,
    });

    const missing: ('email' | 'phone')[] = [];
    if (!account.emailVerified) missing.push('email');
    if (account.role === 'member' && !account.phoneVerified) missing.push('phone');
    if (missing.length > 0) {
      return { status: 'verification_required', pendingAuthId: pendingId, missing };
    }

    if (account.role === 'owner' || account.role === 'receptionist') {
      const challenge = this.toPublicChallenge(
        this.createChallenge(
          { kind: 'mfa', pendingAuthId: pendingId },
          `Authenticator code · ${maskEmail(account.email)}`,
          this.cfg.codeLifetimeMs,
        ),
        true,
      );
      return { status: 'mfa_required', pendingAuthId: pendingId, challenge };
    }

    return { status: 'ok', pendingAuthId: pendingId };
  }

  async signUpMember(input: MemberSignUpInput): Promise<SignUpResult> {
    this.sweep();
    const name = input.fullName.trim();
    if (name.split(/\s+/).length < 2) return { status: 'invalid', field: 'name' };
    const phone = input.phone.trim();
    if (!isPhone(phone)) return { status: 'invalid', field: 'phone' };
    const email = input.email.trim().toLowerCase();
    if (!isEmail(email)) return { status: 'invalid', field: 'email' };
    if (checkPassword(input.password) !== 'ok') return { status: 'invalid', field: 'password' };
    if (!demoPlans.some((p) => p.id === input.planId)) return { status: 'invalid', field: 'plan' };

    if (this.accounts.has(email)) return { status: 'duplicate', field: 'email' };
    for (const account of this.accounts.values()) {
      if (account.phone && account.phone.replace(/\D/g, '') === phone.replace(/\D/g, '')) {
        return { status: 'duplicate', field: 'phone' };
      }
    }

    const userId = randomId('u');
    this.accounts.set(email, {
      userId,
      role: 'member',
      email,
      phone,
      displayName: name,
      password: input.password,
      planId: input.planId,
      // A check counts as verified only when the matching verified claim
      // from a single-use challenge arrived with the submission.
      emailVerified: (input.verifiedEmail ?? '').trim().toLowerCase() === email,
      phoneVerified: (input.verifiedPhone ?? '').replace(/\D/g, '') === phone.replace(/\D/g, ''),
    });
    return { status: 'ok', userId, email };
  }

  // ------------------------------------------------------------------
  // Challenges
  // ------------------------------------------------------------------

  async requestChallenge(request: ChallengeRequest): Promise<ChallengeOutcome> {
    this.sweep();
    const { kind } = request;

    let throttleKey: string;
    let targetHint: string;
    let lifetime: number;
    let pendingAuthId: string | null = null;
    let emailKey: string | null = null;
    let phone: string | null = null;
    let resetTargetExists = false;

    switch (kind) {
      case 'phone-otp': {
        // Linked sign-in verification: the challenge target is the
        // account's own phone — a client can never verify a different
        // number against an account.
        if (request.pendingAuthId) {
          const pending = this.pending.get(request.pendingAuthId);
          const linkedAccount = pending ? this.findAccountByUserId(pending.userId) : null;
          if (!pending || pending.expiresAt <= this.now || !linkedAccount?.phone) return { status: 'invalid' };
          throttleKey = `phone-otp:pending:${request.pendingAuthId}`;
          targetHint = `SMS to ${maskPhone(linkedAccount.phone)}`;
          lifetime = this.cfg.codeLifetimeMs;
          pendingAuthId = request.pendingAuthId;
          phone = linkedAccount.phone;
          break;
        }
        if (!isPhone(request.phone)) return { status: 'invalid' };
        throttleKey = `phone-otp:${request.phone.replace(/\D/g, '')}`;
        targetHint = `SMS to ${maskPhone(request.phone)}`;
        lifetime = this.cfg.codeLifetimeMs;
        phone = request.phone;
        break;
      }
      case 'email-code': {
        const email = request.email.trim().toLowerCase();
        if (!isEmail(email)) return { status: 'invalid' };
        if (request.pendingAuthId) {
          const pending = this.pending.get(request.pendingAuthId);
          const linkedAccount = pending ? this.findAccountByUserId(pending.userId) : null;
          if (!pending || pending.expiresAt <= this.now || linkedAccount?.email !== email) return { status: 'invalid' };
          throttleKey = `email-code:pending:${request.pendingAuthId}`;
          targetHint = `Email to ${maskEmail(email)}`;
          lifetime = this.cfg.codeLifetimeMs;
          pendingAuthId = request.pendingAuthId;
          emailKey = email;
          break;
        }
        throttleKey = `email-code:${email}`;
        targetHint = `Email to ${maskEmail(email)}`;
        lifetime = this.cfg.codeLifetimeMs;
        emailKey = email;
        break;
      }
      case 'mfa': {
        const pending = this.pending.get(request.pendingAuthId);
        if (!pending || pending.expiresAt <= this.now) return { status: 'invalid' };
        const account = this.findAccountByUserId(pending.userId);
        if (!account) return { status: 'invalid' };
        throttleKey = `mfa:${request.pendingAuthId}`;
        targetHint = `Authenticator code · ${maskEmail(account.email)}`;
        lifetime = this.cfg.codeLifetimeMs;
        pendingAuthId = request.pendingAuthId;
        emailKey = account.email;
        break;
      }
      case 'password-reset': {
        const email = request.email.trim().toLowerCase();
        if (!isEmail(email)) return { status: 'invalid' };
        throttleKey = `password-reset:${email}`;
        targetHint = `Reset code for ${maskEmail(email)}`;
        lifetime = this.cfg.resetCodeLifetimeMs;
        emailKey = email;
        // Account existence is never disclosed: unknown emails get a dead
        // challenge that still behaves like a real one.
        resetTargetExists = this.accounts.has(email);
        break;
      }
    }

    // Request throttle (per target, sliding window).
    const counts = this.requestCounts.get(throttleKey);
    if (counts && counts.windowStart + this.cfg.requestWindowMs > this.now) {
      if (counts.count >= this.cfg.maxRequestsPerTarget) {
        return {
          status: 'rate_limited',
          retryAfterSeconds: Math.ceil((counts.windowStart + this.cfg.requestWindowMs - this.now) / 1000),
        };
      }
      counts.count += 1;
    } else {
      this.requestCounts.set(throttleKey, { count: 1, windowStart: this.now });
    }

    // Resend cooldown.
    const last = this.lastSendAt.get(throttleKey);
    if (last !== undefined && last + this.cfg.resendCooldownMs > this.now) {
      return {
        status: 'cooldown',
        retryAfterSeconds: Math.ceil((last + this.cfg.resendCooldownMs - this.now) / 1000),
      };
    }
    this.lastSendAt.set(throttleKey, this.now);

    const created = this.createChallenge(
      { kind, pendingAuthId, emailKey, phone, resetTargetExists },
      targetHint,
      lifetime,
    );
    // Demo contract: the code is surfaced ONLY when there is something to
    // verify against (a real provider never sets demoCode at all).
    const surfaceCode = kind !== 'password-reset' || resetTargetExists;
    return { status: 'issued', challenge: this.toPublicChallenge(created, surfaceCode) };
  }

  async getChallenge(challengeId: string): Promise<AuthChallenge | null> {
    const found = this.challenges.get(challengeId);
    if (!found) return null;
    if (found.expiresAt <= this.now) return null;
    return this.toPublicChallenge(found, found.resetTargetExists);
  }

  async getPendingContact(pendingAuthId: string): Promise<PendingContact | null> {
    const pending = this.pending.get(pendingAuthId);
    if (!pending || pending.expiresAt <= this.now) return null;
    const account = this.findAccountByUserId(pending.userId);
    if (!account) return null;
    const missing: ('email' | 'phone')[] = [];
    if (!account.emailVerified) missing.push('email');
    if (account.role === 'member' && !account.phoneVerified) missing.push('phone');
    return { email: account.email, phone: account.phone, missing };
  }

  async verifyChallenge(challengeId: string, code: string): Promise<VerifyOutcome> {
    this.sweep();
    const found = this.challenges.get(challengeId);
    if (!found) return { status: 'expired' };
    if (found.expiresAt <= this.now) {
      this.challenges.delete(challengeId);
      return { status: 'expired' };
    }
    if (found.attemptsLeft <= 0) {
      this.challenges.delete(challengeId);
      return { status: 'locked' };
    }
    if (found.code !== code.trim()) {
      found.attemptsLeft -= 1;
      if (found.attemptsLeft <= 0) {
        this.challenges.delete(challengeId);
        return { status: 'locked' };
      }
      return { status: 'invalid_code' };
    }
    // Single use — the code dies here (replay protection).
    this.challenges.delete(challengeId);

    // Linked challenges advance their pending sign-in and account flags.
    if (found.pendingAuthId) {
      const linked = this.pending.get(found.pendingAuthId);
      const account = linked ? this.findAccountByUserId(linked.userId) : null;
      if (linked && account) {
        // The challenge must still target the account's own contact — the
        // flags only move when the verified detail is the account's.
        if (found.kind === 'email-code' && account.email === found.emailKey) {
          account.emailVerified = true;
          linked.emailDone = true;
        } else if (found.kind === 'phone-otp' && account.phone && account.phone === found.phone) {
          account.phoneVerified = true;
          linked.phoneDone = true;
        }
      }
    }
    return { status: 'ok', challenge: this.toPublicChallenge(found, found.resetTargetExists) };
  }

  async verifyMfa(pendingAuthId: string, challengeId: string, code: string): Promise<VerifyOutcome> {
    const pending = this.pending.get(pendingAuthId);
    const challenge = this.challenges.get(challengeId);
    if (!pending || !challenge || challenge.pendingAuthId !== pendingAuthId || challenge.kind !== 'mfa') {
      return { status: 'expired' };
    }
    const outcome = await this.verifyChallenge(challengeId, code);
    if (outcome.status === 'ok') {
      pending.mfaDone = true;
    }
    return outcome;
  }

  // ------------------------------------------------------------------
  // Pending sign-in completion, reset, sessions
  // ------------------------------------------------------------------

  async completeSignIn(pendingAuthId: string): Promise<CompleteSignInResult> {
    this.sweep();
    const pending = this.pending.get(pendingAuthId);
    if (!pending || pending.expiresAt <= this.now) {
      this.pending.delete(pendingAuthId);
      return { status: 'invalid' };
    }
    const account = this.findAccountByUserId(pending.userId);
    if (!account) return { status: 'invalid' };

    const missingMfa = (account.role === 'owner' || account.role === 'receptionist') && !pending.mfaDone;
    const missingEmail = !account.emailVerified;
    const missingPhone = account.role === 'member' && !account.phoneVerified;
    if (missingMfa || missingEmail || missingPhone) return { status: 'invalid' };

    this.pending.delete(pendingAuthId);
    const tokens = this.issueSession(account);
    const session = this.sessions.get(tokens.accessToken)!.session;
    return { status: 'ok', session, tokens };
  }

  async resetPassword(challengeId: string, code: string, newPassword: string): Promise<PasswordResetResult> {
    const found = this.challenges.get(challengeId);
    if (!found) return { status: 'expired' };
    if (found.kind !== 'password-reset') return { status: 'invalid_code' };
    if (checkPassword(newPassword) !== 'ok') return { status: 'invalid_password' };
    if (found.expiresAt <= this.now) {
      this.challenges.delete(challengeId);
      return { status: 'expired' };
    }
    if (found.attemptsLeft <= 0) {
      this.challenges.delete(challengeId);
      return { status: 'locked' };
    }
    if (found.code !== code.trim()) {
      found.attemptsLeft -= 1;
      return found.attemptsLeft <= 0 ? (this.challenges.delete(challengeId), { status: 'locked' }) : { status: 'invalid_code' };
    }
    // Dead challenge (enumeration guard): the code "works" but there is no
    // account to reset, so the outcome stays coarse.
    if (!found.resetTargetExists || !found.emailKey) {
      this.challenges.delete(challengeId);
      return { status: 'invalid_code' };
    }
    const account = this.accounts.get(found.emailKey);
    if (!account) {
      this.challenges.delete(challengeId);
      return { status: 'invalid_code' };
    }
    // Single use.
    this.challenges.delete(challengeId);
    account.password = newPassword;
    // Recovery safeguard: every existing session of this account dies.
    this.revokeUserSessions(account.userId);
    return { status: 'ok' };
  }

  async refreshSession(refreshToken: string): Promise<RefreshResult> {
    this.sweep();
    const accessToken = this.refreshIndex.get(refreshToken);
    if (!accessToken) return { status: 'revoked' };
    const entry = this.sessions.get(accessToken);
    if (!entry || entry.refreshToken !== refreshToken) return { status: 'revoked' };
    if (entry.refreshExpiresAt <= this.now) {
      this.revokeSession(accessToken);
      return { status: 'revoked' };
    }
    // Rotation: the presented refresh token is single-use; the old access
    // token dies with it.
    this.revokeSession(accessToken);
    const account = this.findAccountByUserId(entry.session.userId);
    if (!account) return { status: 'revoked' };
    const tokens = this.issueSession(account);
    const session = this.sessions.get(tokens.accessToken)!.session;
    return { status: 'ok', session, tokens };
  }

  async signOut(accessToken: string): Promise<void> {
    this.revokeSession(accessToken);
  }

  async getSession(accessToken: string): Promise<AuthSession | null> {
    const entry = this.sessions.get(accessToken);
    if (!entry) return null;
    // Pure read: an expired access token reports null but does NOT revoke
    // the session — the refresh token stays usable for the transparent
    // refresh path (restore/401 flows). The sweep retires sessions only
    // once BOTH tokens are past their lifetimes.
    if (entry.accessExpiresAt <= this.now) return null;
    return entry.session;
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private createChallenge(
    input: {
      kind: AuthChallenge['kind'];
      pendingAuthId?: string | null;
      emailKey?: string | null;
      phone?: string | null;
      resetTargetExists?: boolean;
    },
    targetHint: string,
    lifetime: number,
  ): DemoChallenge {
    // A resend of the same purpose replaces the previous code (and its
    // attempts) — the old challenge id stops working immediately.
    if (input.pendingAuthId) {
      for (const [id, existing] of this.challenges) {
        if (existing.kind === input.kind && existing.pendingAuthId === input.pendingAuthId) {
          this.challenges.delete(id);
        }
      }
    }
    const challengeId = randomId('ch');
    const challenge: DemoChallenge = {
      challengeId,
      kind: input.kind,
      code: randomCode(),
      createdAt: this.now,
      expiresAt: this.now + lifetime,
      resendAllowedAt: this.now + this.cfg.resendCooldownMs,
      attemptsLeft: this.cfg.maxCodeAttempts,
      targetHint,
      pendingAuthId: input.pendingAuthId ?? null,
      emailKey: input.emailKey ?? null,
      phone: input.phone ?? null,
      resetTargetExists: input.resetTargetExists ?? false,
    };
    this.challenges.set(challengeId, challenge);
    return challenge;
  }

  private toPublicChallenge(found: DemoChallenge, surfaceCode: boolean): AuthChallenge {
    return {
      challengeId: found.challengeId,
      kind: found.kind,
      expiresInSeconds: Math.max(0, Math.ceil((found.expiresAt - this.now) / 1000)),
      resendCooldownSeconds: Math.max(0, Math.ceil((found.resendAllowedAt - this.now) / 1000)),
      remainingAttempts: found.attemptsLeft,
      targetHint: found.targetHint,
      demoCode: surfaceCode ? found.code : undefined,
    };
  }

  private issueSession(account: DemoAccount): SessionTokens {
    const accessToken = randomId('at');
    const refreshToken = randomId('rt');
    const now = this.now;
    const tokens: SessionTokens = {
      accessToken,
      refreshToken,
      accessExpiresAt: now + this.cfg.accessLifetimeMs,
      refreshExpiresAt: now + this.cfg.refreshLifetimeMs,
    };
    const session: AuthSession = {
      userId: account.userId,
      role: account.role,
      email: account.email,
      phone: account.phone,
      displayName: account.displayName,
      emailVerified: account.emailVerified,
      phoneVerified: account.phoneVerified,
      mfaVerified: account.role !== 'member',
      issuedAt: now,
      expiresAt: tokens.accessExpiresAt,
    };
    this.sessions.set(accessToken, { ...tokens, session });
    this.refreshIndex.set(refreshToken, accessToken);
    const owned = this.userSessions.get(account.userId) ?? new Set<string>();
    owned.add(accessToken);
    this.userSessions.set(account.userId, owned);
    return tokens;
  }

  private revokeSession(accessToken: string) {
    const entry = this.sessions.get(accessToken);
    if (!entry) return;
    this.sessions.delete(accessToken);
    this.refreshIndex.delete(entry.refreshToken);
    const owned = this.userSessions.get(entry.session.userId);
    owned?.delete(accessToken);
  }

  private revokeUserSessions(userId: string) {
    const owned = this.userSessions.get(userId);
    if (!owned) return;
    for (const token of [...owned]) this.revokeSession(token);
    this.userSessions.delete(userId);
    for (const [id, pending] of this.pending) {
      if (pending.userId === userId) this.pending.delete(id);
    }
  }

  private findAccountByUserId(userId: string): DemoAccount | null {
    for (const account of this.accounts.values()) {
      if (account.userId === userId) return account;
    }
    return null;
  }

  /** Opportunistic cleanup of expired state so long demo runs stay small. */
  private sweep() {
    const now = this.now;
    for (const [id, pending] of this.pending) if (pending.expiresAt <= now) this.pending.delete(id);
    for (const [id, challenge] of this.challenges) if (challenge.expiresAt <= now) this.challenges.delete(id);
    for (const [token, entry] of this.sessions) {
      if (entry.accessExpiresAt <= now && entry.refreshExpiresAt <= now) this.revokeSession(token);
    }
    for (const [key, lock] of this.signInFailures) {
      if (lock.lockedUntil !== 0 && lock.lockedUntil <= now) this.signInFailures.delete(key);
    }
  }
}

/** App singleton. Tests construct their own instance with an injected clock. */
export const demoAuthProvider = new DemoAuthProvider();
