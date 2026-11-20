/**
 * Centralized structured logger (Production Readiness — Stage 2B, WS-7).
 *
 * Design constraints honoured here:
 *  - one logger instance (module singleton) + injectable sink for tests;
 *  - structured event shape: event / severity / module / environment /
 *    timestamp / safe metadata / sanitized error / correlation id;
 *  - severities DEBUG..FATAL; production minimum is WARN, development minimum DEBUG;
 *  - dev/prod behaviour separated;
 *  - no crash on emit; sink failures are swallowed;
 *  - bounded in-memory ring of WARN/ERROR/FATAL for owner operational visibility;
 *  - error deduplication window (default 1s) to avoid duplicate logging.
 */
import type {
  LogSeverity,
  LogSink,
  ObservabilityEnvironment,
  StructuredLogError,
  StructuredLogEvent,
  StructuredLogMetadata,
} from './types';
import { redactMetadata } from './sanitize';

const SEVERITY_ORDER: Record<LogSeverity, number> = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, FATAL: 50 };

const DEFAULT_MINIMUM_SEVERITY: LogSeverity = 'DEBUG';
const DEFAULT_BUFFER_SIZE = 200;
const DEFAULT_DEDUPE_WINDOW_MS = 1000;

export interface StructuredLoggerOptions {
  environment?: ObservabilityEnvironment;
  sink?: LogSink;
  minimumSeverity?: LogSeverity;
  enabled?: boolean;
  maxBufferSize?: number;
  dedupeWindowMs?: number;
}

const isSeverityAtLeast = (severity: LogSeverity, minimum: LogSeverity): boolean =>
  SEVERITY_ORDER[severity] >= SEVERITY_ORDER[minimum];

function resolveEnvironment(): ObservabilityEnvironment {
  const nodeEnv = typeof process !== 'undefined' && typeof process.env !== 'undefined' ? process.env.NODE_ENV : undefined;
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'development') return 'development';
  return 'development';
}

export class StructuredLogger {
  readonly environment: ObservabilityEnvironment;
  readonly minimumSeverity: LogSeverity;
  readonly enabled: boolean;
  readonly maxBufferSize: number;
  readonly dedupeWindowMs: number;

  private readonly sink: LogSink;
  private readonly buffer: StructuredLogEvent[] = [];
  private lastErrorKey: string | null = null;
  private lastErrorAt = 0;

  constructor(options: StructuredLoggerOptions = {}) {
    this.environment = options.environment ?? resolveEnvironment();
    this.minimumSeverity = options.minimumSeverity ?? DEFAULT_MINIMUM_SEVERITY;
    this.enabled = options.enabled ?? true;
    this.maxBufferSize = options.maxBufferSize ?? DEFAULT_BUFFER_SIZE;
    this.dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
    this.sink =
      options.sink ??
      ((event: StructuredLogEvent) => {
        const method = event.severity === 'ERROR' || event.severity === 'FATAL' ? console.error : event.severity === 'WARN' ? console.warn : event.severity === 'DEBUG' ? console.debug : console.log;
        method(`[observability] ${event.event}`, event.module, event.metadata ?? {}, event.error ?? undefined);
      });
  }

  getRecentEvents(limit = 50): StructuredLogEvent[] {
    const safeLimit = Math.max(0, Math.floor(limit));
    if (safeLimit === 0) return [];
    return this.buffer.slice(Math.max(0, this.buffer.length - safeLimit));
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  log(event: StructuredLogEvent): void {
    if (!this.enabled) return;
    if (!isSeverityAtLeast(event.severity, this.minimumSeverity)) return;

    if (event.severity === 'ERROR' || event.severity === 'FATAL') {
      const error = event.error;
      const key = `${event.module}.${event.event}.${error?.message ?? ''}`;
      const now = Date.now();
      if (this.lastErrorKey === key && now - this.lastErrorAt < this.dedupeWindowMs) {
        return;
      }
      this.lastErrorKey = key;
      this.lastErrorAt = now;
    }

    this.push(event);
    try {
      this.sink(event);
    } catch {
      // Logging must never crash the host application.
    }
  }

  debug(event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError): void {
    this.emit({ event, severity: 'DEBUG', module, metadata, error });
  }

  info(event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError): void {
    this.emit({ event, severity: 'INFO', module, metadata, error });
  }

  warn(event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError): void {
    this.emit({ event, severity: 'WARN', module, metadata, error });
  }

  error(event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError): void {
    this.emit({ event, severity: 'ERROR', module, metadata, error });
  }

  fatal(event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError): void {
    this.emit({ event, severity: 'FATAL', module, metadata, error });
  }

  private emit(input: { event: string; severity: LogSeverity; module: string; metadata?: StructuredLogMetadata; error?: StructuredLogError }): void {
    const environment = this.environment;
    const metadata = input.metadata === undefined ? undefined : redactMetadata(input.metadata);
    const error =
      input.error === undefined
        ? undefined
        : {
            name: input.error.name,
            message: input.error.message,
            code: input.error.code ?? null,
            category: input.error.category,
          };
    const event: StructuredLogEvent = {
      event: input.event,
      severity: input.severity,
      module: input.module,
      environment,
      timestamp: new Date().toISOString(),
      metadata,
      error,
    };
    this.log(event);
  }

  private push(event: StructuredLogEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.splice(0, this.buffer.length - this.maxBufferSize);
    }
  }
}

let defaultLoggerInstance: StructuredLogger | null = null;

/** Process-wide structured logger singleton. */
export function getObservabilityLogger(): StructuredLogger {
  if (!defaultLoggerInstance) defaultLoggerInstance = new StructuredLogger();
  return defaultLoggerInstance;
}

/** Default process-wide structured logger instance. */
export const logger: StructuredLogger = getObservabilityLogger();

/** Optional runtime configuration (tests / host wiring). */
export function configureObservabilityLogger(options: StructuredLoggerOptions): StructuredLogger {
  const logger = new StructuredLogger(options);
  defaultLoggerInstance = logger;
  return logger;
}

/** Test-only reset of the singleton. */
export function resetObservabilityLoggerForTests(): void {
  defaultLoggerInstance = null;
}
