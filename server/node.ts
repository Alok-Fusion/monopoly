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
const MAX_ROOMS = 500;

const clock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

const rooms = new Map<string, { room: Room; emptySince: number | null }>();

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
    res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(`Bazaar game server is running. Rooms: ${rooms.size}`);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
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
  if (!rooms.has(code) && rooms.size >= MAX_ROOMS) return refuse('503 Service Unavailable');
  wss.handleUpgrade(req, socket, head, (ws) => attach(code, ws));
});

function attach(code: string, ws: WebSocket) {
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
  room.connect(socket);
  ws.on('message', (data, isBinary) => {
    if (!isBinary) room.message(socket, data.toString());
  });
  let gone = false;
  const leave = () => {
    if (gone) return;
    gone = true;
    room.disconnect(socket);
    if (room.isEmpty) entry!.emptySince = Date.now();
  };
  ws.on('close', leave);
  ws.on('error', leave);
}

// Forget rooms nobody has come back to
setInterval(() => {
  const now = Date.now();
  rooms.forEach((entry, code) => {
    if (entry.emptySince && now - entry.emptySince > EMPTY_ROOM_TTL_MS) rooms.delete(code);
  });
}, 10 * 60_000).unref();

server.listen(PORT, () => console.log(`Bazaar game server listening on port ${PORT}`));

// On shutdown (redeploys), close connections cleanly so players reconnect straight away
const shutdown = () => {
  wss.clients.forEach((ws) => ws.close(1012, 'server restarting'));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
