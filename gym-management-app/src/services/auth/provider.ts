/**
 * Auth provider selection — the single place the app decides between the
 * demo provider and the live Supabase provider.
 *
 * Default stays `demo`: the Part 1 screens intentionally label demo data and
 * must not silently start talking to a real backend. A deployment opts in
 * with `EXPO_PUBLIC_AUTH_MODE=live` (see `.env.example`). If the flag is set
 * but the Supabase environment is incomplete, the demo provider is kept so
 * the app still boots with an honest "not connected" state.
 *
 * Resolution is cached: `AuthProviderBoundary` holds the provider for the
 * process lifetime, so session state can never be split across two provider
 * instances.
 */
import { demoAuthProvider } from '@/services/auth/demo-provider';
import { liveAuthProvider } from '@/services/auth/live-provider';
import type { AuthProvider } from '@/services/auth/types';
import { isSupabaseConfigured } from '@/services/supabase/client';

let cached: AuthProvider | null = null;

export function resolveAuthProvider(): AuthProvider {
  if (cached) return cached;

  const requested = (process.env.EXPO_PUBLIC_AUTH_MODE ?? 'demo').trim().toLowerCase();
  cached = requested === 'live' && isSupabaseConfigured() ? liveAuthProvider : demoAuthProvider;
  return cached;
}

/** Test-only: forget the cached decision (never used by app code). */
export function resetAuthProviderForTests(): void {
  cached = null;
}
