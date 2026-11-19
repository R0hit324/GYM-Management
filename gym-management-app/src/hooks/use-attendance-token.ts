/**
 * Attendance token lifecycle for the entrance screen (Stage 3).
 *
 * The server mints the plaintext token once and stores only its SHA-256
 * hash. The client cannot ask the server when a token expires, so it uses
 * the same validity value it requested (`app_settings` bounded 5–600 s) to
 * drive a local countdown and rotation. Rotation is presentation only: an
 * expired token is always refused by `check_in`, whatever the clock says.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { mintAttendanceToken } from '@/services/data';

export type AttendanceTokenStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AttendanceTokenResource {
  status: AttendanceTokenStatus;
  token: string | null;
  expiresAt: number | null;
  secondsRemaining: number;
  error: string | null;
  /** Mint a fresh token immediately (manual refresh). */
  refresh: () => void;
}

const MIN_VALIDITY = 5;
const MAX_VALIDITY = 600;
const DEFAULT_VALIDITY = 60;

export function useAttendanceToken(options: {
  enabled: boolean;
  validitySeconds: number;
}): AttendanceTokenResource {
  const validity = Math.min(
    MAX_VALIDITY,
    Math.max(MIN_VALIDITY, Math.floor(options.validitySeconds || DEFAULT_VALIDITY)),
  );

  const [state, setState] = useState<{
    status: AttendanceTokenStatus;
    token: string | null;
    expiresAt: number | null;
    secondsRemaining: number;
    error: string | null;
  }>({
    status: 'idle',
    token: null,
    expiresAt: null,
    secondsRemaining: 0,
    error: null,
  });

  const mountedRef = useRef(true);
  const mintingRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Invalidate any in-flight mint so its result is never applied.
      generationRef.current += 1;
    };
  }, []);

  const mint = useCallback(async (keepCurrent = true) => {
    if (!options.enabled || mintingRef.current) return;
    mintingRef.current = true;
    const generation = (generationRef.current += 1);

    // Keep a current token on screen while a replacement is minted.
    setState((previous) => ({
      ...previous,
      status: keepCurrent && previous.token ? 'ready' : 'loading',
      error: null,
    }));

    const outcome = await mintAttendanceToken(validity);
    if (!mountedRef.current || generation !== generationRef.current) return;
    mintingRef.current = false;

    if (outcome.ok) {
      const now = Date.now();
      setState({
        status: 'ready',
        token: outcome.data,
        expiresAt: now + validity * 1000,
        secondsRemaining: validity,
        error: null,
      });
    } else {
      setState({
        status: 'error',
        token: null,
        expiresAt: null,
        secondsRemaining: 0,
        error: outcome.error,
      });
    }
  }, [options.enabled, validity]);

  const refresh = useCallback(() => {
    generationRef.current += 1;
    mintingRef.current = false;
    void mint();
  }, [mint]);

  // Mint on enable and whenever the requested validity changes. A fresh
  // enable never reuses a token minted under the previous session. The mint
  // is scheduled so the effect body itself does not cascade a render.
  useEffect(() => {
    if (!options.enabled) return;
    const timer = setTimeout(() => {
      void mint(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [options.enabled, mint]);

  // Countdown for the visible readout, and rotation at expiry. Both run in
  // the timer callback (never synchronously in the effect body), and the
  // server independently refuses expired tokens.
  useEffect(() => {
    if (!options.enabled || state.status !== 'ready' || state.expiresAt === null) return;
    const expiresAt = state.expiresAt;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setState((previous) => {
        if (previous.status !== 'ready' || previous.expiresAt !== expiresAt) return previous;
        return remaining === previous.secondsRemaining
          ? previous
          : { ...previous, secondsRemaining: remaining };
      });
      if (remaining <= 0) void mint();
    };
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [options.enabled, state.status, state.expiresAt, mint]);

  return {
    status: options.enabled ? state.status : 'idle',
    token: options.enabled ? state.token : null,
    expiresAt: options.enabled ? state.expiresAt : null,
    secondsRemaining: options.enabled ? state.secondsRemaining : 0,
    error: options.enabled ? state.error : null,
    refresh,
  };
}
