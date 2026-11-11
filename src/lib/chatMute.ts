import { useSyncExternalStore } from 'react';
import { voice } from '../net/voice';

/**
 * Players this person has muted: their chat is hidden and their voice is silenced, on this
 * device only (nobody else is told). Lasts until the page is closed.
 */
let muted: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export function setMuted(playerId: string, on: boolean) {
  if (muted.has(playerId) === on) return;
  const next = new Set(muted);
  if (on) next.add(playerId);
  else next.delete(playerId);
  muted = next;
  voice.setSilenced(playerId, on);
  listeners.forEach((l) => l());
}

export function unmuteAll() {
  [...muted].forEach((id) => setMuted(id, false));
}

export function useMutedPlayers(): ReadonlySet<string> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => muted
  );
}
