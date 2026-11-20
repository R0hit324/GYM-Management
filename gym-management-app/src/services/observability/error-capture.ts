/**
 * Global error / unhandled-rejection capture (Production Readiness — Stage 2B, WS-7).
 *
 * - fatal JS errors -> logger.error('app.error', 'app', …) with sanitized error detail
 * - unhandled promise rejections -> logger.error('app.unhandled_rejection', 'app', …)
 * - best effort: writes through injectable handlers so tests can exercise the flow
 *   without depending on RN global internals.
 */
import type { StructuredLogError, StructuredLogMetadata } from './types';
import { getObservabilityLogger } from './logger';
import { redactMetadata, sanitizeError } from './sanitize';

export interface GlobalErrorHandlers {
  errorHandler: (error: Error, origin?: string) => void;
  unhandledRejectionHandler: (reason: unknown, promise?: Promise<unknown>) => void;
  dispose: () => void;
}

interface GlobalLike {
  ErrorUtils?: {
    setGlobalHandler?: (handler?: ((error: Error, origin?: string) => void) | null) => void;
  } | null;
  process?: {
    on?: (event: string, listener: (reason: unknown, promise?: Promise<unknown>) => void) => unknown;
    off?: (event: string, listener: (reason: unknown, promise?: Promise<unknown>) => void) => unknown;
  } | null;
}

function globalLike(): GlobalLike {
  return globalThis as unknown as GlobalLike;
}

let installed = false;

/** Install (once per process) global error + unhandled-rejection capture. */
export function installGlobalErrorHandlers(deps?: {
  logger?: { error: (event: string, module: string, metadata?: StructuredLogMetadata, error?: StructuredLogError) => void };
  onError?: (error: Error, origin?: string) => void;
  onUnhandledRejection?: (reason: unknown) => void;
}): GlobalErrorHandlers {
  const logger = deps?.logger ?? getObservabilityLogger();

  const errorHandler = (error: Error, origin?: string): void => {
    logger.error('app.error', 'app', { source: origin ?? 'error' }, sanitizeError(error, 'unknown'));
    deps?.onError?.(error, origin);
  };

  const unhandledRejectionHandler = (reason: unknown, promise?: Promise<unknown>): void => {
    const error = reason instanceof Error ? reason : undefined;
    const metadata: StructuredLogMetadata = error
      ? { source: 'unhandled_rejection', name: error.name }
      : { source: 'unhandled_rejection', reason: typeof reason === 'string' ? reason : 'unknown' };
    logger.error('app.unhandled_rejection', 'app', redactMetadata(metadata));
    deps?.onUnhandledRejection?.(reason);
  };

  const dispose = (): void => {
    try {
      globalLike().ErrorUtils?.setGlobalHandler?.(null);
    } catch {
      // best effort
    }
    try {
      globalLike().process?.off?.('unhandledRejection', unhandledRejectionHandler as never);
    } catch {
      // best effort
    }
  };

  if (installed) {
    return {
      errorHandler,
      unhandledRejectionHandler,
      dispose,
    };
  }
  installed = true;
  try {
    globalLike().ErrorUtils?.setGlobalHandler?.(errorHandler);
  } catch {
    // best effort — handler is still returned for host/test wiring
  }
  try {
    globalLike().process?.on?.('unhandledRejection', unhandledRejectionHandler);
  } catch {
    // best effort
  }

  return { errorHandler, unhandledRejectionHandler, dispose };
}
