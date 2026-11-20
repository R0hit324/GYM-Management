/**
 * Client-side security event emission (Production Readiness — Stage 2B, WS-7).
 *
 * Emits normalized security events into the centralized structured logger.
 * These are operational/security-stream events; the authoritative business
 * security audit trail remains the existing server-side `audit_log_entries`.
 */
import type { SecurityEventInput, StructuredLogError, StructuredLogMetadata } from './types';
import { getObservabilityLogger } from './logger';

export function recordSecurityEvent(input: SecurityEventInput, loggerOverride?: {
  warn: (event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError) => void;
}): void {
  const logger = loggerOverride ?? getObservabilityLogger();
  logger.warn(
    `security.${input.type}`,
    input.module ?? 'security',
    input.metadata,
    input.error,
  );
}
