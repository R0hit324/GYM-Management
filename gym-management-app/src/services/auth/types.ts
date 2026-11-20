/**
 * Authentication type contracts (Part 2).
 *
 * These types ARE the backend contract: the demo provider implements them
 * in-memory today, and the live backend provider (Supabase, Part 3+)
 * implements the same interface against real infrastructure. UI screens
 * only ever talk to these types — never to provider internals — so no
 * second authentication flow can appear.
 *
 * Security stance baked into the types:
 * - The role a user picks on a screen is an *expectation*, never evidence.
 *   Every sign-in is validated against the account's immutable role.
 * - Challenge results carry a `demoCode` ONLY on the demo provider (where
 *   nothing is actually delivered). A live provider must never populate it.
 * - Error results are deliberately coarse: they never say which field was
 *   wrong or whether an account exists.
 */
import type { Role } from '@/types/domain';

export type AuthRole = Role;

/** Which contact checks an account still needs. */
export type VerificationKind = 'email' | 'phone';

export interface AuthSession {
  userId: string;
  role: AuthRole;
  email: string;
  phone: string | null;
  displayName: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaVerified: boolean;
  /** Epoch ms when the access token expires. */
  issuedAt: number;
  expiresAt: number;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

/** A one-time verification challenge (OTP, email code, MFA, reset code). */
export interface AuthChallenge {
  challengeId: string;
  kind: 'phone-otp' | 'email-code' | 'mfa' | 'password-reset';
  /** Seconds until the code expires. */
  expiresInSeconds: number;
  /** Seconds before a resend is permitted. */
  resendCooldownSeconds: number;
  /** Attempts left before the challenge is invalidated. */
  remainingAttempts: number;
  targetHint: string;
  /**
   * DEMO ONLY — the code, because no SMS/email actually goes out. The
   * contract forbids a live provider from ever setting this.
   */
  demoCode?: string;
}

export type ChallengeRequest =
  | { kind: 'phone-otp'; phone: string; /** Sign-in verification: link the challenge to the pending auth. */ pendingAuthId?: string }
  | { kind: 'email-code'; email: string; pendingAuthId?: string }
  /** Staff MFA after credentials verified (pending sign-in). */
  | { kind: 'mfa'; pendingAuthId: string }
  | { kind: 'password-reset'; email: string };

export type ChallengeOutcome =
  | { status: 'issued'; challenge: AuthChallenge }
  /** Cooldown between sends still running. */
  | { status: 'cooldown'; retryAfterSeconds: number }
  /** Too many requests — long lockout. */
  | { status: 'rate_limited'; retryAfterSeconds: number }
  /** Target unknown or request malformed. Coarse on purpose. */
  | { status: 'invalid' };

export type VerifyOutcome =
  | { status: 'ok'; challenge: AuthChallenge }
  | { status: 'invalid_code' }
  | { status: 'expired' }
  /** Challenge invalidated after too many wrong attempts. */
  | { status: 'locked' };

export type SignInResult =
  /** Credentials valid, account verified, MFA not required (or done). */
  | { status: 'ok'; pendingAuthId: string }
  /** Credentials valid — staff account must complete MFA. */
  | { status: 'mfa_required'; pendingAuthId: string; challenge: AuthChallenge }
  /**
   * Credentials valid — staff account has no verified TOTP factor yet.
   * The aal1 session is held only long enough to enrol; nothing is
   * authorised until the factor verifies and AAL2 is reached.
   */
  | { status: 'mfa_enrollment_required'; pendingAuthId: string; email: string }
  /** Credentials valid — account needs email/phone verification first. */
  | { status: 'verification_required'; pendingAuthId: string; missing: VerificationKind[] }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  /** Wrong password, unknown account, or role mismatch. One coarse message. */
  | { status: 'invalid' };

/**
 * A TOTP factor being enrolled. The secret/URI are shown once to the staff
 * member inside the authenticated aal1 session; they are never stored by
 * the app and never written to the database by the client.
 */
export interface MfaEnrollment {
  factorId: string;
  friendlyName: string;
  secret: string;
  /** otpauth:// URI for the authenticator QR code. */
  uri: string;
}

export type MfaEnrollmentStart =
  | { status: 'ready'; enrollment: MfaEnrollment }
  /** A verified factor already exists — continue with the normal MFA challenge. */
  | { status: 'already_enrolled' }
  | { status: 'invalid' };

export type MfaEnrollmentResult =
  | { status: 'ok' }
  | { status: 'invalid_code' }
  | { status: 'expired' }
  | { status: 'locked' }
  | { status: 'invalid' };

export type SignUpResult =
  | { status: 'ok'; userId: string; email: string }
  | { status: 'duplicate'; field: 'email' | 'phone' }
  /** Local validation failed before anything was created. */
  | { status: 'invalid'; field: 'password' | 'name' | 'phone' | 'email' | 'plan' };

export type CompleteSignInResult =
  | { status: 'ok'; session: AuthSession; tokens: SessionTokens }
  /** Pending auth missing, expired, or its requirements not all met. */
  | { status: 'invalid' };

export type PasswordResetResult =
  | { status: 'ok' }
  | { status: 'invalid_code' }
  | { status: 'expired' }
  | { status: 'locked' }
  | { status: 'invalid_password' };

export type RefreshResult =
  | { status: 'ok'; session: AuthSession; tokens: SessionTokens }
  | { status: 'revoked' };

/** Contact info + outstanding checks for a pending sign-in. */
export interface PendingContact {
  email: string;
  phone: string | null;
  missing: VerificationKind[];
}

export interface MemberSignUpInput {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  planId: string;
  /** Verification claims produced by verified join challenges. */
  verifiedPhone?: string | null;
  verifiedEmail?: string | null;
}

export interface AuthProvider {
  /** 'demo' providers may surface codes; 'live' providers must never. */
  readonly mode: 'demo' | 'live';

  signIn(email: string, password: string, expectedRole: AuthRole): Promise<SignInResult>;
  signUpMember(input: MemberSignUpInput): Promise<SignUpResult>;

  requestChallenge(request: ChallengeRequest): Promise<ChallengeOutcome>;
  verifyChallenge(challengeId: string, code: string): Promise<VerifyOutcome>;
  /** Staff MFA check against a pending sign-in's challenge. */
  verifyMfa(pendingAuthId: string, challengeId: string, code: string): Promise<VerifyOutcome>;
  /**
   * LIVE ONLY: start first-time TOTP enrolment for a staff pending sign-in.
   * Optional because the demo provider already issues labelled demo codes
   * and never enrols a real factor; a screen must not invent an enrolment
   * when the provider cannot perform one.
   */
  startMfaEnrollment?(pendingAuthId: string): Promise<MfaEnrollmentStart>;
  /** LIVE ONLY: verify the newly enrolled factor and reach AAL2. */
  completeMfaEnrollment?(
    pendingAuthId: string,
    factorId: string,
    code: string,
  ): Promise<MfaEnrollmentResult>;
  /** Challenge metadata for a screen (e.g. after navigating with an id). */
  getChallenge(challengeId: string): Promise<AuthChallenge | null>;
  /** Contact info + remaining checks for a pending sign-in (verification screens). */
  getPendingContact(pendingAuthId: string): Promise<PendingContact | null>;

  /** Finish a pending sign-in once MFA/verification requirements are met. */
  completeSignIn(pendingAuthId: string): Promise<CompleteSignInResult>;

  /** Password reset: verifies the reset code and sets the new password. */
  resetPassword(challengeId: string, code: string, newPassword: string): Promise<PasswordResetResult>;

  /** Refresh-token rotation. A refresh token is single-use. */
  refreshSession(refreshToken: string): Promise<RefreshResult>;
  /** Revoke the session (logout) — both tokens die. */
  signOut(accessToken: string): Promise<void>;
  /** Validate an access token and return its session, or null. */
  getSession(accessToken: string): Promise<AuthSession | null>;
}
