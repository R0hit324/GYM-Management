/**
 * Session manager — restore, refresh and revoke the persisted session on
 * top of any `AuthProvider` (demo today, live backend later).
 *
 * `restore` returns a valid session or null: it validates the access
 * token with the provider, transparently refreshes when the access token
 * has expired but the refresh token is still valid (rotation: the
 * refresh token is single-use), and clears the store when nothing is
 * usable — so a stale or revoked session can never resurrect itself.
 */
import type { AuthProvider, AuthSession, SessionTokens } from '@/services/auth/types';
import { tokenStore } from '@/services/auth/token-storage';

export interface RestoreOutcome {
  session: AuthSession | null;
  /** New tokens when a refresh rotation happened (persist if non-null). */
  tokens: SessionTokens | null;
}

export async function restoreSession(provider: AuthProvider): Promise<RestoreOutcome> {
  const stored = await tokenStore.load();
  if (!stored) return { session: null, tokens: null };

  const current = await provider.getSession(stored.accessToken);
  if (current) return { session: current, tokens: null };

  // Access expired (or was revoked) — the refresh token is the only way
  // back, and it is single-use.
  const refreshed = await provider.refreshSession(stored.refreshToken);
  if (refreshed.status === 'ok') {
    await tokenStore.save(refreshed.tokens);
    return { session: refreshed.session, tokens: refreshed.tokens };
  }
  await tokenStore.clear();
  return { session: null, tokens: null };
}

export async function persistSession(tokens: SessionTokens): Promise<void> {
  await tokenStore.save(tokens);
}

export async function clearPersistedSession(): Promise<void> {
  await tokenStore.clear();
}
