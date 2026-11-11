import { createInitialState, gameReducer } from '../src/engine/state';
import { getBotNextAction } from '../src/engine/bots';
import { actorOfAction, decisionOwner, decisionTimeLimitMs, getCurrentPlayerId, isAutomated, openTrades, reconnectWaitMs } from '../src/engine/rules';
import { chooseSeat } from '../src/net/seats';
import { PROTOCOL_VERSION } from '../src/net/protocol';
import type { ClientMessage, ServerMessage, VoiceMember } from '../src/net/protocol';
import type { DecisionKind } from '../src/engine/rules';
import { cleanName, isHexColor, isTeamId, isTokenId } from '../src/engine/safety';
import type { GameAction, GameState, PlayerId, PlayerProfile } from '../src/types/game';

/**
 * One Bazaar room on the server: it holds the game, applies every move, and runs the
 * bots, auction clock, turn timer and reconnect waits. Nothing here depends on
 * any hosting service, so the same room runs in tests, on Render, or elsewhere.
 */

export interface Socket {
  send(text: string): void;
  close(code?: number, reason?: string): void;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SavedRoom {
  code: string;
  state: GameState;
  hostId: PlayerId;
}

/** In the lobby a dropped player keeps their seat this long (enough for a refresh). */
const LOBBY_SEAT_HOLD_MS = 30_000;
/** A host gone this long hands the room's controls to the next player. */
const HOST_HANDOVER_MS = 20_000;
/**
 * A connection that says nothing at all for this long is treated as gone. Browsers ping
 * every 10 s, but background tabs may only manage once a minute, so allow well over that.
 * A real disconnect usually closes the socket straight away anyway.
 */
const SILENCE_MS = 100_000;
const SWEEP_EVERY_MS = 15_000;
/** Players' screens animate the dice, then walk the token square by square. Bots wait for that. */
const DICE_SETTLE_MS = 800;
const STEP_MS = 140;
const ANIMATION_SLACK_MS = 300;
const BROADCAST_AFTER_MS = 25;
const SAVE_AFTER_MS = 2000;
/** Abuse limits: oversized or very frequent messages are dropped. */
const MAX_MESSAGE_CHARS = 32_000;
const RATE_WINDOW_MS = 5000;
const RATE_MAX = 80;
/** A connection must say which seat it wants within this time. */
const JOIN_DEADLINE_MS = 15_000;
/** Chat flood limit per player. */
const CHAT_WINDOW_MS = 10_000;
const CHAT_MAX = 8;

/** Actions only the room's host may send (for anyone). */
const HOST_ACTIONS = new Set<GameAction['type']>(['START_GAME', 'ADD_BOT', 'REMOVE_PLAYER', 'UPDATE_SETTINGS', 'RESET_GAME', 'SKIP_RECONNECT_WAIT', 'SET_PLAYER_TEAM']);
/** Actions only the server itself performs. */
const SERVER_ONLY = new Set<GameAction['type']>(['SYNC_STATE', 'SET_ROOM', 'ADD_PLAYER', 'SET_PLAYER_CONNECTED', 'LAND_ON_TILE', 'AUCTION_TICK']);

const ROOM_NOT_FOUND = 'Room not found. Check the code, or ask for a new invite link.';

interface Client {
  socket: Socket;
  /** Network address, used only to keep removed players out of this room (memory only). */
  ip?: string;
  playerId?: PlayerId;
  lastHeard: number;
  windowStart: number;
  windowCount: number;
  chatTimes: number[];
}

/** Compares two secrets in constant time, so timing can't reveal how much matched. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A long random secret (only the device that holds a seat knows it). */
function newSeatKey(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Only accept a profile shaped like one the game itself sends. */
function cleanProfile(raw: unknown): PlayerProfile | null {
  const p = raw as Partial<PlayerProfile> | null;
  if (!p || typeof p !== 'object') return null;
  if (typeof p.id !== 'string' || !/^[\w-]{1,40}$/.test(p.id) || p.id === 'system') return null;
  const name = cleanName(p.name) || 'Player';
  const color = isHexColor(p.color) ? p.color : '#3B82F6';
  const tokenId = isTokenId(p.tokenId) ? p.tokenId : 'auto-rickshaw';
  return { id: p.id, name, color, tokenId, teamId: isTeamId(p.teamId) ? p.teamId : undefined };
}

export class Room {
  private state: GameState | null = null;
  private hostId: PlayerId = '';
  private clients = new Set<Client>();
  private voice = new Map<PlayerId, VoiceMember>();
  /** Each seat's secret. Never part of the game state, so other players never see it. */
  private seatKeys = new Map<PlayerId, string>();
  /** Players the host removed (their ids and addresses): they can't come back to this room. */
  private banned = new Set<string>();
  /** Until when players' screens are still animating the last move. */
  private busyUntil = 0;
  private lobbyHolds = new Map<PlayerId, unknown>();
  private timers: Record<'bot' | 'clock' | 'auction' | 'broadcast' | 'save' | 'sweep' | 'host', unknown> = {
    bot: null,
    clock: null,
    auction: null,
    broadcast: null,
    save: null,
    sweep: null,
    host: null,
  };

  constructor(
    private code: string,
    private clock: Clock,
    private save: (room: SavedRoom) => void,
    saved?: SavedRoom | null
  ) {
    if (saved?.state) {
      this.state = saved.state;
      this.hostId = saved.hostId;
      // Nobody is connected when a room wakes up; their seats are kept for them
      Object.values(this.state.players).forEach((p) => {
        if (!p.isBot && p.connected) {
          p.connected = false;
          p.disconnectedAt = clock.now();
        }
      });
    }
  }

  get isEmpty() {
    return this.clients.size === 0;
  }

  /** Someone actually created a game here (not just a visit to a code that doesn't exist). */
  get hasGame() {
    return this.state !== null;
  }

  /** The game has got past the lobby. */
  get started() {
    return !!this.state && this.state.phase !== 'LOBBY';
  }

  /* ------------------------------- sockets -------------------------------- */

  connect(socket: Socket, ip?: string) {
    const now = this.clock.now();
    const client: Client = { socket, ip, lastHeard: now, windowStart: now, windowCount: 0, chatTimes: [] };
    this.clients.add(client);
    this.startSweep();
    // Connections that never ask for a seat are closed, so idle ones can't pile up
    this.clock.setTimeout(() => {
      if (!this.clients.has(client) || client.playerId) return;
      this.clients.delete(client);
      try {
        socket.close(4002, 'no join');
      } catch {
        /* already closed */
      }
    }, JOIN_DEADLINE_MS);
  }

  message(socket: Socket, text: string) {
    const client = this.find(socket);
    if (!client) return;
    const now = this.clock.now();
    client.lastHeard = now;
    if (text.length > MAX_MESSAGE_CHARS) return;
    if (now - client.windowStart > RATE_WINDOW_MS) {
      client.windowStart = now;
      client.windowCount = 0;
    }
    if (++client.windowCount > RATE_MAX) return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(text) as ClientMessage;
    } catch {
      return;
    }
    switch (msg?.type) {
      case 'PING':
        this.send(client, { type: 'PONG' });
        return;
      case 'JOIN':
        this.join(client, msg);
        return;
      case 'ACTION':
        this.act(client, msg.action);
        return;
      case 'VOICE':
        this.setVoice(client, msg);
        return;
      default:
        return;
    }
  }

  disconnect(socket: Socket) {
    const client = this.find(socket);
    if (!client) return;
    this.clients.delete(client);
    this.leaveSeat(client.playerId);
    if (this.isEmpty) {
      this.stopTimers();
      this.saveNow();
    }
  }

  private find(socket: Socket) {
    for (const c of this.clients) if (c.socket === socket) return c;
    return undefined;
  }

  private send(client: Client, msg: ServerMessage) {
    try {
      client.socket.send(JSON.stringify(msg));
    } catch {
      /* the close event will clean it up */
    }
  }

  private refuse(client: Client, reason: string) {
    this.send(client, { type: 'REJECTED', reason });
    this.clients.delete(client);
    try {
      client.socket.close(4000, 'rejected');
    } catch {
      /* already closed */
    }
  }

  /** Players with at least one open connection. */
  private livePlayers(except?: Client) {
    const live = new Set<PlayerId>();
    this.clients.forEach((c) => c !== except && c.playerId && live.add(c.playerId));
    return live;
  }

  /* -------------------------------- seats --------------------------------- */

  private join(client: Client, msg: Extract<ClientMessage, { type: 'JOIN' }>) {
    if (client.playerId) return;
    if (msg.version !== PROTOCOL_VERSION) return this.refuse(client, 'Bazaar was just updated. Refresh the page to keep playing.');
    const player = cleanProfile(msg.player);
    if (!player) return this.refuse(client, 'Could not join the room. Please reload and try again.');
    if (this.banned.has(player.id) || (client.ip && this.banned.has(`ip:${client.ip}`))) {
      return this.refuse(client, 'The host removed you from this room.');
    }

    if (!this.state) {
      if (!msg.create) return this.refuse(client, ROOM_NOT_FOUND);
      this.state = gameReducer(createInitialState(player), { type: 'SET_ROOM', roomCode: this.code, isHost: true });
      this.hostId = player.id;
      this.sit(client, player.id, false);
      return;
    }
    // Two hosts can't make the same room code; the creator coming back is fine
    if (msg.create && !this.state.players[player.id]) return this.refuse(client, 'That room code is already in use. Try creating a new room.');

    const live = this.livePlayers(client);
    const seat = chooseSeat(this.state, player, typeof msg.seatHint === 'string' ? msg.seatHint : undefined, live);
    if (seat.kind === 'reject') return this.refuse(client, seat.reason);
    // Taking over a seat whose player is still connected needs that seat's secret, so
    // nobody can knock another player out by copying their id from the game state.
    const expected = this.seatKeys.get(seat.playerId);
    const keyOk = typeof msg.seatKey === 'string' && !!expected && sameSecret(msg.seatKey, expected);
    if (seat.kind === 'existing' && live.has(seat.playerId) && !keyOk) {
      return this.refuse(client, 'That player is already connected to this room. Join with your own name instead.');
    }
    if (seat.kind === 'new') this.apply({ type: 'ADD_PLAYER', profile: player });
    this.sit(client, seat.playerId, seat.kind === 'new');
  }

  private sit(client: Client, playerId: PlayerId, isNew: boolean) {
    // The same seat on an older connection (refresh, new tab or device): the newest wins
    this.clients.forEach((other) => {
      if (other !== client && other.playerId === playerId) {
        other.playerId = undefined;
        this.refuse(other, 'You joined this game from another tab or device, so this one was disconnected.');
      }
    });
    client.playerId = playerId;
    const hold = this.lobbyHolds.get(playerId);
    if (hold) this.clock.clearTimeout(hold);
    this.lobbyHolds.delete(playerId);

    if (!isNew) this.apply({ type: 'SET_PLAYER_CONNECTED', playerId, connected: true });
    // Host's seat gone: hand over now. Host just away (a refresh?): give them a moment first.
    if (!this.state?.players[this.hostId]) this.ensureHost();
    else if (!this.livePlayers().has(this.hostId) && !this.timers.host) {
      this.timers.host = this.clock.setTimeout(() => {
        this.timers.host = null;
        this.ensureHost();
      }, HOST_HANDOVER_MS);
    }

    let seatKey = this.seatKeys.get(playerId);
    if (!seatKey) this.seatKeys.set(playerId, (seatKey = newSeatKey()));
    this.send(client, { type: 'WELCOME', playerId, seatKey });
    this.send(client, { type: 'STATE', state: this.viewFor(playerId), hostId: this.hostId, serverNow: this.clock.now() });
    this.send(client, { type: 'VOICE_ROSTER', members: [...this.voice.values()] });
    this.schedule();
  }

  private leaveSeat(playerId: PlayerId | undefined) {
    if (!playerId || !this.state || this.livePlayers().has(playerId)) return;
    if (this.voice.delete(playerId)) this.publishVoice();
    this.apply({ type: 'SET_PLAYER_CONNECTED', playerId, connected: false });
    if (this.state.phase === 'LOBBY') {
      // Keep the seat for a refresh; free it if they don't come back
      this.lobbyHolds.set(
        playerId,
        this.clock.setTimeout(() => {
          this.lobbyHolds.delete(playerId);
          if (!this.livePlayers().has(playerId) && this.state?.phase === 'LOBBY') {
            this.apply({ type: 'REMOVE_PLAYER', playerId });
            this.seatKeys.delete(playerId);
          }
          this.ensureHost();
        }, LOBBY_SEAT_HOLD_MS)
      );
    }
    if (playerId === this.hostId) {
      this.clock.clearTimeout(this.timers.host);
      this.timers.host = this.clock.setTimeout(() => {
        this.timers.host = null;
        this.ensureHost();
      }, HOST_HANDOVER_MS);
    }
  }

  /** If the host has left, the next connected player in seat order takes over the controls. */
  private ensureHost() {
    if (!this.state) return;
    const live = this.livePlayers();
    if (live.has(this.hostId) && this.state.players[this.hostId]) return;
    const next = this.state.playerOrder.find((id) => live.has(id) && !this.state!.players[id]?.isBot);
    if (next && next !== this.hostId) {
      this.hostId = next;
      this.changed();
    }
  }

  /* ------------------------------- actions -------------------------------- */

  private act(client: Client, action: GameAction) {
    const playerId = client.playerId;
    if (!playerId || !this.state || !action || typeof action !== 'object' || typeof action.type !== 'string') return;
    if (SERVER_ONLY.has(action.type)) return;
    let actor: string;
    try {
      actor = actorOfAction(this.state, action);
    } catch {
      return;
    }
    const allowed = actor === playerId || (playerId === this.hostId && HOST_ACTIONS.has(action.type));
    if (!allowed) return;
    if (action.type === 'SEND_CHAT') {
      const now = this.clock.now();
      client.chatTimes = client.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
      if (client.chatTimes.length >= CHAT_MAX) return;
      client.chatTimes.push(now);
    }

    if (action.type === 'REMOVE_PLAYER') {
      if (action.playerId === this.hostId) return;
      // A removed person stays out: their seat id and network address are blocked for this room
      const removed = this.state.players[action.playerId];
      if (removed && !removed.isBot) {
        this.banned.add(action.playerId);
        this.clients.forEach((c) => c.playerId === action.playerId && c.ip && this.banned.add(`ip:${c.ip}`));
      }
      this.clients.forEach((c) => c.playerId === action.playerId && this.refuse(c, 'The host removed you from the room.'));
      this.seatKeys.delete(action.playerId);
      if (this.voice.delete(action.playerId)) this.publishVoice();
    }
    this.apply(action);
  }

  /** Runs one move through the rules. Returns whether anything changed. */
  private apply(action: GameAction): boolean {
    if (!this.state) return false;
    let next: GameState;
    try {
      next = gameReducer(this.state, action);
    } catch (e) {
      console.warn('Bazaar: move failed', action.type, e);
      return false;
    }
    if (next === this.state) return false;
    this.noteAnimation(this.state, next);
    this.state = next;
    this.changed();
    return true;
  }

  /** Bots shouldn't move while everyone's screen is still showing the last roll. */
  private noteAnimation(before: GameState, after: GameState) {
    const rolled = (after.rollCount ?? 0) !== (before.rollCount ?? 0);
    let steps = 0;
    after.playerOrder.forEach((id) => {
      const a = before.players[id];
      const b = after.players[id];
      if (!a || !b || a.position === b.position) return;
      const forward = (b.position - a.position + 40) % 40;
      if (!b.inJail && forward <= 12) steps = Math.max(steps, forward);
    });
    if (!rolled && !steps) return;
    const busy = (rolled ? DICE_SETTLE_MS : 0) + steps * STEP_MS + ANIMATION_SLACK_MS;
    this.busyUntil = Math.max(this.busyUntil, this.clock.now() + busy);
  }

  private changed() {
    if (!this.timers.broadcast) this.timers.broadcast = this.clock.setTimeout(() => this.broadcast(), BROADCAST_AFTER_MS);
    if (!this.timers.save) this.timers.save = this.clock.setTimeout(() => this.saveNow(), SAVE_AFTER_MS);
    this.runAuctionClock();
    this.schedule();
  }

  /**
   * The game as one player may see it: team-only chat goes to that team alone, so other
   * players can't read it even by looking at what their browser receives.
   */
  private viewFor(playerId: PlayerId): GameState {
    const s = this.state!;
    if (!s.messages.some((m) => m.isTeamOnly)) return s;
    const teamId = s.players[playerId]?.teamId;
    return { ...s, messages: s.messages.filter((m) => !m.isTeamOnly || (!!teamId && m.teamId === teamId)) };
  }

  private broadcast() {
    this.timers.broadcast = null;
    if (!this.state) return;
    const serverNow = this.clock.now();
    // One copy of the message per team (most games: one for everyone)
    const texts = new Map<string, string>();
    this.clients.forEach((c) => {
      if (!c.playerId) return;
      const team = this.state!.players[c.playerId]?.teamId ?? '';
      let text = texts.get(team);
      if (text === undefined) {
        text = JSON.stringify({ type: 'STATE', state: this.viewFor(c.playerId), hostId: this.hostId, serverNow } satisfies ServerMessage);
        texts.set(team, text);
      }
      try {
        c.socket.send(text);
      } catch {
        /* closing */
      }
    });
  }

  private saveNow() {
    this.clock.clearTimeout(this.timers.save);
    this.timers.save = null;
    if (this.state) this.save({ code: this.code, state: this.state, hostId: this.hostId });
  }

  /* ---------------------------- clocks and bots --------------------------- */

  private anyoneHere() {
    return this.livePlayers().size > 0;
  }

  private runAuctionClock() {
    const running = !!this.state?.activeAuction && this.anyoneHere();
    if (!running) {
      this.clock.clearTimeout(this.timers.auction);
      this.timers.auction = null;
      return;
    }
    if (this.timers.auction) return;
    this.timers.auction = this.clock.setTimeout(() => {
      this.timers.auction = null;
      this.apply({ type: 'AUCTION_TICK' });
      this.runAuctionClock();
    }, 1000);
  }

  /** Decides what the room is waiting on and sets a timer for it (bot move, time-out, reconnect wait). */
  private schedule() {
    this.clock.clearTimeout(this.timers.bot);
    this.clock.clearTimeout(this.timers.clock);
    this.timers.bot = this.timers.clock = null;
    const s = this.state;
    if (!s || s.phase !== 'PLAYING' || !this.anyoneHere()) return; // paused while the room is empty

    const now = this.clock.now();
    const settle = Math.max(0, this.busyUntil - now);
    const automated = (id: PlayerId | undefined) => isAutomated(id ? s.players[id] : undefined, now);

    let actorId: PlayerId | undefined;
    let delay = 900;
    const trade = openTrades(s).find((t) => automated(t.targetId));
    if (trade) {
      actorId = trade.targetId;
      delay = 1600;
    } else if (s.activeAuction) {
      const a = s.activeAuction;
      actorId = a.activeBidderIds.find((id) => automated(id) && id !== a.highestBidderId);
      delay = 250 + Math.random() * 600; // under a second, so the auction clock's tick doesn't keep resetting it
    } else {
      const currentId = getCurrentPlayerId(s);
      if (automated(currentId)) actorId = currentId;
    }

    if (actorId) {
      const id = actorId;
      this.timers.bot = this.clock.setTimeout(() => this.botMove(id), settle + delay);
    } else {
      // Waiting on someone who dropped out? Look again when their grace period ends.
      const waits = [getCurrentPlayerId(s), ...openTrades(s).map((t) => t.targetId), ...(s.activeAuction?.activeBidderIds ?? [])]
        .map((id) => reconnectWaitMs(id ? s.players[id] : undefined, now))
        .filter((ms): ms is number => ms !== null && ms > 0);
      if (waits.length) this.timers.bot = this.clock.setTimeout(() => this.schedule(), Math.min(...waits) + 50);
    }

    // The turn timer: a safe move is made for a connected human who lets it run out
    if (s.settings.turnTimeoutSeconds > 0) {
      const decision = decisionOwner(s);
      const p = decision ? s.players[decision.playerId] : undefined;
      if (decision && p && !p.isBot && p.connected) {
        const due = Math.max(s.phaseStartedAt + decisionTimeLimitMs(s, decision.kind), this.busyUntil) - now;
        const { playerId, kind } = decision;
        this.timers.clock = this.clock.setTimeout(() => this.timeUp(playerId, kind), Math.max(0, due));
      }
    }
  }

  private botMove(id: PlayerId) {
    this.timers.bot = null;
    if (!this.state) return;
    const action = getBotNextAction(this.state, id, true);
    // Nothing to do or nothing changed: look again shortly rather than stall
    if (!action || !this.apply(action)) this.timers.bot = this.clock.setTimeout(() => this.schedule(), 2000);
  }

  private timeUp(playerId: PlayerId, kind: DecisionKind) {
    this.timers.clock = null;
    const s = this.state;
    if (!s) return;
    let action: GameAction | null = null;
    if (kind === 'ROLL' || kind === 'DEBT') action = getBotNextAction(s, playerId, true);
    else if (kind === 'BUY') action = { type: 'DECLINE_PROPERTY', tileIndex: s.players[playerId]!.position };
    else if (kind === 'CARD') action = { type: 'DISMISS_CARD' };
    else if (kind === 'END') action = { type: 'END_TURN' };
    if (!action) return;
    if (kind !== 'DEBT') {
      this.apply({
        type: 'SEND_CHAT',
        message: { senderId: 'system', senderName: '⏱ Timer', senderColor: '#94A3B8', text: `${s.players[playerId]?.name} ran out of time.` },
      });
    }
    this.apply(action);
  }

  /* -------------------------------- voice --------------------------------- */

  private setVoice(client: Client, msg: Extract<ClientMessage, { type: 'VOICE' }>) {
    const playerId = client.playerId;
    if (!playerId) return;
    const before = this.voice.get(playerId);
    if (msg.inVoice && typeof msg.peerId === 'string' && /^[\w-]{1,64}$/.test(msg.peerId)) {
      const muted = !!msg.muted;
      if (before && before.peerId === msg.peerId && before.muted === muted) return;
      this.voice.set(playerId, { playerId, peerId: msg.peerId, muted });
    } else if (!this.voice.delete(playerId)) {
      return;
    }
    this.publishVoice();
  }

  private publishVoice() {
    const members = [...this.voice.values()];
    this.clients.forEach((c) => c.playerId && this.send(c, { type: 'VOICE_ROSTER', members }));
  }

  /* ------------------------------- upkeep --------------------------------- */

  /** Drops connections that went silent without closing (phone lost signal, laptop slept). */
  private startSweep() {
    if (this.timers.sweep) return;
    this.timers.sweep = this.clock.setTimeout(() => {
      this.timers.sweep = null;
      const now = this.clock.now();
      [...this.clients].forEach((c) => {
        if (now - c.lastHeard <= SILENCE_MS) return;
        try {
          c.socket.close(4001, 'silent');
        } catch {
          /* already gone */
        }
        this.disconnect(c.socket);
      });
      if (!this.isEmpty) this.startSweep();
    }, SWEEP_EVERY_MS);
  }

  private stopTimers() {
    (['bot', 'clock', 'auction', 'sweep', 'host'] as const).forEach((k) => {
      this.clock.clearTimeout(this.timers[k]);
      this.timers[k] = null;
    });
  }

  /** For tests. */
  snapshot() {
    const timers = Object.fromEntries(Object.entries(this.timers).map(([k, v]) => [k, v != null]));
    return { state: this.state, hostId: this.hostId, voice: [...this.voice.values()], clients: this.clients.size, timers, live: [...this.livePlayers()] };
  }
}
