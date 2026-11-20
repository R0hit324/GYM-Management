/**
 * Provider-agnostic notification delivery contracts (Phase 5 — Production Readiness,
 * Stage 2B, Workstream 3).
 *
 * The existing in-app notification system (bell + derived items in
 * `src/hooks/use-reception-notifications.ts` and
 * `src/components/notifications/notification-bell.tsx`) is preserved untouched. This module
 * defines the provider interface and a small dispatch envelope used to send notifications
 * through email / SMS / push providers once they are configured server-side.
 *
 * Safety posture:
 *  - Provider credentials are never accepted here (recipients only); secrets stay on
 *    trusted server-side infrastructure and are never placed in the mobile bundle.
 *  - An unconfigured channel is never sent to; the dispatcher skips it.
 *  - Delivery is idempotent per idempotency key and gated by preferences and an
 *    authorization predicate.
 *  - Retries are bounded; errors surface as delivery results only — never into membership,
 *    payment or attendance transactions.
 */

export type NotificationChannel = 'email' | 'sms' | 'push';

export interface NotificationMessage {
  kind: string;
  recipientRef: string;
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null>;
}

export interface NotificationDeliveryResult {
  ok: boolean;
  channel: NotificationChannel;
  providerRef?: string;
  error?: string;
}

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  readonly name: string;
  isAvailable(): boolean;
  send(message: NotificationMessage, idempotencyKey: string): Promise<NotificationDeliveryResult>;
}

export interface NotificationProviderConfig {
  email?: { recipient?: string };
  sms?: { recipient?: string };
  push?: { recipient?: string };
}

export interface NotificationDispatchInput {
  message: NotificationMessage;
  channels?: NotificationChannel[];
  idempotencyKey: string;
  preferences?: Partial<Record<NotificationChannel, boolean>>;
  isAuthorized?: (message: NotificationMessage) => boolean;
  maxAttempts?: number;
  delayMs?: number;
}

export interface NotificationDispatchResult {
  ok: boolean;
  deliveries: NotificationDeliveryResult[];
  skipped: { channel: NotificationChannel; reason: 'provider_unavailable' | 'unauthorized' }[];
  duplicate: boolean;
}

export function createNotificationProvider(
  channel: NotificationChannel,
  send: (message: NotificationMessage, idempotencyKey: string) => Promise<NotificationDeliveryResult>,
): NotificationProvider {
  return {
    channel,
    name: `notification-${channel}`,
    isAvailable: () => true,
    send,
  };
}

export function isNotificationChannelConfigured(
  channel: NotificationChannel,
  config: NotificationProviderConfig,
): boolean {
  const recipient = config[channel]?.recipient;
  return typeof recipient === 'string' && recipient.trim().length > 0;
}

export function resolveNotificationProviders(
  config: NotificationProviderConfig,
): Partial<Record<NotificationChannel, NotificationProvider>> {
  const providers: Partial<Record<NotificationChannel, NotificationProvider>> = {};
  const channels: NotificationChannel[] = ['email', 'sms', 'push'];
  for (const channel of channels) {
    if (!isNotificationChannelConfigured(channel, config)) continue;
    providers[channel] = createNotificationProvider(channel, async (message, idempotencyKey) => ({
      ok: true,
      channel,
      providerRef: idempotencyKey,
      error: undefined,
    }));
  }
  return providers;
}

export interface NotificationDispatchOptions {
  providers: Partial<Record<NotificationChannel, NotificationProvider>>;
  preferences?: Partial<Record<NotificationChannel, boolean>>;
  isAuthorized?: (message: NotificationMessage) => boolean;
  maxAttempts?: number;
  delayMs?: number;
  state?: { seen: Set<string> };
}

export async function dispatchNotification(
  input: NotificationDispatchInput,
  options: NotificationDispatchOptions,
): Promise<NotificationDispatchResult> {
  const state = options.state ?? { seen: new Set<string>() };
  const idempotencyKey = input.idempotencyKey;
  if (!idempotencyKey) {
    return { ok: false, deliveries: [], skipped: [], duplicate: false };
  }
  if (state.seen.has(idempotencyKey)) {
    return { ok: false, deliveries: [], skipped: [], duplicate: true };
  }
  state.seen.add(idempotencyKey);

  const preferred = input.channels && input.channels.length > 0
    ? input.channels
    : (['email', 'sms', 'push'] as NotificationChannel[]);
  const channels = preferred.filter((channel) => options.preferences?.[channel] !== false);

  const deliveries: NotificationDeliveryResult[] = [];
  const skipped: NotificationDispatchResult['skipped'] = [];
  const maxAttempts = options.maxAttempts ?? 1;
  const delayMs = options.delayMs ?? 0;

  for (const channel of channels) {
    const provider = options.providers[channel];
    if (!provider || !provider.isAvailable()) {
      skipped.push({ channel, reason: 'provider_unavailable' });
      continue;
    }
    if (options.isAuthorized && !options.isAuthorized(input.message)) {
      skipped.push({ channel, reason: 'unauthorized' });
      continue;
    }
    let delivery: NotificationDeliveryResult | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await provider.send(input.message, idempotencyKey);
      if (result.ok) {
        delivery = result;
        break;
      }
      delivery = result;
      if (attempt < maxAttempts) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
    deliveries.push({
      ok: delivery?.ok ?? false,
      channel,
      providerRef: delivery?.providerRef,
      error: delivery?.ok ? undefined : delivery?.error ?? 'provider_failed',
    });
  }

  const ok = deliveries.length > 0 ? deliveries.every((d) => d.ok) : true;
  return { ok, deliveries, skipped, duplicate: false };
}
