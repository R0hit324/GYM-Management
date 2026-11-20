/**
 * Auth service barrel. The app imports authentication ONLY from here.
 */
export type {
  AuthChallenge,
  AuthProvider,
  AuthRole,
  AuthSession,
  ChallengeOutcome,
  ChallengeRequest,
  CompleteSignInResult,
  MemberSignUpInput,
  MfaEnrollment,
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
export { checkPassword, DemoAuthProvider, demoAuthProvider, demoCredentials } from '@/services/auth/demo-provider';
export { LiveAuthProvider, liveAuthProvider } from '@/services/auth/live-provider';
export { resolveAuthProvider } from '@/services/auth/provider';
export { restoreSession, persistSession, clearPersistedSession } from '@/services/auth/session-manager';
export { tokenStore, type TokenStore } from '@/services/auth/token-storage';
export {
  AuthProviderBoundary,
  useAuth,
  useWorkspaceGuard,
  workspaceRoute,
} from '@/services/auth/auth-context';
