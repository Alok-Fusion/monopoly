import React, { useEffect, useRef, useState } from 'react';
import { useServerStatus, useWakingSeconds } from '../../net/serverStatus';

/** A typical cold start on the free server; the bar fills against this. */
const TYPICAL_WAKE_S = 45;

/**
 * Shows the game server waking up with a live counter, so nobody stares at a frozen
 * button wondering whether to give up. Says so briefly once it's up.
 */
export const ServerWake: React.FC<{ connecting: boolean; waking: boolean }> = ({ connecting, waking }) => {
  const { state } = useServerStatus();
  const seconds = useWakingSeconds();
  const isWaking = state === 'waking' || (connecting && waking);

  // "Game server is up" for a few seconds after a wake-up the player watched
  const [justWoke, setJustWoke] = useState(false);
  const wasWaking = useRef(false);
  useEffect(() => {
    if (isWaking) wasWaking.current = true;
    else if (wasWaking.current && state === 'ready') {
      wasWaking.current = false;
      setJustWoke(true);
      const id = setTimeout(() => setJustWoke(false), 4000);
      return () => clearTimeout(id);
    }
  }, [isWaking, state]);

  if (isWaking) {
    const pct = Math.min(95, 8 + (seconds / TYPICAL_WAKE_S) * 87);
    return (
      <div className="space-y-2 rounded-lg bg-amber-400/10 px-3 py-2.5 text-xs text-amber-100 ring-1 ring-amber-300/30" role="status" aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-200/30 border-t-amber-300" aria-hidden="true" />
          <span className="font-semibold">{connecting ? 'Your room opens as soon as the game server is up' : 'Waking the game server'}</span>
          <span className="ml-auto font-mono tabular-nums text-amber-200/80">{seconds}s</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
          <div className="h-full rounded-full bg-amber-400 transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
        </div>
        <p className="leading-snug text-amber-100/75">
          {seconds < TYPICAL_WAKE_S
            ? 'It naps when nobody’s playing and is usually up within a minute. Pick your name, token and colour meanwhile.'
            : 'Almost there. Slow starts happen after a long quiet spell.'}
        </p>
      </div>
    );
  }
  if (justWoke) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100 ring-1 ring-emerald-300/30" role="status">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
        Game server is up. Rooms open instantly now.
      </p>
    );
  }
  return null;
};
