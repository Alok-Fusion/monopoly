import { Peer, DataConnection, PeerOptions } from 'peerjs';
import { GameAction, GameState, PlayerProfile } from '../types/game';
import { Assembler, toFrames } from './frames';

export type NetMessage =
  | { type: 'STATE_SYNC'; state: GameState }
  | { type: 'ACTION'; action: GameAction; senderId: string }
  /** `seatHint`: the seat this device held in this room before (new tab, browser restarted…). */
  | { type: 'PLAYER_JOIN'; player: PlayerProfile; seatHint?: string }
  /** The host seated this guest as a different player id than the one they asked for (they're back in their old seat). */
  | { type: 'SEAT'; playerId: string }
  | { type: 'JOIN_REJECTED'; reason: string }
  | { type: 'PING' }
  | { type: 'PONG' };

/** 'connecting' = first join / creating a room; 'reconnecting' = was in, lost the link, trying again. */
export type NetStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface JoinRequest {
  player: PlayerProfile;
  seatHint?: string;
  /** Players who currently have a working connection to this room (not counting this one). */
  livePlayerIds: Set<string>;
  /** Seat the guest as this player id (tells them if it differs from what they asked for). */
  accept: (playerId: string) => void;
  /** Send the current game state to just this guest. */
  reply: (state: GameState) => void;
  reject: (reason: string) => void;
}

const PEER_PREFIX = 'bazaar-game-room-';
/** One attempt to reach the host (signalling + direct link + first game state). */
const ATTEMPT_TIMEOUT_MS = 15_000;
const HEARTBEAT_MS = 3_000;
/** The host gives up on a silent guest after this long (they then show as offline). */
const GUEST_SILENCE_MS = 15_000;
/** A guest treats a silent host as gone after this long and reconnects. */
const HOST_SILENCE_MS = 12_000;
const RETRY_DELAYS_MS = [800, 1500, 2500, 4000, 6000, 8000, 10_000];
/** Guests keep trying to get back in for this long before asking the player. */
const MAX_RECONNECT_MS = 3 * 60_000;

function send(conn: DataConnection | null | undefined, msg: NetMessage): boolean {
  if (!conn?.open) return false;
  try {
    for (const frame of toFrames(msg)) conn.send(frame);
    return true;
  } catch (e) {
    console.warn('Bazaar: could not send', msg.type, e);
    return false;
  }
}

/**
 * STUN lets two browsers find a direct route to each other; it works for most
 * home Wi-Fi. Phones on mobile data or strict office networks often also need a
 * TURN relay — set VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL in a
 * .env file to add one.
 */
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ];
  const env = import.meta.env;
  if (env.VITE_TURN_URL) {
    servers.push({
      urls: String(env.VITE_TURN_URL).split(',').map((u) => u.trim()),
      username: env.VITE_TURN_USERNAME ? String(env.VITE_TURN_USERNAME) : undefined,
      credential: env.VITE_TURN_CREDENTIAL ? String(env.VITE_TURN_CREDENTIAL) : undefined,
    });
  }
  return servers;
}

const PEER_OPTIONS: PeerOptions = { debug: 1, config: { iceServers: iceServers() } };

function describePeerError(err: { type?: string; message?: string }, role: 'host' | 'guest'): string {
  switch (err.type) {
    case 'unavailable-id':
      return 'That room code is already in use. Try creating a new room.';
    case 'peer-unavailable':
      return 'Room not found. Check the code, and make sure the host still has the game open.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Could not reach the matchmaking server. Check your internet connection.';
    case 'browser-incompatible':
      return 'This browser does not support peer-to-peer connections.';
    case 'webrtc':
      return 'A direct connection could not be made between your devices. Try the same Wi-Fi, or add a TURN relay (see README).';
    default:
      return err.message || (role === 'host' ? 'Could not create the room.' : 'Could not join the room.');
  }
}

/** Turns whatever a player typed or pasted (a code, or a whole invite link) into a room code. */
export function normalizeRoomCode(input: string): string {
  const fromLink = /[?&]room=([A-Za-z0-9]+)/.exec(input)?.[1];
  return (fromLink ?? input).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

interface GuestLink {
  conn: DataConnection;
  playerId?: string;
  lastSeen: number;
  assembler: Assembler;
}

interface JoinIntent {
  roomCode: string;
  player: PlayerProfile;
  seatHint?: string;
  /** Got the first game state at least once (so losing the link means "reconnect", not "join failed"). */
  joined: boolean;
  lostAt: number;
  retries: number;
  onJoined: () => void;
  onError: (message: string) => void;
}

export class NetworkManager {
  private peer: Peer | null = null;
  /** Bumped whenever a peer is torn down, so late events from old ones are ignored. */
  private generation = 0;
  public isHost = false;
  public status: NetStatus = 'idle';

  // Host side
  private guests = new Map<string, GuestLink>();
  private hostHeartbeat: ReturnType<typeof setInterval> | null = null;
  private pendingState: GameState | null = null;
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;

  // Guest side
  private join: JoinIntent | null = null;
  private hostConn: DataConnection | null = null;
  private hostLastSeen = 0;
  private guestHeartbeat: ReturnType<typeof setInterval> | null = null;
  private attemptTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  public onStateSync?: (state: GameState) => void;
  public onActionReceived?: (action: GameAction, senderId: string) => void;
  public onPlayerJoined?: (request: JoinRequest) => void;
  public onPlayerLeft?: (playerId: string) => void;
  public onSeatAssigned?: (playerId: string) => void;
  public onJoinRejected?: (reason: string) => void;
  public onStatus?: (status: NetStatus, message?: string) => void;

  private setStatus(status: NetStatus, message?: string) {
    this.status = status;
    this.onStatus?.(status, message);
  }

  /** Keep the link to the matchmaking server alive so new guests can still find the room. */
  private keepSignalling(peer: Peer) {
    peer.on('disconnected', () => {
      setTimeout(() => {
        if (this.peer === peer && !peer.destroyed && peer.disconnected) peer.reconnect();
      }, 1000);
    });
  }

  /* -------------------------------- host -------------------------------- */

  public createRoom(roomCode: string, onReady: (roomCode: string) => void, onError: (err: string) => void) {
    this.cleanup();
    this.isHost = true;
    const gen = this.generation;
    const alive = () => gen === this.generation;
    this.setStatus('connecting');

    try {
      const peer = new Peer(`${PEER_PREFIX}${roomCode.toLowerCase()}`, PEER_OPTIONS);
      this.peer = peer;
      this.keepSignalling(peer);
      let ready = false;
      peer.on('open', () => {
        if (!alive()) return;
        if (!ready) {
          ready = true;
          this.startHostHeartbeat(gen);
          onReady(roomCode);
        }
        this.setStatus('connected');
      });
      peer.on('connection', (conn) => alive() && this.acceptGuestConnection(conn));
      peer.on('error', (err) => {
        if (!alive()) return;
        console.warn('PeerJS host error:', err);
        // Once the room is up, a guest failing to connect or a blip with the matchmaking
        // server doesn't affect the game — keepSignalling() will get us back.
        if (ready) return;
        const msg = describePeerError(err as { type?: string; message?: string }, 'host');
        this.setStatus('disconnected', msg);
        onError(msg);
      });
    } catch (e: unknown) {
      this.setStatus('disconnected');
      onError((e as Error).message || 'Failed to create room');
    }
  }

  private acceptGuestConnection(conn: DataConnection) {
    const key = conn.connectionId;
    const link: GuestLink = { conn, lastSeen: Date.now(), assembler: new Assembler() };
    this.guests.set(key, link);

    conn.on('open', () => (link.lastSeen = Date.now()));
    conn.on('data', (data) => {
      link.lastSeen = Date.now();
      const msg = link.assembler.take(data) as NetMessage | null;
      if (!msg) return;
      switch (msg.type) {
        case 'PING':
          send(conn, { type: 'PONG' });
          return;
        case 'PLAYER_JOIN':
          this.handleJoin(key, link, msg.player, msg.seatHint);
          return;
        case 'ACTION':
          // Only trust the player id this connection was seated as
          if (link.playerId && link.playerId === msg.senderId) this.onActionReceived?.(msg.action, msg.senderId);
          return;
        default:
          return;
      }
    });
    // An 'error' on a data connection doesn't mean it's gone (e.g. one message failed).
    // Only a real close — or the heartbeat going silent — counts as leaving.
    conn.on('error', (err) => console.warn('Bazaar: guest connection error', err));
    conn.on('close', () => this.dropGuest(key));
  }

  private handleJoin(key: string, link: GuestLink, player: PlayerProfile, seatHint?: string) {
    const livePlayerIds = new Set<string>();
    this.guests.forEach((g, k) => {
      if (k !== key && g.playerId && g.conn.open) livePlayerIds.add(g.playerId);
    });
    this.onPlayerJoined?.({
      player,
      seatHint,
      livePlayerIds,
      accept: (playerId) => {
        link.playerId = playerId;
        if (playerId !== player.id) send(link.conn, { type: 'SEAT', playerId });
        // The same seat on an older connection (refresh, new tab or device): newest wins,
        // and the old one is told so it doesn't keep trying to win the seat back.
        this.guests.forEach((g, k) => {
          if (k !== key && g.playerId === playerId) {
            this.guests.delete(k);
            send(g.conn, { type: 'JOIN_REJECTED', reason: 'You joined this game from another tab or device, so this one was disconnected.' });
            setTimeout(() => g.conn.close(), 500);
          }
        });
      },
      reply: (state) => send(link.conn, { type: 'STATE_SYNC', state }),
      reject: (reason) => {
        send(link.conn, { type: 'JOIN_REJECTED', reason });
        this.guests.delete(key);
        setTimeout(() => link.conn.close(), 500);
      },
    });
  }

  private dropGuest(key: string) {
    const link = this.guests.get(key);
    if (!link) return;
    this.guests.delete(key);
    const playerId = link.playerId;
    const stillHere = !!playerId && [...this.guests.values()].some((g) => g.playerId === playerId);
    if (playerId && !stillHere) this.onPlayerLeft?.(playerId);
  }

  private startHostHeartbeat(gen: number) {
    if (this.hostHeartbeat) clearInterval(this.hostHeartbeat);
    this.hostHeartbeat = setInterval(() => {
      if (gen !== this.generation) return;
      const now = Date.now();
      this.guests.forEach((link, key) => {
        if (now - link.lastSeen > GUEST_SILENCE_MS) {
          this.dropGuest(key);
          link.conn.close();
        } else {
          send(link.conn, { type: 'PING' });
        }
      });
    }, HEARTBEAT_MS);
  }

  /** Remove a player from the room on purpose (host kicked them). */
  public rejectGuest(playerId: string, reason: string) {
    this.guests.forEach((link, key) => {
      if (link.playerId !== playerId) return;
      send(link.conn, { type: 'JOIN_REJECTED', reason });
      this.guests.delete(key);
      setTimeout(() => link.conn.close(), 500);
    });
  }

  /** Sends the latest state to every seated guest (several quick changes go out as one). */
  public broadcastState(state: GameState) {
    if (!this.isHost) return;
    this.pendingState = state;
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      const latest = this.pendingState;
      this.pendingState = null;
      if (!latest) return;
      const msg: NetMessage = { type: 'STATE_SYNC', state: latest };
      this.guests.forEach((link) => link.playerId && send(link.conn, msg));
    }, 30);
  }

  /* -------------------------------- guest ------------------------------- */

  public joinRoom(
    roomCode: string,
    player: PlayerProfile,
    options: { seatHint?: string; onJoined: () => void; onError: (message: string) => void }
  ) {
    this.cleanup();
    this.isHost = false;
    this.join = { roomCode, player, seatHint: options.seatHint, joined: false, lostAt: 0, retries: 0, onJoined: options.onJoined, onError: options.onError };
    this.connectToHost();
  }

  /** Tear down the current guest peer but keep the intent to be in the room. */
  private resetGuestLink() {
    this.generation += 1;
    if (this.attemptTimer) clearTimeout(this.attemptTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.guestHeartbeat) clearInterval(this.guestHeartbeat);
    this.attemptTimer = this.retryTimer = this.guestHeartbeat = null;
    const conn = this.hostConn;
    this.hostConn = null;
    conn?.close();
    const peer = this.peer;
    this.peer = null;
    peer?.destroy();
  }

  private connectToHost() {
    const join = this.join;
    if (!join) return;
    this.resetGuestLink();
    const gen = this.generation;
    const alive = () => gen === this.generation && this.join === join;
    this.setStatus(join.joined ? 'reconnecting' : 'connecting');

    this.attemptTimer = setTimeout(() => {
      if (alive()) this.attemptFailed("Couldn't reach the room. Make sure the host still has the game open, and that you're on their invite link.");
    }, ATTEMPT_TIMEOUT_MS);

    try {
      const peer = new Peer(PEER_OPTIONS);
      this.peer = peer;
      this.keepSignalling(peer);
      peer.on('open', () => {
        if (!alive() || this.hostConn) return; // re-registered with the matchmaking server; the game link is separate
        const conn = peer.connect(`${PEER_PREFIX}${join.roomCode.toLowerCase()}`, { reliable: true, serialization: 'json' });
        this.hostConn = conn;
        const assembler = new Assembler();
        conn.on('open', () => {
          if (!alive()) return;
          this.hostLastSeen = Date.now();
          send(conn, { type: 'PLAYER_JOIN', player: join.player, seatHint: join.seatHint });
          this.startGuestHeartbeat(gen, conn);
        });
        conn.on('data', (data) => {
          if (!alive()) return;
          this.hostLastSeen = Date.now();
          const msg = assembler.take(data) as NetMessage | null;
          if (msg) this.handleHostMessage(msg, conn, join);
        });
        conn.on('error', (err) => console.warn('Bazaar: host connection error', err));
        conn.on('close', () => alive() && this.hostLost());
      });
      peer.on('error', (err) => {
        if (!alive()) return;
        console.warn('PeerJS guest error:', err);
        // Matchmaking-server hiccups don't matter while the direct link to the host works
        if (this.hostConn?.open && this.status === 'connected') return;
        this.attemptFailed(describePeerError(err as { type?: string; message?: string }, 'guest'));
      });
    } catch (e: unknown) {
      this.attemptFailed((e as Error).message || 'Failed to join room');
    }
  }

  private handleHostMessage(msg: NetMessage, conn: DataConnection, join: JoinIntent) {
    switch (msg.type) {
      case 'PING':
        send(conn, { type: 'PONG' });
        return;
      case 'SEAT':
        join.player = { ...join.player, id: msg.playerId };
        join.seatHint = undefined;
        this.onSeatAssigned?.(msg.playerId);
        return;
      case 'STATE_SYNC': {
        if (this.status !== 'connected') {
          if (this.attemptTimer) clearTimeout(this.attemptTimer);
          this.attemptTimer = null;
          const first = !join.joined;
          join.joined = true;
          join.lostAt = 0;
          join.retries = 0;
          this.setStatus('connected');
          if (first) join.onJoined();
        }
        this.onStateSync?.(msg.state);
        return;
      }
      case 'JOIN_REJECTED': {
        const reason = msg.reason;
        this.cleanup();
        this.setStatus('disconnected', reason);
        this.onJoinRejected?.(reason);
        return;
      }
      default:
        return;
    }
  }

  private startGuestHeartbeat(gen: number, conn: DataConnection) {
    if (this.guestHeartbeat) clearInterval(this.guestHeartbeat);
    this.guestHeartbeat = setInterval(() => {
      if (gen !== this.generation) return;
      if (Date.now() - this.hostLastSeen > HOST_SILENCE_MS) this.hostLost();
      else send(conn, { type: 'PING' });
    }, HEARTBEAT_MS);
  }

  private attemptFailed(message: string) {
    const join = this.join;
    if (!join) return;
    if (!join.joined) {
      // Never got in: say why and let the player try again
      this.join = null;
      this.resetGuestLink();
      this.setStatus('disconnected', message);
      join.onError(message);
      return;
    }
    this.hostLost();
  }

  /** Lost the host after being in the game: keep trying to get back in. */
  private hostLost() {
    const join = this.join;
    if (!join) return;
    if (!join.joined) return this.attemptFailed("Couldn't reach the room.");
    this.resetGuestLink();
    if (!join.lostAt) join.lostAt = Date.now();
    if (Date.now() - join.lostAt > MAX_RECONNECT_MS) {
      this.setStatus('disconnected', 'Lost connection to the host.');
      return;
    }
    this.setStatus('reconnecting');
    const delay = RETRY_DELAYS_MS[Math.min(join.retries, RETRY_DELAYS_MS.length - 1)]!;
    join.retries += 1;
    this.retryTimer = setTimeout(() => this.join === join && this.connectToHost(), delay);
  }

  /**
   * Call when the page comes back to the foreground or the network returns: a guest
   * that lost the host retries right away; one that looks fine double-checks the link.
   */
  public reconnectNow() {
    const join = this.join;
    if (!join || !join.joined) return;
    if (this.status === 'connected' && this.hostConn?.open) {
      // Phones freeze background tabs — if the host doesn't answer within ~5 s, reconnect
      this.hostLastSeen = Math.min(this.hostLastSeen, Date.now() - HOST_SILENCE_MS + 5000);
      send(this.hostConn, { type: 'PING' });
      return;
    }
    join.retries = 0;
    if (this.status === 'disconnected') join.lostAt = Date.now();
    this.connectToHost();
  }

  public sendActionToHost(action: GameAction, senderId: string): boolean {
    if (this.status !== 'connected') return false;
    return send(this.hostConn, { type: 'ACTION', action, senderId });
  }

  /* ------------------------------- shared ------------------------------- */

  public cleanup() {
    this.join = null;
    this.resetGuestLink();
    if (this.hostHeartbeat) clearInterval(this.hostHeartbeat);
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    this.hostHeartbeat = this.broadcastTimer = null;
    this.pendingState = null;
    const guests = [...this.guests.values()];
    this.guests.clear();
    guests.forEach((g) => g.conn.close());
    this.isHost = false;
    this.status = 'idle';
  }
}

export const net = new NetworkManager();
