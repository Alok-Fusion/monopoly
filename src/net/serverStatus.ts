import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Whether the game server is awake. The free server sleeps after 15 quiet minutes and
 * takes up to a minute to start, so the game checks as soon as the site opens. Players
 * then see real progress instead of a frozen "Creating room…" button.
 */
export type ServerState = 'unknown' | 'ready' | 'waking' | 'unreachable';

export interface ServerStatus {
  state: ServerState;
  /** When the current wake-up started (ms), for the "18 s" counter. */
  wakingSince: number;
}

/** An answer slower than this means the server was asleep and is starting up. */
const ASLEEP_AFTER_MS = 1500;
/** Give up on one check after this long (Render's slowest starts are about a minute). */
const CHECK_TIMEOUT_MS = 75_000;

let status: ServerStatus = { state: 'unknown', wakingSince: 0 };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

function set(next: Partial<ServerStatus>) {
  status = { ...status, ...next };
  listeners.forEach((l) => l());
}

/** Asks the server's health page, which also wakes it up. Safe to call often. */
export function checkServer(baseUrl: string): Promise<void> {
  if (inFlight) return inFlight;
  const url = `${baseUrl.replace(/^ws/, 'http')}/health`;
  const slow = setTimeout(() => {
    if (status.state !== 'waking') set({ state: 'waking', wakingSince: Date.now() });
  }, ASLEEP_AFTER_MS);
  inFlight = fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
    .then((res) => set({ state: res.ok ? 'ready' : 'unreachable' }))
    .catch(() => set({ state: 'unreachable' }))
    .finally(() => {
      clearTimeout(slow);
      inFlight = null;
    });
  return inFlight;
}

/** The server finished waking some other way (a room connected). */
export function markServerReady() {
  if (status.state !== 'ready') set({ state: 'ready' });
}

export function useServerStatus(): ServerStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status
  );
}

/** Seconds since the wake-up started, ticking once a second while it lasts. */
export function useWakingSeconds(): number {
  const { state, wakingSince } = useServerStatus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state !== 'waking') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state]);
  return state === 'waking' ? Math.max(0, Math.floor((now - wakingSince) / 1000)) : 0;
}
