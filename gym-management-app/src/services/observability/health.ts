/**
 * Non-destructive service health checks (Production Readiness — Stage 2B, WS-7).
 *
 * Checks: application client, auth (Supabase auth health endpoint), database
 * (read-only probe on an existing small table), storage (private bucket list).
 * All checks are non-destructive and timeout-bounded. `unknown` is a valid and
 * distinct outcome — a check is never reported healthy without evidence.
 */
import { checkSupabaseConnectivity, getSupabaseClient } from '@/services/supabase/client';
import type { HealthCheckContext, HealthCheckResult, HealthSnapshot } from './types';

const CHECK_TIMEOUT_MS = 5000;

async function withTimeout<T>(promise: Promise<T>, fallback: T, ms = CHECK_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raced = Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
    return await raced;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function result(id: string, name: string, status: HealthCheckResult['status'], detail?: string): HealthCheckResult {
  return { id, name, status, detail, checkedAt: new Date().toISOString() };
}

async function appCheck(): Promise<HealthCheckResult> {
  return result('app', 'application', 'healthy', 'client runtime healthy');
}

async function authCheck(): Promise<HealthCheckResult> {
  const started = Date.now();
  const connectivity = await withTimeout(
    Promise.resolve(checkSupabaseConnectivity()),
    { status: 'unreachable', projectUrl: 'unknown', detail: 'Health probe timed out.' },
    CHECK_TIMEOUT_MS,
  );
  const latencyMs = Date.now() - started;
  if (connectivity.status === 'reachable') {
    return { ...result('auth', 'auth', 'healthy', 'auth health endpoint reachable'), latencyMs };
  }
  if (connectivity.status === 'not_configured') {
    return { ...result('auth', 'auth', 'unknown', 'supabase environment not configured'), latencyMs };
  }
  return { ...result('auth', 'auth', 'unhealthy', connectivity.detail ?? 'auth health probe failed'), latencyMs };
}

async function databaseCheck(): Promise<HealthCheckResult> {
  const started = Date.now();
  const client = await getSupabaseClient();
  if (!client) {
    const latencyMs = Date.now() - started;
    return { ...result('database', 'database', 'unknown', 'supabase client not configured'), latencyMs };
  }
  const probe = await withTimeout(
    (async () => {
      const { error } = await client.from('plans').select('id').limit(1).maybeSingle();
      if (error) return { ok: false as const, detail: error.message };
      return { ok: true as const, detail: 'read probe ok' };
    })(),
    { ok: false, detail: 'database probe timed out.' },
  );
  const latencyMs = Date.now() - started;
  if (probe.ok) {
    return { ...result('database', 'database', 'healthy', probe.detail), latencyMs };
  }
  return { ...result('database', 'database', 'unhealthy', probe.detail), latencyMs };
}

async function storageCheck(): Promise<HealthCheckResult> {
  const started = Date.now();
  const client = await getSupabaseClient();
  if (!client) {
    const latencyMs = Date.now() - started;
    return { ...result('storage', 'storage', 'unknown', 'supabase client not configured'), latencyMs };
  }
  const probe = await withTimeout(
    (async () => {
      const { data, error } = await client.storage.from('receipts').list();
      if (error) return { ok: false as const, detail: error.message };
      if (!Array.isArray(data)) return { ok: false as const, detail: 'storage bucket list returned no data' };
      return { ok: true as const, detail: `bucket list ok (${data.length} entries)` };
    })(),
    { ok: false, detail: 'storage probe timed out.' },
  );
  const latencyMs = Date.now() - started;
  if (probe.ok) {
    return { ...result('storage', 'storage', 'healthy', probe.detail), latencyMs };
  }
  return { ...result('storage', 'storage', 'unhealthy', probe.detail), latencyMs };
}

export async function runHealthChecks(context: HealthCheckContext = {}): Promise<HealthSnapshot> {
  const app = context.appCheck ? await context.appCheck() : await appCheck();
  const auth = context.authCheck ? await context.authCheck() : await authCheck();
  const database = context.databaseCheck ? await context.databaseCheck() : await databaseCheck();
  const storage = context.storageCheck ? await context.storageCheck() : await storageCheck();
  const checks = [app, auth, database, storage];

  const unhealthy = checks.filter((c) => c.status === 'unhealthy');
  const unknown = checks.filter((c) => c.status === 'unknown');
  const status = unhealthy.length > 0 ? 'unhealthy' : unknown.length > 0 ? 'unknown' : 'healthy';

  return {
    status,
    checks,
    checkedAt: new Date().toISOString(),
    environment: context.environment ?? 'development',
  };
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  return runHealthChecks();
}

export async function checkAuthHealth(): Promise<HealthCheckResult> {
  return authCheck();
}

export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  return databaseCheck();
}

export async function checkReceiptStorageHealth(): Promise<HealthCheckResult> {
  return storageCheck();
}
