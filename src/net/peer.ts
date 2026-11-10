import { Peer, DataConnection, PeerOptions } from 'peerjs';
import { GameAction, GameState, PlayerProfile } from '../types/game';

export type NetMessage =
  | { type: 'STATE_SYNC'; state: GameState }
  | { type: 'ACTION'; action: GameAction; senderId: string }
  | { type: 'PLAYER_JOIN'; player: PlayerProfile }
  | { type: 'JOIN_REJECTED'; reason: string };

const PEER_PREFIX = 'bazaar-game-room-';
const JOIN_TIMEOUT_MS = 15000;

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

export class NetworkManager {
  private peer: Peer | null = null;
  /** peerId -> connection */
  private connections: Map<string, DataConnection> = new Map();
  /** peerId -> playerId announced by that guest */
  private peerPlayers: Map<string, string> = new Map();
  private hostConnection: DataConnection | null = null;
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  public isHost = false;

  public onStateSync?: (state: GameState) => void;
  public onActionReceived?: (action: GameAction, senderId: string) => void;
  public onPlayerJoined?: (player: PlayerProfile, reply: (state: GameState) => void) => void;
  public onPlayerLeft?: (playerId: string) => void;
  public onJoinRejected?: (reason: string) => void;
  public onConnectionStatusChange?: (status: 'connected' | 'disconnected' | 'error', errorMsg?: string) => void;

  /** Keep the link to the matchmaking server alive so new guests can still find the room. */
  private keepSignalling(peer: Peer) {
    peer.on('disconnected', () => {
      if (this.peer === peer && !peer.destroyed) {
        setTimeout(() => {
          if (this.peer === peer && !peer.destroyed && peer.disconnected) peer.reconnect();
        }, 1000);
      }
    });
  }

  public createRoom(roomCode: string, onReady: (roomCode: string) => void, onError: (err: string) => void) {
    this.cleanup();
    this.isHost = true;

    try {
      const peer = new Peer(`${PEER_PREFIX}${roomCode.toLowerCase()}`, PEER_OPTIONS);
      this.peer = peer;
      this.keepSignalling(peer);
      let ready = false;
      peer.on('open', () => {
        if (!ready) onReady(roomCode);
        ready = true;
        this.onConnectionStatusChange?.('connected');
      });
      peer.on('connection', (conn) => this.setupHostConnection(conn));
      peer.on('error', (err) => {
        console.warn('PeerJS host error:', err);
        const e = err as { type?: string; message?: string };
        // A guest failing to connect shouldn't take the whole room down
        if (ready && (e.type === 'peer-unavailable' || e.type === 'webrtc')) return;
        const msg = describePeerError(e, 'host');
        onError(msg);
        this.onConnectionStatusChange?.('error', msg);
      });
    } catch (e: unknown) {
      onError((e as Error).message || 'Failed to create room');
    }
  }

  public joinRoom(roomCode: string, playerInfo: PlayerProfile, onJoined: () => void, onError: (err: string) => void) {
    this.cleanup();
    this.isHost = false;
    let settled = false;
    const fail = (msg: string) => {
      if (this.joinTimer) clearTimeout(this.joinTimer);
      this.joinTimer = null;
      if (!settled) onError(msg);
      settled = true;
      this.onConnectionStatusChange?.('error', msg);
    };
    this.joinTimer = setTimeout(
      () => fail("Couldn't reach the room. Make sure the host has the game open, and that you're using their invite link."),
      JOIN_TIMEOUT_MS
    );

    try {
      const peer = new Peer(PEER_OPTIONS);
      this.peer = peer;
      this.keepSignalling(peer);
      peer.on('open', () => {
        if (this.hostConnection) return; // reconnected to the signalling server; data link is separate
        const conn = peer.connect(`${PEER_PREFIX}${roomCode.toLowerCase()}`, { reliable: true, serialization: 'json' });
        this.hostConnection = conn;

        conn.on('open', () => {
          if (this.joinTimer) clearTimeout(this.joinTimer);
          this.joinTimer = null;
          settled = true;
          this.onConnectionStatusChange?.('connected');
          conn.send({ type: 'PLAYER_JOIN', player: playerInfo } satisfies NetMessage);
          onJoined();
        });
        conn.on('data', (data) => this.handleGuestMessage(data as NetMessage));
        conn.on('close', () => {
          if (this.hostConnection === conn) this.onConnectionStatusChange?.('disconnected', 'Disconnected from the host.');
        });
        conn.on('error', (err) => fail(err.message || 'Connection error'));
      });
      peer.on('error', (err) => {
        console.warn('PeerJS guest error:', err);
        fail(describePeerError(err as { type?: string; message?: string }, 'guest'));
      });
    } catch (e: unknown) {
      fail((e as Error).message || 'Failed to join room');
    }
  }

  private setupHostConnection(conn: DataConnection) {
    const remoteId = conn.peer;
    this.connections.set(remoteId, conn);

    conn.on('data', (data) => {
      const msg = data as NetMessage;
      if (msg.type === 'PLAYER_JOIN') {
        this.peerPlayers.set(remoteId, msg.player.id);
        this.onPlayerJoined?.(msg.player, (state) => {
          if (conn.open) conn.send({ type: 'STATE_SYNC', state } satisfies NetMessage);
        });
      } else if (msg.type === 'ACTION') {
        // Only trust the player id this connection registered with
        const registered = this.peerPlayers.get(remoteId);
        if (registered && registered === msg.senderId) {
          this.onActionReceived?.(msg.action, msg.senderId);
        }
      }
    });

    const drop = () => {
      if (this.connections.get(remoteId) !== conn) return;
      this.connections.delete(remoteId);
      const playerId = this.peerPlayers.get(remoteId);
      this.peerPlayers.delete(remoteId);
      // If they already came back on a fresh connection, they're not gone
      const stillHere = playerId && [...this.peerPlayers.values()].includes(playerId);
      if (playerId && !stillHere) this.onPlayerLeft?.(playerId);
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  public rejectGuest(playerId: string, reason: string) {
    this.connections.forEach((conn, peerId) => {
      if (this.peerPlayers.get(peerId) === playerId && conn.open) {
        conn.send({ type: 'JOIN_REJECTED', reason } satisfies NetMessage);
        setTimeout(() => conn.close(), 300);
      }
    });
  }

  private handleGuestMessage(msg: NetMessage) {
    if (msg.type === 'STATE_SYNC') this.onStateSync?.(msg.state);
    else if (msg.type === 'JOIN_REJECTED') this.onJoinRejected?.(msg.reason);
  }

  public broadcastState(state: GameState) {
    if (!this.isHost) return;
    const msg: NetMessage = { type: 'STATE_SYNC', state };
    this.connections.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch (e) {
          console.warn('Could not send state to a guest', e);
        }
      }
    });
  }

  public sendActionToHost(action: GameAction, senderId: string): boolean {
    if (this.hostConnection?.open) {
      this.hostConnection.send({ type: 'ACTION', action, senderId } satisfies NetMessage);
      return true;
    }
    return false;
  }

  public cleanup() {
    if (this.joinTimer) clearTimeout(this.joinTimer);
    this.joinTimer = null;
    this.connections.forEach((c) => c.close());
    this.connections.clear();
    this.peerPlayers.clear();
    if (this.hostConnection) {
      const c = this.hostConnection;
      this.hostConnection = null;
      c.close();
    }
    if (this.peer) {
      const p = this.peer;
      this.peer = null;
      p.destroy();
    }
    this.isHost = false;
  }
}

export const net = new NetworkManager();
