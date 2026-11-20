/**
 * Supabase client preparation (Phase 2 — connectivity only).
 *
 * The app is NOT yet connected to Supabase: authentication still runs on
 * `DemoAuthProvider` and no screen reads from here. This module only
 * provides:
 *  - `readSupabaseEnv` / `isSupabaseConfigured` — clear, typed access to
 *    the two Expo public environment variables
 *  - `getSupabaseClient` — a lazily-created singleton configured with
 *    SecureStore-backed session persistence (used by the live auth
 *    provider in a later phase — never a second auth system)
 *  - `checkSupabaseConnectivity` — a harmless health probe
 *
 * Security stance:
 *  - Only PUBLIC credentials are read here: `EXPO_PUBLIC_SUPABASE_URL`
 *    and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or a legacy
 *    `EXPO_PUBLIC_SUPABASE_ANON_KEY`). The service-role/secret key must
 *    NEVER be referenced by the Expo application, so it has no typed
 *    slot and no reader on purpose.
 *  - `EXPO_PUBLIC_*` values are inlined into the client bundle by Metro.
 *    That is safe for the publishable/anon key because Supabase designs
 *    it to be public — row access is controlled by RLS on the server.
 *  - Nothing is created on the remote database by this module.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/services/observability';

/** The app's Supabase client type (untyped database — schema lands with migrations). */
export type AppSupabaseClient = SupabaseClient;

/** The two public variables the app is allowed to read. */
export interface SupabaseEnv {
  /** e.g. https://abcdefgh.supabase.co — trailing slash trimmed. */
  url: string;
  /** Publishable (or legacy anon) key — public by design. */
  publishableKey: string;
}

export type SupabaseConfigStatus =
  | { status: 'ok'; env: SupabaseEnv }
  | { status: 'missing' }
  | { status: 'invalid'; reason: string };

/** Read and validate the Supabase environment configuration. */
export function readSupabaseEnv(): SupabaseConfigStatus {
  const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  // New projects use the publishable key; older ones still provision an
  // anon key. Either is public and acceptable — never the secret key.
  const rawKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!rawUrl && !rawKey) return { status: 'missing' };
  if (!rawUrl) return { status: 'invalid', reason: 'EXPO_PUBLIC_SUPABASE_URL is not set.' };
  if (!rawKey) {
    return { status: 'invalid', reason: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy anon key) is not set.' };
  }
  if (!/^https?:\/\//i.test(rawUrl) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(rawUrl.replace(/^https?:\/\//i, ''))) {
    return { status: 'invalid', reason: 'EXPO_PUBLIC_SUPABASE_URL does not look like a project URL (https://…). ' };
  }
  return { status: 'ok', env: { url: rawUrl.replace(/\/+$/, ''), publishableKey: rawKey } };
}

/** True when a valid configuration is present (used by future wiring). */
export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv().status === 'ok';
}

// ---------------------------------------------------------------------------
// SecureStore-compatible session storage for supabase-js.
//
// supabase-js persists auth sessions through a small async storage
// adapter. Expo ships `expo-secure-store` (already a project dependency,
// used by the demo session layer) which is hardware-backed on iOS/Android
// — so live sessions would land in secure storage, never plain-text
// AsyncStorage. The import is dynamic so this module stays loadable in
// plain node environments (tests) with a memory fallback.
// ---------------------------------------------------------------------------

interface StorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let storageAdapter: StorageLike | null = null;

async function resolveStorageAdapter(): Promise<StorageLike> {
  if (storageAdapter) return storageAdapter;
  try {
    const SecureStore = await import('expo-secure-store');
    storageAdapter = {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    };
  } catch {
    // Plain node (tests) or unsupported platform — memory-only fallback,
    // which simply means no session survives a restart there.
    const memory = new Map<string, string>();
    storageAdapter = {
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => {
        memory.set(key, value);
      },
      removeItem: async (key) => {
        memory.delete(key);
      },
    };
  }
  return storageAdapter;
}

let cachedClient: AppSupabaseClient | null = null;
let missingWarned = false;

/**
 * The shared Supabase client, or null when the environment is not
 * configured (the app keeps working on the demo provider). The storage
 * adapter is attached asynchronously on first creation.
 */
export async function getSupabaseClient(): Promise<AppSupabaseClient | null> {
  const env = readSupabaseEnv();
  if (env.status !== 'ok') {
    if (!missingWarned) {
      missingWarned = true;
      logger.warn('supabase.client.env_missing', 'services.supabase', { reason: 'supabase_environment_not_configured' });
    }
    return null;
  }
  if (!cachedClient) {
    const storage = await resolveStorageAdapter();
    cachedClient = createClient(env.env.url, env.env.publishableKey, {
      auth: {
        // Sessions persist through SecureStore (see adapter above) —
        // never plain-text AsyncStorage.
        storage,
        storageKey: 'pulse-supabase-auth',
        // Auto-refresh keeps sessions alive like the demo session manager.
        autoRefreshToken: true,
        persistSession: true,
        // Mobile app: URL-detection is a web concern; deep links are handled
        // explicitly by the live auth provider in a later phase.
        detectSessionInUrl: false,
      },
      // Realtime/websocket channels are not used yet.
      realtime: { params: { eventsPerSecond: 0 } },
    });
  }
  return cachedClient;
}

export type ConnectivityResult =
  | { status: 'reachable'; projectUrl: string }
  | { status: 'unreachable'; projectUrl: string; detail: string }
  | { status: 'not_configured' };

/**
 * Harmless connectivity probe: Supabase exposes a health endpoint for the
 * auth service that requires no table access, no user creation and no
 * write of any kind. A 200 (or a JSON error we can identify) proves the
 * project URL and key were accepted; network/authorization failures are
 * reported with coarse detail.
 */
export async function checkSupabaseConnectivity(): Promise<ConnectivityResult> {
  const env = readSupabaseEnv();
  if (env.status !== 'ok') return { status: 'not_configured' };
  const projectUrl = env.env.url;
  try {
    const response = await fetch(`${projectUrl}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: env.env.publishableKey },
    });
    if (response.ok) return { status: 'reachable', projectUrl };
    return { status: 'unreachable', projectUrl, detail: `HTTP ${response.status}` };
  } catch (error) {
    return {
      status: 'unreachable',
      projectUrl,
      detail: error instanceof Error ? error.message : 'network error',
    };
  }
}
