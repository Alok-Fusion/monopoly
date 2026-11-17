import type { PublicRoom } from './protocol';
import { gameServerUrl } from './socket';

/**
 * Open public rooms from the game server, busiest first. A sleeping free server can take
 * up to a minute to answer, so callers pick how long they're willing to wait.
 */
export async function fetchPublicRooms(timeoutMs = 8000): Promise<PublicRoom[]> {
  const url = gameServerUrl();
  if (!url) return [];
  const res = await fetch(`${url.replace(/^ws/, 'http')}/rooms`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`rooms ${res.status}`);
  const data = (await res.json()) as { rooms?: PublicRoom[] };
  return Array.isArray(data.rooms) ? data.rooms.filter((r) => r && typeof r.code === 'string' && r.players < r.maxPlayers) : [];
}

/** The room a solo player should drop into: the one with the most people already waiting. */
export function bestRoom(rooms: PublicRoom[]): PublicRoom | undefined {
  return [...rooms].sort((a, b) => b.humans - a.humans || b.waitingFor - a.waitingFor)[0];
}
