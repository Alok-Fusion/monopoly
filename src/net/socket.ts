import type { GameAction, GameState, PlayerProfile } from '../types/game';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage, type VoiceMember } from './protocol';
import { rememberSeat, seatKeyIn } from '../lib/lastSeat';

/**
 * The game's link to the Bazaar game server (one WebSocket). Every player connects out
 * to the server, so it works across cities and networks. The server runs the game; this
 * just sends our moves and receives the game state.
 */

/** 'connecting' = first join / creating a room; 'reconnecting' = was in, lost the link, trying again. */
export type NetStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

const ATTEMPT_TIMEOUT_MS = 12_000;
const HEARTBEAT_MS = 10_000;
/** A ping with no answer for this long means the link is dead. */
const PONG_TIMEOUT_MS = 12_000;
const RETRY_DELAYS_MS = [800, 1500, 2500, 4000, 6000, 8000, 10_000];
/** Keep trying to get back in for this long before asking the player. */
const MAX_RECONNECT_MS = 3 * 60_000;

/**
 * Free hosting (Render) puts the server to sleep after 15 quiet minutes and takes about
 * a minute to wake it, so a first join keeps trying for this long before giving up.
 */
const WAKE_WINDOW_MS = 90_000;
const WAKE_RETRY_MS = 3000;

const UNREACHABLE = "Couldn't reach the game server. Check your internet connection and try again.";

/** A plain web request wakes a sleeping server sooner than waiting on the WebSocket. */
function wakeServer(url: string) {
  void fetch(`${url.replace(/^ws/, 'http')}/health`, { mode: 'no-cors', cache: 'no-store' }).catch(() => undefined);
}

/** Where the game server lives: VITE_GAME_SERVER_URL, or a local server while developing. */
export function gameServerUrl(): string | null {
  const configured = import.meta.env.VITE_GAME_SERVER_URL;
  if (configured) return String(configured).trim().replace(/^http/, 'ws').replace(/\/+$/, '');
  if (import.meta.env.DEV) return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8787`;
  return null;
}

/**
 * Starts waking the game server without waiting for anyone to create or join a room.
 * Called when the site opens, so a sleeping free server is up by the time it's needed.
 */
export function warmUpServer() {
  const url = gameServerUrl();
  if (url) wakeServer(url);
}

/** Turns whatever a player typed or pasted (a code, or a whole invite link) into a room code. */
export function normalizeRoomCode(input: string): string {
  const fromLink = /[?&]room=([A-Za-z0-9]+)/.exec(input)?.[1];
  return (fromLink ?? input).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

interface Session {
  code: string;
  player: PlayerProfile;
  create: boolean;
  seatHint?: string;
  /** The server's secret for our seat (proves a reconnect is really us). */
  seatKey?: string;
  /** Got the game at least once (so losing the link means "reconnect", not "join failed"). */
  joined: boolean;
  startedAt: number;
  lostAt: number;
  retries: number;
  onJoined: () => void;
  onError: (message: string) => void;
}

export class NetworkManager {
  public status: NetStatus = 'idle';
  /** Server clock minus ours, so countdowns match for everyone. */
  public clockOffset = 0;

  private session: Session | null = null;
  private socket: WebSocket | null = null;
  /** Bumped whenever a socket is dropped, so late events from old ones are ignored. */
  private generation = 0;
  private attemptTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pingSentAt = 0;
  private awaitingPong = false;

  public onState?: (state: GameState, hostId: string) => void;
  /** The server seated us under this id (it can differ from ours after a new tab or device). */
  public onWelcome?: (playerId: string) => void;
  public onRejected?: (reason: string) => void;
  public onStatus?: (status: NetStatus, message?: string) => void;
  public onVoiceRoster?: (members: VoiceMember[]) => void;
  /** The link is up (first time, or again after a reconnect). */
  public onLinkReady?: () => void;
  /** The server seems to be asleep and is being woken up (first join can take a minute). */
  public onWaking?: () => void;

  private setStatus(status: NetStatus, message?: string) {
    this.status = status;
    this.onStatus?.(status, message);
    if (status === 'connected') this.onLinkReady?.();
  }

  public createRoom(code: string, player: PlayerProfile, cb: { onJoined: () => void; onError: (message: string) => void }) {
    this.start({ code, player, create: true, joined: false, startedAt: Date.now(), lostAt: 0, retries: 0, ...cb });
  }

  public joinRoom(code: string, player: PlayerProfile, options: { seatHint?: string; onJoined: () => void; onError: (message: string) => void }) {
    this.start({
      code,
      player,
      create: false,
      seatHint: options.seatHint,
      joined: false,
      startedAt: Date.now(),
      lostAt: 0,
      retries: 0,
      onJoined: options.onJoined,
      onError: options.onError,
    });
  }

  private start(session: Session) {
    this.cleanup();
    this.session = session;
    const url = gameServerUrl();
    if (url) wakeServer(url);
    this.connect();
  }

  private dropSocket() {
    this.generation += 1;
    if (this.attemptTimer) clearTimeout(this.attemptTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.attemptTimer = this.retryTimer = this.heartbeat = null;
    this.awaitingPong = false;
    const ws = this.socket;
    this.socket = null;
    try {
      ws?.close();
    } catch {
      /* already closed */
    }
  }

  private connect() {
    const s = this.session;
    if (!s) return;
    this.dropSocket();
    const url = gameServerUrl();
    if (!url) return this.failed("Online play isn't set up on this site yet (the game server address is missing).");
    const gen = this.generation;
    const alive = () => gen === this.generation && this.session === s;
    this.setStatus(s.joined ? 'reconnecting' : 'connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${url}/room/${encodeURIComponent(s.code)}`);
    } catch {
      return this.failed(UNREACHABLE);
    }
    this.socket = ws;
    this.attemptTimer = setTimeout(() => alive() && this.failed(UNREACHABLE), ATTEMPT_TIMEOUT_MS);

    ws.onopen = () => {
      if (!alive()) return;
      this.send({ type: 'JOIN', version: PROTOCOL_VERSION, player: s.player, seatHint: s.seatHint, seatKey: s.seatKey ?? seatKeyIn(s.code), create: s.create });
      this.heartbeat = setInterval(() => alive() && this.beat(), HEARTBEAT_MS);
    };
    ws.onmessage = (event) => {
      if (!alive()) return;
      this.awaitingPong = false; // anything from the server proves the link works
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handle(msg, s);
    };
    ws.onclose = () => alive() && this.lost();
  }

  /** Background tabs run timers late, so only an unanswered ping counts as a dead link. */
  private beat() {
    if (this.awaitingPong) {
      if (Date.now() - this.pingSentAt > PONG_TIMEOUT_MS) this.lost();
      return;
    }
    this.awaitingPong = true;
    this.pingSentAt = Date.now();
    this.send({ type: 'PING' });
  }

  private handle(msg: ServerMessage, s: Session) {
    switch (msg.type) {
      case 'WELCOME':
        s.player = { ...s.player, id: msg.playerId };
        s.seatHint = undefined;
        if (typeof msg.seatKey === 'string') {
          s.seatKey = msg.seatKey;
          rememberSeat(s.code, msg.playerId, msg.seatKey);
        }
        this.onWelcome?.(msg.playerId);
        return;
      case 'STATE': {
        if (typeof msg.serverNow === 'number') this.clockOffset = msg.serverNow - Date.now();
        if (this.status !== 'connected') {
          if (this.attemptTimer) clearTimeout(this.attemptTimer);
          this.attemptTimer = null;
          const first = !s.joined;
          s.joined = true;
          s.lostAt = 0;
          s.retries = 0;
          this.setStatus('connected');
          if (first) s.onJoined();
        }
        this.onState?.(msg.state, msg.hostId);
        return;
      }
      case 'VOICE_ROSTER':
        this.onVoiceRoster?.(msg.members);
        return;
      case 'REJECTED': {
        const reason = msg.reason;
        this.cleanup();
        this.setStatus('disconnected', reason);
        this.onRejected?.(reason);
        return;
      }
      default:
        return;
    }
  }

  private failed(message: string) {
    const s = this.session;
    if (!s) return;
    if (!s.joined && message === UNREACHABLE && Date.now() - s.startedAt < WAKE_WINDOW_MS) {
      // Probably a sleeping server starting up: keep knocking for a while
      this.dropSocket();
      this.onWaking?.();
      this.retryTimer = setTimeout(() => this.session === s && this.connect(), WAKE_RETRY_MS);
      return;
    }
    if (!s.joined) {
      // Never got in: say why and let the player try again
      this.session = null;
      this.dropSocket();
      this.setStatus('disconnected', message);
      s.onError(message);
      return;
    }
    this.lost();
  }

  /** Lost the server after being in the game: keep trying to get back in. */
  private lost() {
    const s = this.session;
    if (!s) return;
    if (!s.joined) return this.failed(UNREACHABLE);
    this.dropSocket();
    if (!s.lostAt) s.lostAt = Date.now();
    if (Date.now() - s.lostAt > MAX_RECONNECT_MS) {
      this.setStatus('disconnected', 'Lost connection to the game.');
      return;
    }
    this.setStatus('reconnecting');
    const delay = RETRY_DELAYS_MS[Math.min(s.retries, RETRY_DELAYS_MS.length - 1)]!;
    s.retries += 1;
    this.retryTimer = setTimeout(() => this.session === s && this.connect(), delay);
  }

  /** Page back in front / network back: retry now, or double-check a link that looks fine. */
  public reconnectNow() {
    const s = this.session;
    if (!s || !s.joined) return;
    if (this.status === 'connected' && this.socket?.readyState === WebSocket.OPEN) {
      this.awaitingPong = true;
      this.pingSentAt = Date.now() - PONG_TIMEOUT_MS + 5000; // no answer within ~5 s: reconnect
      this.send({ type: 'PING' });
      return;
    }
    s.retries = 0;
    if (this.status === 'disconnected') s.lostAt = Date.now();
    this.connect();
  }

  private send(msg: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  public sendAction(action: GameAction): boolean {
    if (this.status !== 'connected') return false;
    return this.send({ type: 'ACTION', action });
  }

  /** Tell the room whether we're in the voice call. */
  public setVoiceState(inVoice: boolean, muted: boolean, peerId?: string) {
    this.send({ type: 'VOICE', inVoice, muted, peerId });
  }

  public cleanup() {
    this.session = null;
    this.dropSocket();
    this.onVoiceRoster?.([]);
    this.status = 'idle';
  }
}

export const net = new NetworkManager();
