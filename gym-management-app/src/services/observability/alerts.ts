/**
 * Alert design + evaluation (Production Readiness — Stage 2B, WS-7).
 *
 * - `PROPOSED_ALERTS` documents the production alerting strategy with proposed
 *   thresholds (they are NOT configured anywhere).
 * - `evaluateAlerts` evaluates firing conditions from real events / health
 *   snapshots using those proposed thresholds.
 * No external alerting provider is configured in WS-7 (owner action).
 */
import type { Alert, AlertSeverity, HealthSnapshot, StructuredLogEvent } from './types';

export interface AlertEvaluationInput {
  events?: StructuredLogEvent[];
  health?: HealthSnapshot | null;
  windowMinutes?: number;
  failureThreshold?: number;
  authFailureThreshold?: number;
  mfaFailureThreshold?: number;
}

export const PROPOSED_ALERTS: Alert[] = [
  {
    id: 'alert.app.crash_spike',
    name: 'Application crash spike',
    severity: 'HIGH',
    state: 'proposed',
    trigger: `>= ${3} error/fatal app events within ${5} minutes`,
    source: 'observability.app',
    owner: 'gym_owner',
    response: 'Capture the crash context, reproduce on device, and roll back or patch before further use.',
    escalation: 'Developer -> technical advisor -> owner',
    threshold: '>= 3 error/fatal events / 5 min (module=app)',
  },
  {
    id: 'alert.auth.failure_spike',
    name: 'Authentication failure spike',
    severity: 'HIGH',
    state: 'proposed',
    trigger: `>= ${5} auth failure events within ${15} minutes`,
    source: 'observability.security',
    owner: 'gym_owner',
    response: 'Review sign-in attempts, verify MFA enrolment, and revoke sessions if suspicious.',
    escalation: 'Owner -> technical advisor -> security contact',
    threshold: '>= 5 auth failures / 15 min (severity WARN/ERROR)',
  },
  {
    id: 'alert.mfa.failure_spike',
    name: 'MFA failure spike',
    severity: 'CRITICAL',
    state: 'proposed',
    trigger: `>= ${3} MFA failure events within ${10} minutes`,
    source: 'observability.security',
    owner: 'gym_owner',
    response: 'Treat as possible credential/MFA compromise; force re-enrolment and owner review.',
    escalation: 'Owner -> technical advisor -> security contact',
    threshold: '>= 3 MFA failures / 10 min (severity WARN/ERROR)',
  },
  {
    id: 'alert.backend.supabase_unreachable',
    name: 'Supabase backend unreachable',
    severity: 'CRITICAL',
    state: 'proposed',
    trigger: 'auth or database health check reports unhealthy',
    source: 'observability.health',
    owner: 'gym_owner',
    response: 'Switch to manual fallback (paper receipts/check-ins) and restore from isolated backup.',
    escalation: 'Owner -> technical advisor -> Supabase support',
    threshold: 'health.status = unhealthy',
  },
  {
    id: 'alert.payment.workflow_failure',
    name: 'Payment workflow failure',
    severity: 'HIGH',
    state: 'proposed',
    trigger: `>= ${3} error/fatal service.data events within ${30} minutes`,
    source: 'observability.operations',
    owner: 'receptionist_owner',
    response: 'Stop payment writes, reconcile against backup, and escalate to owner before re-enabling.',
    escalation: 'Receptionist -> gym owner -> technical advisor',
    threshold: '>= 3 errors / 30 min (module=services.data)',
  },
  {
    id: 'alert.receipt.pipeline_failure',
    name: 'Receipt pipeline failure',
    severity: 'HIGH',
    state: 'proposed',
    trigger: `>= ${2} error/fatal services.receipts events within ${30} minutes`,
    source: 'observability.operations',
    owner: 'receptionist_owner',
    response: 'Stop receipt issuance, preserve payment state, and retry from a safe restore point.',
    escalation: 'Receptionist -> gym owner -> technical advisor',
    threshold: '>= 2 errors / 30 min (module=services.receipts)',
  },
  {
    id: 'alert.notification.delivery_failure',
    name: 'Notification delivery failure',
    severity: 'MEDIUM',
    state: 'proposed',
    trigger: '>= 2 notification delivery errors within 60 minutes',
    source: 'observability.operations',
    owner: 'gym_owner',
    response: 'Check provider configuration and retry with bounded backoff; keep in-app bell as fallback.',
    escalation: 'Owner -> technical advisor',
    threshold: '>= 2 errors / 60 min (module=services.notifications)',
  },
];

/** Evaluate firing alerts from a window of events plus current health. */
export function evaluateAlerts(input: AlertEvaluationInput = {}): Alert[] {
  const now = Date.now();
  const windowMs = (input.windowMinutes ?? 15) * 60_000;
  const events = (input.events ?? []).filter((e) => Number.isFinite(Date.parse(e.timestamp)) && now - Date.parse(e.timestamp) <= windowMs);
  const failures = events.filter((e) => e.severity === 'ERROR' || e.severity === 'FATAL');
  const firing: Alert[] = [];

  const crashCount = failures.filter((e) => e.module === 'app').length;
  if (crashCount >= (input.failureThreshold ?? 3)) {
    firing.push({
      ...PROPOSED_ALERTS[0],
      state: 'firing',
      trigger: `Observed ${crashCount} error/fatal app events in the last ${input.windowMinutes ?? 15} minutes.`,
    });
  }

  const authFailures = failures.filter((e) => e.event.startsWith('auth.') && (e.severity === 'ERROR' || e.severity === 'WARN'));
  if (authFailures.length >= (input.authFailureThreshold ?? 5)) {
    firing.push({
      ...PROPOSED_ALERTS[1],
      state: 'firing',
      trigger: `Observed ${authFailures.length} auth failure events in the last ${input.windowMinutes ?? 15} minutes.`,
    });
  }

  const mfaFailures = failures.filter((e) => e.event.startsWith('auth.mfa') && (e.severity === 'ERROR' || e.severity === 'WARN'));
  if (mfaFailures.length >= (input.mfaFailureThreshold ?? 3)) {
    firing.push({
      ...PROPOSED_ALERTS[2],
      state: 'firing',
      trigger: `Observed ${mfaFailures.length} MFA failure events in the last ${input.windowMinutes ?? 10} minutes.`,
    });
  }

  const paymentFailures = failures.filter((e) => e.module === 'services.data');
  if (paymentFailures.length >= (input.failureThreshold ?? 3)) {
    firing.push({
      ...PROPOSED_ALERTS[4],
      state: 'firing',
      trigger: `Observed ${paymentFailures.length} error/fatal service.data events in the last ${input.windowMinutes ?? 30} minutes.`,
    });
  }

  const receiptFailures = failures.filter((e) => e.module === 'services.receipts');
  if (receiptFailures.length >= 2) {
    firing.push({
      ...PROPOSED_ALERTS[5],
      state: 'firing',
      trigger: `Observed ${receiptFailures.length} error/fatal services.receipts events in the last ${input.windowMinutes ?? 30} minutes.`,
    });
  }

  const notificationFailures = failures.filter((e) => e.module === 'services.notifications');
  if (notificationFailures.length >= 2) {
    firing.push({
      ...PROPOSED_ALERTS[6],
      state: 'firing',
      trigger: `Observed ${notificationFailures.length} error/fatal services.notifications events in the last 60 minutes.`,
    });
  }

  const staffFailures = failures.filter((e) => e.module === 'services.staff');
  if (staffFailures.length >= 2) {
    firing.push({
      id: 'alert.staff.admin_failure',
      name: 'Staff administration failure',
      severity: 'HIGH',
      state: 'firing',
      trigger: `Observed ${staffFailures.length} error/fatal services.staff events in the last 30 minutes.`,
      source: 'observability.operations',
      owner: 'gym_owner',
      response: 'Review staff administration attempts and keep the owner break-glass path ready.',
      escalation: 'Owner -> technical advisor',
      threshold: '>= 2 errors / 30 min (module=services.staff)',
    });
  }

  if (input.health?.status === 'unhealthy') {
    firing.push({
      ...PROPOSED_ALERTS[3],
      state: 'firing',
      trigger: `Health snapshot reports unhealthy (auth/database/storage) at ${input.health.checkedAt}.`,
    });
  }

  const severities: AlertSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const valid = firing.filter((a) => severities.includes(a.severity));
  return valid;
}
