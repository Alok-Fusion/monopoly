import type { PlayerId } from '../types/game';

/**
 * Remembers which seat this device had in a room, and that seat's secret key from the
 * game server, so a new tab or a refresh can sit back down in it. Kept for a day.
 */
const LAST_SEAT_KEY = 'bazaar_last_seat';
const KEEP_MS = 24 * 3600_000;

interface SavedSeat {
  roomCode?: string;
  playerId?: string;
  seatKey?: string;
  at?: number;
}

function read(): SavedSeat | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_SEAT_KEY) ?? 'null') as SavedSeat | null;
  } catch {
    return null;
  }
}

export function rememberSeat(roomCode: string, playerId: PlayerId, seatKey?: string) {
  const saved = read();
  // Keep the key we already have for this seat when none is given
  const key = seatKey ?? (saved?.roomCode === roomCode && saved.playerId === playerId ? saved.seatKey : undefined);
  try {
    localStorage.setItem(LAST_SEAT_KEY, JSON.stringify({ roomCode, playerId, seatKey: key, at: Date.now() }));
  } catch {
    /* private mode */
  }
}

function fresh(roomCode: string): SavedSeat | undefined {
  const saved = read();
  return saved?.roomCode === roomCode && saved.playerId && Date.now() - (saved.at ?? 0) < KEEP_MS ? saved : undefined;
}

/** The seat this device held in this room, if it was there in the last day. */
export function lastSeatIn(roomCode: string): PlayerId | undefined {
  return fresh(roomCode)?.playerId;
}

/** That seat's secret key, if this device has one. */
export function seatKeyIn(roomCode: string): string | undefined {
  const key = fresh(roomCode)?.seatKey;
  return typeof key === 'string' && /^[0-9a-f]{16,128}$/.test(key) ? key : undefined;
}

/** Forget the seat (left the room on purpose). */
export function forgetSeat() {
  try {
    localStorage.removeItem(LAST_SEAT_KEY);
  } catch {
    /* ignore */
  }
}
