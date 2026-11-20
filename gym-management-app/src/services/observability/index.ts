/**
 * Observability service barrel (Production Readiness — Stage 2B, WS-7).
 * Single entry point for the centralized structured logger, sanitization,
 * global error capture, health checks, alerts and security-event emission.
 */
export { REDACTED, classifyError, isSensitiveKey, redactMetadata, redactSensitiveText, sanitizeError } from './sanitize';
export { StructuredLogger, configureObservabilityLogger, getObservabilityLogger, logger, resetObservabilityLoggerForTests } from './logger';
export type { StructuredLoggerOptions } from './logger';
export { installGlobalErrorHandlers } from './error-capture';
export type { GlobalErrorHandlers } from './error-capture';
export { checkAuthHealth, checkDatabaseHealth, checkReceiptStorageHealth, getHealthSnapshot, runHealthChecks } from './health';
export type { HealthCheckContext, HealthCheckResult, HealthSnapshot } from './types';
export { PROPOSED_ALERTS, evaluateAlerts } from './alerts';
export type { AlertEvaluationInput } from './alerts';
export type { Alert } from './types';
export { recordSecurityEvent } from './security';
export type { SecurityEventInput } from './types';
