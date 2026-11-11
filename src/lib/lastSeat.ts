import type { PlayerId } from '../types/game';

/** Remembers which seat this device had in a room, so a new tab can sit back down in it. */
const LAST_SEAT_KEY = 'bazaar_last_seat';

export function rememberSeat(roomCode: string, playerId: PlayerId) {
  try {
    localStorage.setItem(LAST_SEAT_KEY, JSON.stringify({ roomCode, playerId, at: Date.now() }));
  } catch {
    /* private mode */
  }
}

/** The seat this device held in this room, if it was there in the last day. */
export function lastSeatIn(roomCode: string): PlayerId | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_SEAT_KEY) ?? 'null') as { roomCode?: string; playerId?: string; at?: number } | null;
    if (saved?.roomCode === roomCode && saved.playerId && Date.now() - (saved.at ?? 0) < 24 * 3600_000) return saved.playerId;
  } catch {
    /* ignore */
  }
  return undefined;
}
