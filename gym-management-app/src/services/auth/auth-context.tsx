/**
 * React auth context — the single source of session state for the whole
 * app. Screens never touch the provider or storage directly; they use
 * `useAuth()` and `useWorkspaceGuard()`.
 *
 * RBAC stance: the workspace guard compares the *session's* role (set by
 * the auth provider, never by UI state) against the workspace being
 * entered. The login screen's role selection is an expectation only and
 * can never elevate a session. The demo `previewRole` is an explicit,
 * badge-labelled preview path that exists only while provider.mode is
 * 'demo' and is cleared on sign-out or app relaunch.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { router } from 'expo-router';

import type { AuthProvider, AuthSession, CompleteSignInResult, SessionTokens } from '@/services/auth/types';
import type { Role } from '@/types/domain';
import { resolveAuthProvider } from '@/services/auth/provider';
import { clearPersistedSession, persistSession, restoreSession } from '@/services/auth/session-manager';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  tokens: SessionTokens | null;
  previewRole: Role | null;
  provider: AuthProvider;
  /** Finish a pending sign-in; persists the session when it succeeds. */
  completeSignIn: (pendingAuthId: string) => Promise<CompleteSignInResult>;
  /** Track fresh tokens issued outside completeSignIn (not used today). */
  adoptTokens: (session: AuthSession, tokens: SessionTokens) => Promise<void>;
  signOut: () => Promise<void>;
  enterPreview: (role: Role) => void;
  exitPreview: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const workspaceFor: Record<Role, string> = {
  owner: '/(owner)/dashboard',
  receptionist: '/(reception)/home',
  member: '/(member)/attendance',
};

/** Route a signed-in user to their workspace (splash hand-off). */
export function workspaceRoute(role: Role): string {
  return workspaceFor[role];
}

export function AuthProviderBoundary({ children }: { children: ReactNode }) {
  // Resolved once per process: switching providers would orphan session state.
  const provider = useMemo(() => resolveAuthProvider(), []);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [tokens, setTokens] = useState<SessionTokens | null>(null);
  const [previewRole, setPreviewRole] = useState<Role | null>(null);
  // Mirror tokens in a ref so signOut never depends on a stale closure.
  // Assigned in an effect, never during render.
  const tokensRef = useRef<SessionTokens | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    (async () => {
      const outcome = await restoreSession(provider);
      if (cancelled || !mounted.current) return;
      if (outcome.session) {
        setSession(outcome.session);
        if (outcome.tokens) setTokens(outcome.tokens);
        setStatus('authenticated');
      } else {
        setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [provider]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      tokens,
      previewRole,
      provider,
      completeSignIn: async (pendingAuthId) => {
        const result = await provider.completeSignIn(pendingAuthId);
        if (result.status === 'ok') {
          await persistSession(result.tokens);
          setSession(result.session);
          setTokens(result.tokens);
          setPreviewRole(null);
          setStatus('authenticated');
        }
        return result;
      },
      adoptTokens: async (nextSession, nextTokens) => {
        await persistSession(nextTokens);
        setSession(nextSession);
        setTokens(nextTokens);
        setPreviewRole(null);
        setStatus('authenticated');
      },
      signOut: async () => {
        const current = tokensRef.current;
        if (current) {
          try {
            await provider.signOut(current.accessToken);
          } catch {
            // Logout never blocks on network failure — the local session
            // is always cleared.
          }
        }
        await clearPersistedSession();
        setSession(null);
        setTokens(null);
        setPreviewRole(null);
        setStatus('unauthenticated');
        router.replace('/login' as never);
      },
      enterPreview: (role) => setPreviewRole(role),
      exitPreview: () => setPreviewRole(null),
    }),
    [status, session, tokens, previewRole, provider],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProviderBoundary');
  return value;
}

/**
 * RBAC guard for a workspace group: renders while the session loads, and
 * replaces to login when there is no session of the expected role. The
 * demo preview role satisfies the guard only for its own workspace.
 */
export function useWorkspaceGuard(expected: Role): void {
  const { status, session, previewRole } = useAuth();
  useEffect(() => {
    if (status === 'loading') return;
    const effectiveRole: Role | null = previewRole ?? session?.role ?? null;
    if (effectiveRole !== expected) {
      router.replace('/login' as never);
    }
  }, [status, session, previewRole, expected]);
}
