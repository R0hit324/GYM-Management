/**
 * Sanitization + error classification for observability (WS-7).
 *
 * Rules:
 *  - sensitive keys and sensitive text are replaced before anything leaves
 *    the logger sink;
 *  - error details are reduced to name / message / code / category — no
 *    stack traces, no raw bodies, no secrets;
 *  - classification is coarse and safe for alerting; it never decides
 *    security posture.
 */
import type { ErrorCategory, StructuredLogError, StructuredLogMetadata } from './types';

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|pwd|secret|token|access|refresh|auth|authorization|apikey|api[-_]?key|credential|private|bearer|otp|totp|seed|signature|cookie|jwt|session)/i;

const SIGNED_URL_PATTERN = /(https?:\/\/\S*?\/storage\/v1\/object\/\S*)/gi;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const SECRET_VALUE_PATTERN = /(sb_secret_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{8,})/g;

/** True when a metadata key is sensitive (secret, token, credential, …). */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/** Redact known secret / signed-URL / JWT material from free text. */
export function redactSensitiveText(value: string): string {
  let out = value;
  out = out.replace(SIGNED_URL_PATTERN, REDACTED);
  out = out.replace(JWT_PATTERN, REDACTED);
  out = out.replace(SECRET_VALUE_PATTERN, REDACTED);
  return out;
}

/**
 * Return a copy of the metadata with sensitive keys replaced and sensitive
 * text redacted. Non-sensitive values pass through unchanged.
 */
export function redactMetadata(
  metadata: StructuredLogMetadata | undefined,
): StructuredLogMetadata | undefined {
  if (metadata === undefined) return undefined;
  const out: StructuredLogMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) {
      out[key] = undefined;
      continue;
    }
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    if (typeof value === 'string') {
      const redacted = redactSensitiveText(value);
      out[key] = redacted === value ? value : redacted;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Coarse error classification for monitoring and alert routing. */
export function classifyError(error: unknown, fallback: ErrorCategory = 'unknown'): ErrorCategory {
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : typeof error === 'string'
        ? error
        : '';
  const message = raw.toLowerCase();
  if (/mfa|otp|totp|multi-factor|multi factor/.test(message)) return 'mfa';
  if (/unauthorized|forbidden|not authorized|not permitted|rbac|insufficient role|segregation/.test(message)) {
    return 'authorization';
  }
  if (/sign in|sign-in|login|password reset|password/.test(message)) return 'auth';
  if (/session|refresh token|access token|expired token|revoked/.test(message)) return 'session';
  if (/database|postgres|relation|column|constraint|foreign key|row-level|sql[_\s]error/.test(message)) {
    return 'database';
  }
  if (/storage|bucket|object|signed url|upload/.test(message)) return 'storage';
  if (/receipt/.test(message)) return 'receipt';
  if (/payment|reversal/.test(message)) return 'payment';
  if (/notif/.test(message)) return 'notification';
  if (/check.?in|attendance|qr|token (has|is)|scan/.test(message)) return 'attendance';
  if (/staff|admin/.test(message)) return 'staff';
  if (/network|fetch|timeout|timed out|econn|socket|enotfound|abort/.test(message)) return 'network';
  if (/not found|no row|does not exist/.test(message)) return 'unknown';
  if (fallback) return fallback;
  return 'unknown';
}

/** Reduce an unknown error to a sanitized, monitorable detail. */
export function sanitizeError(error: unknown, fallback: ErrorCategory = 'unknown'): StructuredLogError {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: unknown }).name ?? 'Error')
      : 'Error';
  const rawMessage =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : typeof error === 'string'
        ? error
        : '';
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const message = rawMessage ? redactSensitiveText(rawMessage) : 'An unknown error occurred.';
  return {
    name,
    message,
    code: code.trim().length > 0 ? code.trim() : null,
    category: classifyError(error, fallback),
  };
}
