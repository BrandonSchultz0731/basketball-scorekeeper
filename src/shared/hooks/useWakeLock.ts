import { useEffect } from 'react';

/**
 * Keeps the screen on while `active` is true. Safari drops the lock whenever the page is hidden, so it
 * is requested again each time the page becomes visible. Failures are ignored: the phone's own
 * Auto-Lock setting is the fallback.
 */
export const useWakeLock = (active: boolean): void => {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen')
        .then((s) => { if (cancelled) s.release(); else sentinel = s; })
        .catch(() => { /* not allowed right now; Auto-Lock setting is the fallback */ });
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      sentinel?.release().catch(() => {});
    };
  }, [active]);
};
