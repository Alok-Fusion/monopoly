import type { PeerOptions } from 'peerjs';

/**
 * STUN finds a direct route between two browsers, which works on most home Wi-Fi. Mobile
 * data and strict networks block that, so they need a TURN relay. Relay details come from
 * /api/turn (see README), or from VITE_TURN_URL / _USERNAME / _CREDENTIAL at build time.
 * The list is kept short because browsers slow down with five or more servers.
 */
const STUN_SERVER: RTCIceServer = { urls: 'stun:stun.l.google.com:19302' };
const RELAY_FETCH_MS = 3000;
const RELAY_CACHE_MS = 10 * 60_000;
let relayCache: { at: number; servers: RTCIceServer[] } | null = null;

function builtInRelay(): RTCIceServer[] {
  const env = import.meta.env;
  if (!env.VITE_TURN_URL) return [];
  return [
    {
      urls: String(env.VITE_TURN_URL).split(',').map((u) => u.trim()),
      username: env.VITE_TURN_USERNAME ? String(env.VITE_TURN_USERNAME) : undefined,
      credential: env.VITE_TURN_CREDENTIAL ? String(env.VITE_TURN_CREDENTIAL) : undefined,
    },
  ];
}

/** Never throws or hangs: with no relay available the game still tries a direct connection. */
async function fetchRelay(): Promise<RTCIceServer[]> {
  if (relayCache && Date.now() - relayCache.at < RELAY_CACHE_MS) return relayCache.servers;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), RELAY_FETCH_MS);
  try {
    const res = await fetch('/api/turn', { signal: abort.signal });
    if (!res.ok) return [];
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) return [];
    const servers = (body as RTCIceServer[]).filter((x) => !!x && (typeof x.urls === 'string' || Array.isArray(x.urls)));
    if (servers.length) relayCache = { at: Date.now(), servers };
    return servers;
  } catch {
    return []; // no such function here (local dev, other hosts), or it didn't answer in time
  } finally {
    clearTimeout(timer);
  }
}

export async function peerOptions(): Promise<PeerOptions> {
  const relay = [...(await fetchRelay()), ...builtInRelay()];
  // Relay providers usually include their own STUN server
  const hasStun = relay.some((x) => [x.urls].flat().some((u) => u.startsWith('stun:')));
  return { debug: 1, config: { iceServers: hasStun ? relay : [STUN_SERVER, ...relay] } };
}
