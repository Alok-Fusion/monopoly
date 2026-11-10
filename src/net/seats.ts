import { GameState, PlayerId, PlayerProfile } from '../types/game';
import { MAX_PLAYERS_CAP } from '../engine/state';

export type SeatChoice =
  | { kind: 'existing'; playerId: PlayerId }
  | { kind: 'new'; playerId: PlayerId }
  | { kind: 'reject'; reason: string };

const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Decides where a guest who just connected sits. In order:
 *  1. Their own seat (same browser tab: refresh, network blip, phone woke up). The
 *     newest connection wins; an older one for the same seat is told to stop.
 *  2. The seat this device last held in the room (`seatHint`: new tab, browser restarted).
 *  3. Mid-game, an empty seat with the same name (switched to another device).
 *  4. Otherwise a new seat — lobby only, and only if there's room.
 *
 * `live` holds players who currently have a working connection, so 2 and 3 can never
 * push out someone who is still playing. Nobody can take the host's seat.
 */
export function chooseSeat(
  state: GameState,
  player: PlayerProfile,
  seatHint: string | undefined,
  live: Set<PlayerId>,
  hostId: PlayerId
): SeatChoice {
  const free = (id: PlayerId | undefined) => {
    const p = id ? state.players[id] : undefined;
    return p && !p.isBot && p.id !== hostId && !live.has(p.id) ? p : undefined;
  };

  if (player.id === hostId) return { kind: 'reject', reason: 'Could not join the room. Please reload and try again.' };
  const own = state.players[player.id];
  if (own) return own.isBot ? { kind: 'reject', reason: 'Could not join the room. Please reload and try again.' } : { kind: 'existing', playerId: own.id };

  const hinted = free(seatHint);
  if (hinted) return { kind: 'existing', playerId: hinted.id };

  if (state.phase !== 'LOBBY') {
    const key = nameKey(player.name);
    const byName = state.playerOrder.map((id) => free(id)).find((p) => p && nameKey(p.name) === key);
    if (byName) return { kind: 'existing', playerId: byName.id };
    return {
      kind: 'reject',
      reason: 'That game has already started. Played in it already? Join with the same name you used and you’ll get your seat back.',
    };
  }

  if (state.playerOrder.length >= Math.min(state.settings.maxPlayers, MAX_PLAYERS_CAP)) return { kind: 'reject', reason: 'That room is full.' };
  return { kind: 'new', playerId: player.id };
}

/* ------------------------- this device's last seat ------------------------ */

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
