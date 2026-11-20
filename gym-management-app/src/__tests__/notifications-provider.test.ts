/**
 * Tests for the provider-agnostic notification delivery layer (Phase 5 — Production
 * Readiness, Stage 2B, Workstream 3).
 *
 * Covers: provider configuration validation, missing credentials, successful delivery via
 * mocked providers, provider failure + retry behaviour, idempotency and duplicate prevention,
 * notification preference enforcement, unauthorized delivery attempts, and secret exposure
 * prevention.
 */

import {
  createNotificationProvider,
  dispatchNotification,
  resolveNotificationProviders,
  type NotificationChannel,
  type NotificationDeliveryResult,
  type NotificationDispatchOptions,
  type NotificationMessage,
  type NotificationProvider,
} from '@/services/notifications/provider';

function makeMessage(overrides: Partial<NotificationMessage> = {}): NotificationMessage {
  return {
    kind: 'membership.renewal_reminder',
    recipientRef: 'member-1',
    title: 'Membership ending soon',
    body: 'Your membership ends in 7 days.',
    ...overrides,
  };
}

function makeProvider(
  channel: NotificationChannel,
  sendImpl?: (message: NotificationMessage, idempotencyKey: string) => Promise<NotificationDeliveryResult>,
): NotificationProvider {
  return createNotificationProvider(channel, sendImpl ?? (async () => ({ ok: true, channel })));
}

interface MakeOptionsResult extends NotificationDispatchOptions {
  state: { seen: Set<string> };
}

function makeOptions(
  providers: Partial<Record<NotificationChannel, NotificationProvider>>,
  overrides: Partial<NotificationDispatchOptions> = {},
): MakeOptionsResult {
  return {
    providers,
    maxAttempts: 1,
    delayMs: 0,
    state: { seen: new Set<string>() },
    ...overrides,
  };
}

describe('notification provider configuration', () => {
  it('resolves providers only for channels that have a configured recipient', () => {
    const providers = resolveNotificationProviders({
      email: { recipient: 'owner@example.com' },
      sms: { recipient: '' },
      push: { recipient: undefined },
    });
    expect(Object.keys(providers)).toEqual(['email']);
  });

  it('resolves no providers when no channel has a configured recipient', () => {
    const providers = resolveNotificationProviders({});
    expect(providers).toEqual({});
  });
});

describe('notification dispatch — missing credentials', () => {
  it('skips delivery and reports provider_unavailable when no provider is configured', async () => {
    const result = await dispatchNotification(
      { message: makeMessage(), channels: ['email', 'sms'], idempotencyKey: 'idem-1' },
      makeOptions({}),
    );
    expect(result.deliveries).toEqual([]);
    expect(result.skipped.map((s) => s.channel)).toEqual(['email', 'sms']);
    expect(result.skipped.every((s) => s.reason === 'provider_unavailable')).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(false);
  });
});

describe('notification dispatch — successful delivery via mocked provider', () => {
  it('delivers through the injected mock provider and returns its result', async () => {
    const send = jest.fn(async (_message: NotificationMessage, idempotencyKey: string) => ({
      ok: true,
      channel: 'email' as NotificationChannel,
      providerRef: idempotencyKey,
    }));
    const email = makeProvider('email', send);
    const result = await dispatchNotification(
      { message: makeMessage(), channels: ['email'], idempotencyKey: 'idem-ok-1' },
      makeOptions({ email }),
    );
    expect(result.ok).toBe(true);
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]?.ok).toBe(true);
    expect(result.deliveries[0]?.providerRef).toBe('idem-ok-1');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('notification dispatch — provider failure and retry', () => {
  it('retries a failing provider then succeeds', async () => {
    let calls = 0;
    const send = jest.fn(
      async (_message: NotificationMessage, idempotencyKey: string): Promise<NotificationDeliveryResult> => {
        calls += 1;
        if (calls < 2) {
          return { ok: false, channel: 'email', error: 'provider_error' };
        }
        return { ok: true, channel: 'email', providerRef: idempotencyKey };
      },
    );
    const email = makeProvider('email', send);
    const result = await dispatchNotification(
      { message: makeMessage(), channels: ['email'], idempotencyKey: 'idem-retry-1' },
      makeOptions({ email }, { maxAttempts: 2, delayMs: 0 }),
    );
    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('gives up after the bounded retries and reports the failure', async () => {
    const email = makeProvider('email', async () => ({ ok: false, channel: 'email', error: 'provider_error' }));
    const result = await dispatchNotification(
      { message: makeMessage(), channels: ['email'], idempotencyKey: 'idem-retry-2' },
      makeOptions({ email }, { maxAttempts: 2, delayMs: 0 }),
    );
    expect(result.ok).toBe(false);
    expect(result.deliveries[0]?.ok).toBe(false);
    expect(result.deliveries[0]?.error).toBe('provider_error');
  });
});

describe('notification dispatch — idempotency and duplicate prevention', () => {
  it('does not deliver twice for the same idempotency key', async () => {
    const send = jest.fn(async (_message: NotificationMessage, idempotencyKey: string) => ({
      ok: true,
      channel: 'email' as NotificationChannel,
      providerRef: idempotencyKey,
    }));
    const email = makeProvider('email', send);
    const options = makeOptions({ email });
    const first = await dispatchNotification(
      { message: makeMessage(), channels: ['email'], idempotencyKey: 'idem-dup-1' },
      options,
    );
    const second = await dispatchNotification(
      { message: makeMessage(), channels: ['email'], idempotencyKey: 'idem-dup-1' },
      options,
    );
    expect(first.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('notification dispatch — preference enforcement', () => {
  it('skips channels the recipient has not permitted', async () => {
    const sms = makeProvider('sms', async () => ({ ok: true, channel: 'sms' }));
    const push = makeProvider('push', async () => ({ ok: true, channel: 'push' }));
    const result = await dispatchNotification(
      { message: makeMessage(), channels: ['email', 'sms', 'push'], idempotencyKey: 'idem-pref-1' },
      makeOptions({ sms, push }, { preferences: { email: false, sms: true, push: false } }),
    );
    expect(result.deliveries.map((d) => d.channel)).toEqual(['sms']);
    expect(result.skipped).toEqual([]);
  });
});

describe('notification dispatch — authorization', () => {
  it('skips delivery when the authorization predicate denies the recipient', async () => {
    const email = makeProvider('email', async () => ({ ok: true, channel: 'email' }));
    const result = await dispatchNotification(
      { message: makeMessage(), channels: ['email'], idempotencyKey: 'idem-auth-1' },
      makeOptions({ email }, { isAuthorized: () => false }),
    );
    expect(result.deliveries).toEqual([]);
    expect(result.skipped).toEqual([{ channel: 'email', reason: 'unauthorized' }]);
  });
});

describe('notification dispatch — secret exposure prevention', () => {
  it('passes only the declared notification fields to the provider', async () => {
    const seen: NotificationMessage[] = [];
    const email = makeProvider('email', async (message, idempotencyKey) => {
      seen.push({ ...message });
      return { ok: true, channel: 'email', providerRef: idempotencyKey };
    });
    const result = await dispatchNotification(
      { message: makeMessage(), channels: ['email'], idempotencyKey: 'idem-sec-1' },
      makeOptions({ email }),
    );
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(Object.keys(seen[0] ?? {})).toEqual(['kind', 'recipientRef', 'title', 'body']);
  });
});
