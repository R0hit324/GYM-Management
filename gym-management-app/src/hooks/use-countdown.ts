/**
 * Countdown hook for auth resend cooldowns and code-expiry readouts.
 * One shared implementation so every auth screen counts the same way.
 */
import { useCallback, useEffect, useState } from 'react';

export function useCountdown(initialSeconds: number) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const active = remaining > 0;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [active]);

  const restart = useCallback((seconds: number) => setRemaining(Math.max(0, seconds)), []);
  const stop = useCallback(() => setRemaining(0), []);

  return { remaining, active, restart, stop };
}
