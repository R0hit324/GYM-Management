/**
 * Structured observability tests (Production Readiness — Stage 2B, WS-7).
 *
 * Covers the centralized structured logger, sanitization/redaction, global
 * error capture, health checks, alert evaluation and security-event emission.
 * No network, no Supabase, no secrets, no production claims.
 */
import { StructuredLogger } from '@/services/observability/logger';
import type { Alert, StructuredLogEvent } from '@/services/observability/types';
import { installGlobalErrorHandlers } from '@/services/observability/error-capture';
import { recordSecurityEvent } from '@/services/observability/security';
import { evaluateAlerts, PROPOSED_ALERTS } from '@/services/observability/alerts';
import { runHealthChecks } from '@/services/observability/health';

function makeLogger(sink?: (event: StructuredLogEvent) => void) {
  return new StructuredLogger({ environment: 'development', sink, minimumSeverity: 'DEBUG', enabled: true, maxBufferSize: 20, dedupeWindowMs: 1000 });
}

describe('StructuredLogger', () => {
  it('emits a structured event with the required fields', () => {
    const events: StructuredLogEvent[] = [];
    const logger = makeLogger((event) => events.push(event));
    logger.error('payment.write_failed', 'services.data', { memberId: '11111111-1111-1111-1111-111111111111' }, {
      name: 'PostgrestError',
      message: 'Failed to fetch',
      code: 'PGRST301',
      category: 'database',
    });

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.event).toBe('payment.write_failed');
    expect(event.severity).toBe('ERROR');
    expect(event.module).toBe('services.data');
    expect(event.environment).toBe('development');
    expect(event.timestamp).toBeTruthy();
    expect(event.error?.category).toBe('database');
    expect(event.error?.message).toBe('Failed to fetch');
    expect(event.error?.code).toBe('PGRST301');
    expect(event.metadata?.memberId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('redacts sensitive metadata before it reaches the sink', () => {
    const events: StructuredLogEvent[] = [];
    const logger = makeLogger((event) => events.push(event));
    logger.warn('auth.login_failure', 'security', { email: 'member@example.com', password: 'super-secret', refreshToken: 'abc', accessToken: 'def' });
    expect(events).toHaveLength(1);
    expect(events[0].metadata?.email).toBe('member@example.com');
    expect(events[0].metadata?.password).toBe('[REDACTED]');
    expect(events[0].metadata?.refreshToken).toBe('[REDACTED]');
    expect(events[0].metadata?.accessToken).toBe('[REDACTED]');
  });

  it('redacts signed storage URLs from error messages', () => {
    const { redactSensitiveText } = jest.requireActual('@/services/observability/sanitize') as typeof import('@/services/observability/sanitize');
    const signed = 'https://xyz.supabase.co/storage/v1/object/receipts/member/payment.pdf?token=secret';
    expect(redactSensitiveText(signed)).not.toContain('token=secret');
  });

  it('respects minimum severity in production', () => {
    const events: StructuredLogEvent[] = [];
    const logger = new StructuredLogger({ environment: 'production', sink: (e) => events.push(e), minimumSeverity: 'WARN', enabled: true });
    logger.debug('app.debug_event', 'app');
    logger.info('app.info_event', 'app');
    logger.warn('app.warn_event', 'app');
    logger.error('app.error_event', 'app');
    expect(events.map((e) => e.severity)).toEqual(['WARN', 'ERROR']);
  });

  it('honours the enabled flag and bounded buffer', () => {
    const events: StructuredLogEvent[] = [];
    const logger = new StructuredLogger({ environment: 'development', sink: (e) => events.push(e), enabled: true, maxBufferSize: 2 });
    logger.error('app.error_1', 'app');
    logger.error('app.error_2', 'app');
    logger.error('app.error_3', 'app');
    expect(logger.getBufferSize()).toBe(2);
    expect(logger.getRecentEvents(2).map((e) => e.event)).toEqual(['app.error_2', 'app.error_3']);
  });

  it('dedupes identical error events within the dedupe window', () => {
    const events: StructuredLogEvent[] = [];
    const logger = new StructuredLogger({ environment: 'development', sink: (e) => events.push(e), enabled: true, dedupeWindowMs: 1000 });
    const error = { name: 'Error', message: 'boom', code: null, category: 'unknown' as const };
    logger.error('app.error', 'app', undefined, error);
    logger.error('app.error', 'app', undefined, error);
    expect(events).toHaveLength(1);
    logger.error('app.error', 'app', undefined, { ...error, message: 'boom2' });
    expect(events).toHaveLength(2);
  });

  it('never throws when the sink throws', () => {
    const logger = new StructuredLogger({ environment: 'development', sink: () => { throw new Error('sink down'); }, enabled: true });
    expect(() => logger.error('app.error', 'app')).not.toThrow();
  });
});

describe('error capture', () => {
  it('routes fatal errors and unhandled rejections through the logger', () => {
    const events: StructuredLogEvent[] = [];
    const logger = makeLogger((e) => events.push(e));
    const handlers = installGlobalErrorHandlers({ logger });
    handlers.errorHandler(new Error('kapow'), 'test.origin');
    handlers.unhandledRejectionHandler(new Error('rejected'), Promise.resolve(undefined));
    expect(events.map((e) => e.event)).toEqual(['app.error', 'app.unhandled_rejection']);
    handlers.dispose();
  });
});

describe('health checks', () => {
  it('reports healthy when all checks pass', async () => {
    const snapshot = await runHealthChecks({
      appCheck: async () => ({ id: 'app', name: 'application', status: 'healthy', checkedAt: new Date().toISOString() }),
      authCheck: async () => ({ id: 'auth', name: 'auth', status: 'healthy', checkedAt: new Date().toISOString() }),
      databaseCheck: async () => ({ id: 'database', name: 'database', status: 'healthy', checkedAt: new Date().toISOString() }),
      storageCheck: async () => ({ id: 'storage', name: 'storage', status: 'healthy', checkedAt: new Date().toISOString() }),
      environment: 'development',
    });
    expect(snapshot.status).toBe('healthy');
    expect(snapshot.checks).toHaveLength(4);
  });

  it('reports unhealthy when a check fails', async () => {
    const snapshot = await runHealthChecks({
      authCheck: async () => ({ id: 'auth', name: 'auth', status: 'unhealthy', detail: 'down', checkedAt: new Date().toISOString() }),
      environment: 'development',
    });
    expect(snapshot.status).toBe('unhealthy');
  });

  it('reports unknown when configuration is absent', async () => {
    const snapshot = await runHealthChecks({
      authCheck: async () => ({ id: 'auth', name: 'auth', status: 'unknown', detail: 'not_configured', checkedAt: new Date().toISOString() }),
      environment: 'development',
    });
    expect(snapshot.status).toBe('unknown');
  });
});

describe('alerts', () => {
  it('proposes alerts with explicit proposed state', () => {
    expect(PROPOSED_ALERTS.length).toBeGreaterThanOrEqual(6);
    expect(PROPOSED_ALERTS.every((a: Alert) => a.state === 'proposed')).toBe(true);
  });

  it('fires an alert for a crash spike', () => {
    const alerts = evaluateAlerts({
      events: [
        { event: 'app.error', severity: 'ERROR', module: 'app', environment: 'production', timestamp: new Date().toISOString() },
        { event: 'app.error', severity: 'ERROR', module: 'app', environment: 'production', timestamp: new Date().toISOString() },
        { event: 'app.error', severity: 'ERROR', module: 'app', environment: 'production', timestamp: new Date().toISOString() },
      ],
      failureThreshold: 3,
    });
    expect(alerts.some((a) => a.id === 'alert.app.crash_spike')).toBe(true);
  });

  it('fires a backend alert when health is unhealthy', () => {
    const alerts = evaluateAlerts({ health: { status: 'unhealthy', checks: [], checkedAt: new Date().toISOString(), environment: 'production' } });
    expect(alerts.some((a) => a.id === 'alert.backend.supabase_unreachable')).toBe(true);
  });
});

describe('security events', () => {
  it('emits a normalized security event through the logger', () => {
    const warn = jest.fn();
    recordSecurityEvent({ type: 'auth.login_failure', module: 'security', metadata: { email: 'member@example.com' } }, { warn });
    expect(warn).toHaveBeenCalledWith('security.auth.login_failure', 'security', { email: 'member@example.com' }, undefined);
  });
});
