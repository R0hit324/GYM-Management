/**
 * Structured observability types (Production Readiness — Stage 2B, WS-7).
 *
 * This module owns the *shared vocabulary* for operational / security /
 * business observability events. It does NOT introduce a second audit log:
 * the existing server-side `audit_log_entries` stays the authoritative
 * business-security audit trail; the structured logger is the client-side
 * operational + security event stream.
 */

/** Severity levels for structured events. */
export type LogSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

/** Deployment environment an event was emitted in. */
export type ObservabilityEnvironment = 'development' | 'production';

/** Safe error classification used for monitoring without leaking internals. */
export type ErrorCategory =
  | 'unknown'
  | 'network'
  | 'auth'
  | 'authorization'
  | 'database'
  | 'storage'
  | 'receipt'
  | 'payment'
  | 'notification'
  | 'attendance'
  | 'staff'
  | 'mfa'
  | 'session'
  | 'validation';

export interface StructuredLogError {
  name?: string;
  message?: string;
  code?: string | null;
  category: ErrorCategory;
}

export type StructuredLogMetadataValue = string | number | boolean | null | undefined;

export interface StructuredLogMetadata {
  [key: string]: StructuredLogMetadataValue | undefined;
}

/** One sanitized, structured log/event record. */
export interface StructuredLogEvent {
  event: string;
  severity: LogSeverity;
  module: string;
  environment: ObservabilityEnvironment;
  /** ISO-8601 UTC timestamp. */
  timestamp: string;
  metadata?: StructuredLogMetadata;
  error?: StructuredLogError;
  correlationId?: string;
}

export type LogSink = (event: StructuredLogEvent) => void;

export interface StructuredLoggerOptions {
  environment?: ObservabilityEnvironment;
  sink?: LogSink;
  minimumSeverity?: LogSeverity;
  enabled?: boolean;
  maxBufferSize?: number;
  dedupeWindowMs?: number;
}

export interface StructuredLogger {
  readonly environment: ObservabilityEnvironment;
  readonly minimumSeverity: LogSeverity;
  readonly enabled: boolean;
  log: (event: StructuredLogEvent) => void;
  debug: (event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError) => void;
  info: (event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError) => void;
  warn: (event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError) => void;
  error: (event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError) => void;
  fatal: (event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError) => void;
  getRecentEvents: (limit?: number) => StructuredLogEvent[];
  getBufferSize: () => number;
}

/** Client-side security event taxonomy (operational stream, not the server audit table). */
export type SecurityEventType =
  | 'auth.login_failure'
  | 'auth.rate_limited'
  | 'auth.mfa_failure'
  | 'auth.mfa_lock'
  | 'auth.session_restore_failed'
  | 'staff.admin_failure'
  | 'rbac.denied'
  | 'payment.write_failed'
  | 'receipt.issue_failed'
  | 'notification.delivery_failed'
  | 'attendance.checkin_failed'
  | 'app.crash'
  | 'app.unhandled_rejection';

export interface SecurityEventInput {
  type: SecurityEventType;
  module?: string;
  severity?: LogSeverity;
  metadata?: StructuredLogMetadata;
  error?: StructuredLogError;
  correlationId?: string;
}

/** Health check status vocabulary. */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthCheckResult {
  id: string;
  name: string;
  status: HealthStatus;
  detail?: string;
  latencyMs?: number;
  checkedAt: string;
}

export interface HealthSnapshot {
  status: HealthStatus;
  checks: HealthCheckResult[];
  checkedAt: string;
  environment: ObservabilityEnvironment;
}

export interface HealthCheckContext {
  appCheck?: () => Promise<HealthCheckResult>;
  authCheck?: () => Promise<HealthCheckResult>;
  databaseCheck?: () => Promise<HealthCheckResult>;
  storageCheck?: () => Promise<HealthCheckResult>;
  environment?: ObservabilityEnvironment;
}

/** Alert severity vocabulary used by the proposed + evaluated alert model. */
export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AlertState = 'firing' | 'resolved' | 'proposed';

export interface Alert {
  id: string;
  name: string;
  severity: AlertSeverity;
  state: AlertState;
  trigger: string;
  source: string;
  owner: string;
  response: string;
  escalation: string;
  /** Threshold / window kept as data so the rule stays reviewable. */
  threshold: string;
}
