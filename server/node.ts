import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Room, type Socket } from './room';
import { ROOM_CODE_RE } from '../src/net/protocol';

/**
 * Bazaar's game server as a plain Node.js app (runs on Render, or anywhere with Node).
 * Players connect to ws(s)://<server>/room/<CODE>. All rooms live in this one process.
 */

const PORT = Number(process.env.PORT) || 8787;
/** Comma-separated sites allowed to connect, e.g. "https://my-game.vercel.app". Empty = any. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
/** An empty room is kept this long so players can come back to it. */
const EMPTY_ROOM_TTL_MS = 2 * 3600_000;
/** An empty room whose game never started is kept only this long. */
const EMPTY_LOBBY_TTL_MS = 10 * 60_000;
const MAX_ROOMS = 500;
/** Per network address: open connections at once, and new connections a minute. */
const MAX_SOCKETS_PER_IP = 16;
const MAX_CONNECTS_PER_MINUTE = 40;
/** Open connections across the whole server. */
const MAX_SOCKETS = 3000;

/** Runs room code, logging (not crashing on) anything unexpected, so one bad room can't take down every game. */
function guarded(fn: () => void) {
  try {
    fn();
  } catch (e) {
    console.error('Bazaar: room error', e instanceof Error ? e.message : e);
  }
}

const clock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(() => guarded(fn), ms),
  clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

const rooms = new Map<string, { room: Room; emptySince: number | null }>();

/**
 * The visitor's address, used only (in memory) for the abuse limits below; it is never
 * stored or logged. Render sits behind Cloudflare, whose CF-Connecting-IP header can't be
 * set by the visitor; X-Forwarded-For is the fallback.
 */
function clientIp(req: http.IncomingMessage): string {
  const header = (name: string) => {
    const v = req.headers[name];
    return (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim();
  };
  return (header('cf-connecting-ip') || header('true-client-ip') || header('x-forwarded-for') || req.socket.remoteAddress || 'unknown').slice(0, 64);
}
const openSockets = new Map<string, number>();
const recentConnects = new Map<string, number[]>();

function tooManyConnections(ip: string): boolean {
  if ((openSockets.get(ip) ?? 0) >= MAX_SOCKETS_PER_IP) return true;
  const now = Date.now();
  const times = (recentConnects.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= MAX_CONNECTS_PER_MINUTE) {
    recentConnects.set(ip, times);
    return true;
  }
  times.push(now);
  recentConnects.set(ip, times);
  return false;
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

function originAllowed(origin: string | undefined): boolean {
  if (!ALLOWED_ORIGINS.length || !origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    // Local development and home-network testing are always fine
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/' || path === '/health') {
    // Also used to wake the server up before players connect
    res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' });
    res.end('Bazaar game server is running.');
    return;
  }
  res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const code = /^\/room\/([A-Za-z0-9]+)$/.exec((req.url ?? '').split('?')[0] ?? '')?.[1]?.toUpperCase();
  const refuse = (status: string) => {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };
  if (!code || !ROOM_CODE_RE.test(code)) return refuse('404 Not Found');
  if (!originAllowed(req.headers.origin)) return refuse('403 Forbidden');
  if ((!rooms.has(code) && rooms.size >= MAX_ROOMS) || wss.clients.size >= MAX_SOCKETS) return refuse('503 Service Unavailable');
  const ip = clientIp(req);
  if (tooManyConnections(ip)) return refuse('429 Too Many Requests');
  wss.handleUpgrade(req, socket, head, (ws) => attach(code, ws, ip));
});

function attach(code: string, ws: WebSocket, ip: string) {
  openSockets.set(ip, (openSockets.get(ip) ?? 0) + 1);
  let entry = rooms.get(code);
  if (!entry) {
    entry = { room: new Room(code, clock, () => {}), emptySince: null };
    rooms.set(code, entry);
  }
  const { room } = entry;
  entry.emptySince = null;

  const socket: Socket = {
    send: (text) => ws.readyState === ws.OPEN && ws.send(text),
    close: (code, reason) => ws.close(code ?? 1000, reason),
  };
  room.connect(socket, ip);
  ws.on('message', (data, isBinary) => {
    if (!isBinary) guarded(() => room.message(socket, data.toString()));
  });
  let gone = false;
  const leave = () => {
    if (gone) return;
    gone = true;
    const left = (openSockets.get(ip) ?? 1) - 1;
    if (left > 0) openSockets.set(ip, left);
    else openSockets.delete(ip);
    guarded(() => room.disconnect(socket));
    if (!room.isEmpty) return;
    // Nobody made a game here (a wrong code, or someone guessing codes): forget it now,
    // so made-up codes can't fill the server up
    if (!room.hasGame && rooms.get(code) === entry) rooms.delete(code);
    else entry!.emptySince = Date.now();
  };
  ws.on('close', leave);
  ws.on('error', leave);
}

// Forget rooms nobody has come back to
setInterval(() => {
  const now = Date.now();
  rooms.forEach((entry, code) => {
    if (entry.emptySince && now - entry.emptySince > (entry.room.started ? EMPTY_ROOM_TTL_MS : EMPTY_LOBBY_TTL_MS)) rooms.delete(code);
  });
  recentConnects.forEach((times, ip) => {
    if (!times.some((t) => now - t < 60_000)) recentConnects.delete(ip);
  });
}, 60_000).unref();

server.listen(PORT, () => console.log(`Bazaar game server listening on port ${PORT}`));

// On shutdown (redeploys), close connections cleanly so players reconnect straight away
const shutdown = () => {
  wss.clients.forEach((ws) => ws.close(1012, 'server restarting'));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (e) => console.error('Bazaar: unhandled rejection', e instanceof Error ? e.message : e));
process.on('SIGINT', shutdown);
