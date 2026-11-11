import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Building2, Handshake, Settings, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { ChatMessage, GameAction, GameState, PlayerId, PlayerProfile, TokenId, TradeOffer } from './types/game';
import { createInitialState, gameReducer } from './engine/state';
import { getTile, BOARD_SIZE } from './engine/board';
import { getBotNextAction } from './engine/bots';
import {
  canMortgage,
  decisionOwner,
  decisionTimeLimitMs,
  findTrade,
  getCurrentPlayerId,
  isAutomated,
  openTrades,
  ownedTiles,
  reconnectWaitMs,
} from './engine/rules';
import { calculateRent } from './engine/rent';
import { priceOf } from './engine/festivals';
import { net, NetStatus, normalizeRoomCode, warmUpServer } from './net/socket';
import { lastSeatIn, rememberSeat } from './lib/lastSeat';
import { voice, useVoice } from './net/voice';
import { sounds } from './lib/sound';
import { formatINR } from './lib/format';
import { Board } from './components/board/Board';
import { EMOTES, FloatingEmote } from './components/board/CenterBoard';
import { DeedCard } from './components/board/DeedCard';
import { PlayerToken } from './components/board/PlayerToken';
import { PropertyActions } from './components/board/PropertyActions';
import { Brand } from './components/common/Brand';
import { CoverPage } from './components/cover/CoverPage';
import { ConfirmModal, Modal } from './components/common/Modal';
import { Lobby, NetRole } from './components/lobby/Lobby';
import { RoomCard } from './components/sidebar/LeftSidebar';
import { VoiceControl } from './components/sidebar/VoiceControl';
import { RightSidebar } from './components/sidebar/RightSidebar';
import { ChatPanel } from './components/sidebar/ChatPanel';
import { BuyPropertyModal } from './components/modals/BuyPropertyModal';
import { AuctionModal } from './components/modals/AuctionModal';
import { CardModal } from './components/modals/CardModal';
import { TradeModal, TradeOfferModal } from './components/modals/TradeModal';
import { PropertyManagerModal } from './components/modals/PropertyManagerModal';
import { DebtModal } from './components/modals/DebtModal';
import { JailModal } from './components/modals/JailModal';
import { GameOverModal } from './components/modals/GameOverModal';
import { GameSettingsModal } from './components/modals/GameSettingsModal';

const ROLL_ANIMATION_MS = 650;
const STEP_MS = 140;
/** Tokens wait for the dice to land before they start walking. */
const DICE_SETTLE_MS = 800;

/* ---------------------------- local profile ---------------------------- */

function safeGet(storage: 'local' | 'session', key: string): string | null {
  try {
    return (storage === 'local' ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function safeSet(storage: 'local' | 'session', key: string, value: string) {
  try {
    (storage === 'local' ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    /* storage unavailable (private mode etc.) */
  }
}

/** One id per browser tab, so two tabs on one machine can join the same room. */
function getLocalPlayerId(): string {
  const existing = safeGet('session', 'dt_player_id');
  if (existing) return existing;
  const id = `p-${Math.random().toString(36).slice(2, 10)}`;
  safeSet('session', 'dt_player_id', id);
  return id;
}

function loadProfile(id: string): PlayerProfile {
  return {
    id,
    name: safeGet('local', 'richup_player_name')?.trim() || 'Player',
    tokenId: (safeGet('local', 'richup_token_id') as TokenId) || 'auto-rickshaw',
    color: safeGet('local', 'richup_player_color') || '#3B82F6',
    teamId: 'team-1',
  };
}

/* ------------------------------ save / resume ---------------------------- */

const SAVE_KEY = 'bazaar_saved_game';

export interface SavedGame {
  version: 1;
  savedAt: number;
  playerId: string;
  state: GameState;
}

function loadSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedGame;
    if (saved.version !== 1 || saved.state?.phase !== 'PLAYING' || !saved.state.players?.[saved.playerId]) return null;
    return saved;
  } catch {
    return null;
  }
}

function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Keeps ?room=CODE in the address bar in step with the room a guest is in. */
function setRoomInUrl(code: string | null) {
  try {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    window.history.replaceState(null, '', url.toString());
  } catch {
    /* ignore */
  }
}

/** 7 random characters (34 billion possible codes), so rooms can't be found by guessing. */
function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/* ------------------------- token step animation ------------------------ */

function useAnimatedPositions(state: GameState) {
  const [positions, setPositions] = useState<Record<PlayerId, number>>(() =>
    Object.fromEntries(Object.values(state.players).map((p) => [p.id, p.position]))
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastRoll = useRef(state.rollCount ?? 0);

  const animating = state.playerOrder.some((id) => {
    const p = state.players[id];
    return !!p && !p.bankrupt && positions[id] !== undefined && positions[id] !== p.position;
  });

  useEffect(() => {
    if (!animating) return;
    const freshRoll = (stateRef.current.rollCount ?? 0) !== lastRoll.current;
    lastRoll.current = stateRef.current.rollCount ?? 0;
    const t = setTimeout(() => {
      setPositions((prev) => {
        const next = { ...prev };
        const s = stateRef.current;
        for (const id of s.playerOrder) {
          const p = s.players[id];
          if (!p) continue;
          const cur = prev[id];
          if (cur === undefined || cur === p.position) continue;
          const forward = (p.position - cur + BOARD_SIZE) % BOARD_SIZE;
          // Walk short forward moves square by square; teleport jail trips, backwards and long jumps
          next[id] = p.inJail || p.bankrupt || forward > 12 ? p.position : (cur + 1) % BOARD_SIZE;
        }
        return next;
      });
    }, freshRoll ? DICE_SETTLE_MS : STEP_MS);
    return () => clearTimeout(t);
  }, [animating, positions]);

  const display: Record<PlayerId, number> = {};
  state.playerOrder.forEach((id) => {
    const p = state.players[id];
    if (p) display[id] = positions[id] ?? p.position;
  });
  return { positions: display, animating };
}

/* --------------------------------- App --------------------------------- */

export const App: React.FC = () => {
  const [localPlayerId, setLocalPlayerId] = useState(getLocalPlayerId);
  const [savedGame, setSavedGame] = useState<SavedGame | null>(loadSavedGame);
  // Cover page: the first thing you see in a tab (not again on refresh mid-game)
  const [showCover, setShowCover] = useState(() => safeGet('session', 'bazaar_cover_seen') !== '1');
  const [inviteRoom] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? null);
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile(localPlayerId));
  const [state, dispatchLocal] = useReducer(gameReducer, profile, createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const localIdRef = useRef(localPlayerId);
  localIdRef.current = localPlayerId;

  // Networking
  const [role, setRole] = useState<NetRole>('offline');
  const roleRef = useRef(role);
  roleRef.current = role;
  const [roomCode, setRoomCode] = useState('');
  const [netStatus, setNetStatus] = useState<NetStatus>('idle');
  /** Room we're trying to get into (kept after a failure so "Try again" knows where). */
  const [joiningCode, setJoiningCode] = useState<string | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  /** Who has the room's controls (the server can hand them on if the host leaves). */
  const [hostId, setHostId] = useState<PlayerId | null>(null);
  /** The free game server was asleep and is starting up. */
  const [serverWaking, setServerWaking] = useState(false);
  const connected = netStatus === 'connected';
  const connecting = netStatus === 'connecting';

  // UI
  const [hoveredPlayerId, setHoveredPlayerId] = useState<PlayerId | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const rollingRef = useRef(false);
  const [inspectedTile, setInspectedTile] = useState<number | null>(null);
  const [isTradeOpen, setIsTradeOpen] = useState(false);
  const [isPropertyManagerOpen, setIsPropertyManagerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [mobileTab, setMobileTab] = useState<'players' | 'chat'>('players');
  const [emoteOpen, setEmoteOpen] = useState(false);
  /** The incoming deal the local player is currently writing a counter-offer to. */
  const [counterDraft, setCounterDraft] = useState<TradeOffer | null>(null);
  /** Trade whose details are open (anyone can look at any open deal). */
  const [viewTradeId, setViewTradeId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string; text: string; tradeId?: string }[]>([]);
  const [soundOn, setSoundOn] = useState(sounds.enabled);
  const [floatingEmotes, setFloatingEmotes] = useState<FloatingEmote[]>([]);

  const { positions: displayPositions, animating } = useAnimatedPositions(state);

  /** Online, every move goes to the game server, which applies it for everyone; offline, it's applied here. */
  const dispatch = useCallback((action: GameAction) => {
    if (roleRef.current !== 'offline') net.sendAction(action);
    else dispatchLocal(action);
  }, []);

  /* ----------------------------- networking ----------------------------- */

  const resetToOffline = useCallback(() => {
    net.cleanup();
    setRole('offline');
    setRoomCode('');
    setNetStatus('idle');
    setJoiningCode(null);
    setHostId(null);
    dispatchLocal({ type: 'SYNC_STATE', state: createInitialState({ ...profileRef.current, id: localIdRef.current }) });
  }, []);

  // The handlers live on a long-lived singleton, so re-running this effect (StrictMode,
  // hot reload) never tears down a connection that is in use.
  useEffect(() => {
    net.onWelcome = (playerId) => {
      // The server put us back in the seat this device (or this name) had before
      if (playerId === localIdRef.current) return;
      localIdRef.current = playerId;
      setLocalPlayerId(playerId);
      safeSet('session', 'dt_player_id', playerId);
      setProfile((p) => ({ ...p, id: playerId }));
    };

    net.onState = (synced, host) => {
      dispatchLocal({ type: 'SYNC_STATE', state: synced });
      setHostId(host);
      setRole(host === localIdRef.current ? 'host' : 'guest');
    };

    net.onRejected = (reason) => {
      setRoomInUrl(null);
      setNetError(reason);
      setRole('offline');
      setRoomCode('');
      setJoiningCode(null);
      setHostId(null);
      dispatchLocal({ type: 'SYNC_STATE', state: createInitialState({ ...profileRef.current, id: localIdRef.current }) });
    };

    net.onWaking = () => setServerWaking(true);

    net.onStatus = (status, message) => {
      setNetStatus(status);
      if (status !== 'connecting') setServerWaking(false);
      if (message) setNetError(message);
      else if (status === 'connected') setNetError(null);
    };
  }, []);

  // The free game server sleeps when idle: start waking it as soon as someone opens the
  // site (it's usually up by the time they press Create or Join), and keep it awake
  // while the page is open and visible.
  useEffect(() => {
    warmUpServer();
    const id = setInterval(() => document.visibilityState === 'visible' && warmUpServer(), 30_000);
    return () => clearInterval(id);
  }, []);

  // Phones freeze background tabs and drop Wi-Fi: check the link as soon as we're back
  useEffect(() => {
    const wake = () => document.visibilityState === 'visible' && net.reconnectNow();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('pageshow', wake);
    };
  }, []);

  const createRoom = () => {
    const code = makeRoomCode();
    setNetError(null);
    setJoiningCode(null);
    net.createRoom(code, { ...profileRef.current, id: localIdRef.current }, {
      onJoined: () => {
        setRoomCode(code);
        // A refresh brings the host straight back into their room
        setRoomInUrl(code);
      },
      onError: (err) => setNetError(err),
    });
  };

  const joinRoom = useCallback((input: string) => {
    const code = normalizeRoomCode(input);
    if (!code) return;
    setNetError(null);
    setJoiningCode(code);
    const me = { ...profileRef.current, id: localIdRef.current };
    const hint = lastSeatIn(code);
    net.joinRoom(code, me, {
      seatHint: hint && hint !== me.id ? hint : undefined,
      onJoined: () => {
        setRoomCode(code);
        setJoiningCode(null);
        // So a refresh (or the browser restoring the tab) rejoins this room
        setRoomInUrl(code);
      },
      onError: (err) => setNetError(err),
    });
  }, []);

  // Auto-join from an invite link (?room=CODE) — once, even under StrictMode
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current) return;
    autoJoined.current = true;
    const code = new URLSearchParams(window.location.search).get('room');
    if (code) joinRoom(code);
  }, [joinRoom]);

  /* --------------------------------- voice -------------------------------- */

  const voiceState = useVoice();
  // Leaving the room (or being turned away) always ends the call and releases the mic
  useEffect(() => {
    if (role === 'offline') voice.leave();
  }, [role]);

  const voiceErrorId = voiceState.error?.id;
  useEffect(() => {
    const error = voice.getSnapshot().error;
    if (!error) return;
    const id = `voice-${error.id}`;
    setToasts((all) => [...all.filter((x) => x.id !== id), { id, text: error.message }].slice(-3));
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 7000);
  }, [voiceErrorId]);

  // M mutes from anywhere, even with a pop-up open (but not while typing)
  const inVoice = voiceState.status === 'on';
  useEffect(() => {
    if (!inVoice) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'm' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      voice.toggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inVoice]);

  // Remember our seat so a new tab on this device can sit back down in it
  const seated = role !== 'offline' && connected && !!state.players[localPlayerId];
  useEffect(() => {
    if (seated && roomCode) rememberSeat(roomCode, localPlayerId);
  }, [seated, roomCode, localPlayerId]);

  const leaveRoom = () => {
    setRoomInUrl(null);
    setNetError(null);
    resetToOffline();
  };

  /* ------------------------------- profile ------------------------------ */

  // If the host had to give us a different colour or name (ours was taken), show that one
  const myServerColor = state.players[localPlayerId]?.color;
  useEffect(() => {
    if (myServerColor && myServerColor !== profile.color) setProfile((p) => ({ ...p, color: myServerColor }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myServerColor]);
  const lastNameEdit = useRef(0);
  const myServerName = state.players[localPlayerId]?.name;
  useEffect(() => {
    // While typing, the host's echo lags a keystroke behind; don't fight the input
    if (!myServerName || Date.now() - lastNameEdit.current < 2000) return;
    setProfile((p) => (p.name === myServerName ? p : { ...p, name: myServerName }));
  }, [myServerName]);

  const updateProfile = (next: PlayerProfile) => {
    if (next.name !== profile.name) lastNameEdit.current = Date.now();
    setProfile(next);
    safeSet('local', 'richup_player_name', next.name);
    safeSet('local', 'richup_token_id', next.tokenId);
    safeSet('local', 'richup_player_color', next.color);
    dispatch({ type: 'UPDATE_PLAYER', profile: next });
  };

  /* ------------------------------ dice roll ----------------------------- */

  const rollTimer = useRef<ReturnType<typeof setTimeout>>();
  const runRoll = useCallback(() => {
    if (rollingRef.current) return;
    rollingRef.current = true;
    setIsRolling(true);
    sounds.playDiceRoll();
    rollTimer.current = setTimeout(() => {
      rollingRef.current = false;
      setIsRolling(false);
      dispatch({ type: 'ROLL_DICE' });
    }, ROLL_ANIMATION_MS);
  }, [dispatch]);
  useEffect(() => () => clearTimeout(rollTimer.current), []);

  /* ------------------------ host-side timers & bots ---------------------- */

  const auctionActive = !!state.activeAuction;
  useEffect(() => {
    if (!auctionActive || role !== 'offline') return;
    const id = setInterval(() => dispatchLocal({ type: 'AUCTION_TICK' }), 1000);
    return () => clearInterval(id);
  }, [auctionActive, role]);

  /** Bumped when a disconnected player's grace period runs out, so autopilot looks again. */
  const [graceTick, setGraceTick] = useState(0);
  useEffect(() => {
    if (role !== 'offline' || state.phase !== 'PLAYING' || animating || isRolling) return;
    const now = Date.now();
    const automated = (id: PlayerId | undefined) => isAutomated(id ? state.players[id] : undefined, now);

    let actorId: PlayerId | undefined;
    let delay = 900;
    const trade = openTrades(state).find((t) => automated(t.targetId));
    if (trade) {
      actorId = trade.targetId;
      delay = 1600;
    } else if (state.activeAuction) {
      const a = state.activeAuction;
      actorId = a.activeBidderIds.find((id) => automated(id) && id !== a.highestBidderId);
      delay = 600 + Math.random() * 900;
    } else {
      const currentId = getCurrentPlayerId(state);
      if (automated(currentId)) actorId = currentId;
    }
    if (!actorId) {
      // Waiting on someone who dropped out? Look again when their grace period ends.
      const waits = [getCurrentPlayerId(state), ...openTrades(state).map((t) => t.targetId), ...(state.activeAuction?.activeBidderIds ?? [])]
        .map((id) => reconnectWaitMs(id ? state.players[id] : undefined, now))
        .filter((ms): ms is number => ms !== null && ms > 0);
      if (!waits.length) return;
      const t = setTimeout(() => setGraceTick((n) => n + 1), Math.min(...waits) + 50);
      return () => clearTimeout(t);
    }

    const id = actorId;
    const t = setTimeout(() => {
      const action = getBotNextAction(state, id, true);
      if (!action) return;
      if (action.type === 'ROLL_DICE') runRoll();
      else dispatchLocal(action);
    }, delay);
    return () => clearTimeout(t);
  }, [state, role, animating, isRolling, runRoll, graceTick]);

  /* ----------------------------- turn timer ----------------------------- */

  const timerOn = state.settings.turnTimeoutSeconds > 0 && state.phase === 'PLAYING';
  const someoneOffline =
    state.phase === 'PLAYING' &&
    state.playerOrder.some((id) => {
      const p = state.players[id];
      return !!p && !p.isBot && !p.connected && !p.bankrupt;
    });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timerOn && !someoneOffline) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [timerOn, someoneOffline]);

  const decision = decisionOwner(state);
  const decisionPlayer = decision ? state.players[decision.playerId] : undefined;
  const timedDecision = timerOn && !!decision && !!decisionPlayer && !decisionPlayer.isBot && decisionPlayer.connected;
  /** Online countdowns use the server's clock, so everyone sees the same time left. */
  const clockOffset = role !== 'offline' ? net.clockOffset : 0;
  const msLeft = timedDecision ? state.phaseStartedAt + decisionTimeLimitMs(state, decision!.kind) - (now + clockOffset) : null;

  // The host plays a default move for humans who let the clock run out.
  useEffect(() => {
    if (role !== 'offline' || !timedDecision || !decision || animating || isRolling) return;
    const due = state.phaseStartedAt + decisionTimeLimitMs(state, decision.kind) - Date.now();
    const { playerId, kind } = decision;
    const t = setTimeout(() => {
      const s = stateRef.current;
      let action: GameAction | null = null;
      if (kind === 'ROLL') action = getBotNextAction(s, playerId, true);
      else if (kind === 'BUY') action = { type: 'DECLINE_PROPERTY', tileIndex: s.players[playerId]!.position };
      else if (kind === 'CARD') action = { type: 'DISMISS_CARD' };
      else if (kind === 'DEBT') action = getBotNextAction(s, playerId, true);
      else if (kind === 'END') action = { type: 'END_TURN' };
      if (!action) return;
      if (kind !== 'DEBT') {
        dispatchLocal({
          type: 'SEND_CHAT',
          message: { senderId: 'system', senderName: '⏱ Timer', senderColor: '#94A3B8', text: `${s.players[playerId]?.name} ran out of time.` },
        });
      }
      if (action.type === 'ROLL_DICE') runRoll();
      else dispatchLocal(action);
    }, Math.max(0, due));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, role, timedDecision, animating, isRolling, runRoll]);

  /* ---------------------------- save / resume ---------------------------- */

  useEffect(() => {
    if (role !== 'offline') return;
    if (state.phase === 'GAME_OVER') {
      clearSavedGame();
      return;
    }
    if (state.phase !== 'PLAYING') return;
    const t = setTimeout(() => {
      safeSet('local', SAVE_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), playerId: localPlayerId, state } satisfies SavedGame));
    }, 400);
    return () => clearTimeout(t);
  }, [state, role, localPlayerId]);

  const resumeSavedGame = () => {
    if (!savedGame) return;
    setLocalPlayerId(savedGame.playerId);
    safeSet('session', 'dt_player_id', savedGame.playerId);
    // Restart the clock for whoever was deciding when the game was saved
    dispatchLocal({ type: 'SYNC_STATE', state: { ...savedGame.state, phaseStartedAt: Date.now() } });
    setSavedGame(null);
  };
  const discardSavedGame = () => {
    clearSavedGame();
    setSavedGame(null);
  };

  /* ---------------------- sounds & reactions from events ----------------- */

  const lastLogId = useRef<string | null>(state.logs[0]?.id ?? null);
  useEffect(() => {
    const fresh = [];
    for (const log of state.logs) {
      if (log.id === lastLogId.current) break;
      fresh.push(log);
    }
    lastLogId.current = state.logs[0]?.id ?? null;
    if (!fresh.length || fresh.length > 15) return;

    const types = new Set(fresh.map((l) => l.type));
    if (fresh.some((l) => /this round only/.test(l.message))) sounds.playVictory();
    else if (types.has('BANKRUPT')) sounds.playRent();
    else if (types.has('JAIL') && fresh.some((l) => /sent to|custody|straight to/i.test(l.message))) sounds.playJail();
    else if (types.has('RENT') && fresh.some((l) => /paid/.test(l.message))) sounds.playRent();
    else if (types.has('AUCTION') && fresh.some((l) => /won/.test(l.message))) sounds.playAuctionGavel();
    else if (types.has('BUY') || types.has('TRADE')) sounds.playCash();
    else if (types.has('CARD')) sounds.playCard();
    else if (role !== 'offline' && fresh.some((l) => l.type === 'ROLL' && l.playerId !== localPlayerId)) sounds.playDiceRoll();
  }, [state.logs, role, localPlayerId]);

  const lastMsgId = useRef<string | null>(state.messages[state.messages.length - 1]?.id ?? null);
  useEffect(() => {
    const msgs = state.messages;
    const startIdx = lastMsgId.current ? msgs.findIndex((m) => m.id === lastMsgId.current) + 1 : 0;
    lastMsgId.current = msgs[msgs.length - 1]?.id ?? null;
    const fresh = msgs.slice(startIdx).filter((m) => EMOTES.includes(m.text));
    if (!fresh.length || fresh.length > 10) return;
    const added = fresh.map((m) => ({ id: m.id, emoji: m.text, x: 15 + Math.random() * 70 }));
    setFloatingEmotes((prev) => [...prev, ...added]);
    const ids = new Set(added.map((a) => a.id));
    setTimeout(() => setFloatingEmotes((prev) => prev.filter((e) => !ids.has(e.id))), 1900);
  }, [state.messages]);

  // Announce offers addressed to me without interrupting anything
  const seenTrades = useRef<Set<string> | null>(null);
  useEffect(() => {
    const mineNow = openTrades(state).filter((t) => t.targetId === localPlayerId);
    if (seenTrades.current === null) {
      seenTrades.current = new Set(mineNow.map((t) => t.id));
      return;
    }
    const fresh = mineNow.filter((t) => !seenTrades.current!.has(t.id));
    fresh.forEach((t) => seenTrades.current!.add(t.id));
    if (!fresh.length) return;
    sounds.playCard();
    const added = fresh.map((t) => ({
      id: t.id,
      tradeId: t.id,
      text: `${state.players[t.proposerId]?.name ?? 'Someone'} ${t.counterCount ? 'countered your offer' : 'sent you a trade offer'}.`,
    }));
    setToasts((all) => [...all, ...added].slice(-3));
    const ids = new Set(added.map((a) => a.id));
    setTimeout(() => setToasts((all) => all.filter((x) => !ids.has(x.id))), 7000);
  }, [state.trades, localPlayerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close panels that no longer make sense
  useEffect(() => {
    if (state.phase !== 'PLAYING') {
      setIsTradeOpen(false);
      setIsPropertyManagerOpen(false);
      setConfirmForfeit(false);
    }
  }, [state.phase]);

  /* ------------------------------ derived ------------------------------- */

  const me = state.players[localPlayerId];
  const currentId = getCurrentPlayerId(state);
  const current = currentId ? state.players[currentId] : undefined;
  const isMyTurn = !!me && !me.bankrupt && currentId === localPlayerId && state.phase === 'PLAYING';
  const settled = !animating && !isRolling;
  const waitingOnMe = openTrades(state).filter((t) => t.targetId === localPlayerId).length;
  const viewedTrade = viewTradeId ? findTrade(state, viewTradeId) : undefined;
  const counterBase = counterDraft ? findTrade(state, counterDraft.id) : undefined;
  const connectedHumans = state.playerOrder.filter((id) => !state.players[id]?.isBot && state.players[id]?.connected).length;
  const canEditRules = role !== 'guest' && state.phase === 'LOBBY';
  const currentWaitMs = state.phase === 'PLAYING' ? reconnectWaitMs(current, Math.max(now, Date.now()) + clockOffset) : null;
  const reconnectWait = current && currentWaitMs ? { name: current.name, secondsLeft: Math.ceil(currentWaitMs / 1000) } : undefined;

  const toggleSound = () => setSoundOn(sounds.toggleSound());
  const sendEmote = (emoji: string) => {
    if (!me) return;
    dispatch({
      type: 'SEND_CHAT',
      message: { senderId: me.id, senderName: me.name, senderColor: me.color, teamId: me.teamId, isTeamOnly: false, text: emoji },
    });
  };
  const sendChat = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => dispatch({ type: 'SEND_CHAT', message: msg });

  /** What the local player would owe if they landed on this tile right now. */
  const rentHintFor = (idx: number): string | undefined => {
    const ownerId = state.tiles[idx]?.ownerId;
    if (!me || me.bankrupt || !ownerId || state.phase !== 'PLAYING') return undefined;
    if (ownerId === me.id) {
      const asOwner = state.playerOrder.find((id) => id !== me.id && !state.players[id]?.bankrupt);
      if (!asOwner) return undefined;
      const r = calculateRent(state, idx, asOwner, 7);
      if (getTile(idx).type === 'utility') return `Visitors pay ${r.rent / 7}× their dice roll`;
      return r.rent > 0 ? `Visitors pay you ${formatINR(r.rent)} here` : `No rent right now: ${r.reason}`;
    }
    const r = calculateRent(state, idx, me.id, 7);
    if (r.isTeammate) return 'Your teammate owns this — you pay no rent';
    if (getTile(idx).type === 'utility' && r.rent > 0) return `You'd pay ${r.rent / 7}× your dice roll here`;
    return r.rent > 0 ? `You'd pay ${formatINR(r.rent)} if you land here` : `No rent right now: ${r.reason}`;
  };

  const inspectTile = (idx: number) => {
    if (getTile(idx).price && getTile(idx).type !== 'tax') setInspectedTile(idx);
  };

  const sidebarProps = {
    state,
    localPlayerId,
    hoveredPlayerId,
    onHoverPlayer: setHoveredPlayerId,
    onOpenTrade: () => setIsTradeOpen(true),
    onOpenPropertyManager: () => setIsPropertyManagerOpen(true),
    onSelectProperty: setInspectedTile,
    onForfeit: () => setConfirmForfeit(true),
    onCancelTrade: (tradeId: string) => dispatch({ type: 'CANCEL_TRADE', tradeId }),
    onOpenTradeDetails: (tradeId: string) => setViewTradeId(tradeId),
    onAcceptTrade: (tradeId: string) => dispatch({ type: 'ACCEPT_TRADE', tradeId }),
    onRejectTrade: (tradeId: string) => dispatch({ type: 'REJECT_TRADE', tradeId }),
    onCounterTrade: (trade: TradeOffer) => setCounterDraft(trade),
  };

  const chat = (className: string) => (
    <ChatPanel messages={state.messages} me={me} isTeamMode={state.settings.mode === 'TEAMS'} onSendMessage={sendChat} className={className} />
  );

  /* ------------------------------- render ------------------------------- */

  const iconButtons = (
    <div className="flex items-center">
      <button type="button" className="icon-btn" onClick={toggleSound} aria-label={soundOn ? 'Mute sounds' : 'Unmute sounds'}>
        {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
      <button type="button" className="icon-btn" onClick={() => setIsSettingsOpen(true)} aria-label="Game settings">
        <Settings size={18} />
      </button>
    </div>
  );

  const tabBar = <T extends string>(tabs: readonly (readonly [T, string])[], value: T, onChange: (t: T) => void) => (
    <div className="panel flex gap-1 p-1" role="tablist">
      {tabs.map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          onClick={() => onChange(tab)}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
            value === tab ? 'bg-white/10 text-white shadow-inner' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const canRollNow = isMyTurn && state.turnPhase === 'ROLL' && settled;
  const canEndNow = isMyTurn && state.turnPhase === 'TURN_END' && settled;
  const doublesAgain = canEndNow && !!me && !me.inJail && state.dice[0] === state.dice[1] && state.consecutiveDoubles > 0;

  return (
    <div className="app-bg min-h-[100dvh] text-slate-100">
      {role !== 'offline' && netStatus === 'reconnecting' && (
        <div
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-ink-950"
          role="status"
        >
          <WifiOff size={16} /> Connection dropped. Getting you back in…
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-950/30 border-t-ink-950" aria-hidden="true" />
        </div>
      )}
      {role !== 'offline' && netStatus === 'disconnected' && (
        <div className="fixed inset-x-0 top-0 z-[60] flex flex-wrap items-center justify-center gap-3 bg-rose-600 px-4 py-2 text-sm font-medium text-white">
          <WifiOff size={16} /> Lost connection to the host.
          <button type="button" className="btn btn-sm bg-white text-rose-700 hover:bg-rose-50" onClick={() => net.reconnectNow()}>
            Try again
          </button>
          <button type="button" className="btn btn-sm bg-white/20 text-white hover:bg-white/30" onClick={leaveRoom}>
            Leave
          </button>
        </div>
      )}

      {state.phase === 'LOBBY' ? (
        <Lobby
          state={state}
          localPlayerId={localPlayerId}
          profile={profile}
          role={role}
          roomCode={roomCode}
          connected={connected}
          connecting={connecting}
          joiningCode={joiningCode}
          serverWaking={serverWaking}
          hostId={hostId}
          netError={netError}
          onUpdateProfile={updateProfile}
          onAddBot={(difficulty) => dispatch({ type: 'ADD_BOT', difficulty })}
          onRemovePlayer={(playerId) => {
            dispatch({ type: 'REMOVE_PLAYER', playerId });
          }}
          onSetPlayerTeam={(playerId, teamId) => dispatch({ type: 'SET_PLAYER_TEAM', playerId, teamId })}
          onUpdateSettings={(settings) => dispatch({ type: 'UPDATE_SETTINGS', settings })}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onStartGame={() => dispatch({ type: 'START_GAME' })}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          onLeaveRoom={leaveRoom}
          savedGame={role === 'offline' && savedGame ? { round: savedGame.state.round ?? 1, savedAt: savedGame.savedAt, players: savedGame.state.playerOrder.map((id) => savedGame.state.players[id]!).filter(Boolean) } : null}
          onResumeSaved={resumeSavedGame}
          onDiscardSaved={discardSavedGame}
        />
      ) : (
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 p-2 pb-28 sm:p-3 sm:pb-28 lg:h-[100dvh] lg:flex-row lg:gap-4 lg:p-4">
          {/* Desktop: left column */}
          <aside className="hidden w-[280px] shrink-0 flex-col gap-3 xl:flex 2xl:w-[300px]">
            <div className="flex items-center justify-between px-1 pt-1">
              <Brand size="md" />
              {iconButtons}
            </div>
            <RoomCard roomCode={roomCode} role={role} connected={connected} connectedCount={connectedHumans} />
            {role !== 'offline' && <VoiceControl state={state} localPlayerId={localPlayerId} />}
            {chat('min-h-0 flex-1')}
          </aside>

          {/* Centre: header (below desktop) + board */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <header className="panel flex items-center justify-between gap-2 px-3 py-2 xl:hidden">
              <div className="max-[359px]:hidden">
                <Brand size="sm" />
              </div>
              {me && !me.bankrupt && (
                <span className="rounded-full bg-black/30 px-3 py-1 text-sm font-bold tabular-nums text-emerald-300 ring-1 ring-white/10">
                  {formatINR(me.cash)}
                </span>
              )}
              <div className="flex items-center">
                {role !== 'offline' && (
                  <div className="lg:hidden">
                    <VoiceControl state={state} localPlayerId={localPlayerId} variant="compact" />
                  </div>
                )}
                {iconButtons}
              </div>
            </header>
            <main className="board-wrap flex min-h-0 flex-1 items-center justify-center">
              <Board
                state={state}
                localPlayerId={localPlayerId}
                hoveredPlayerId={hoveredPlayerId}
                displayPositions={displayPositions}
                isRolling={isRolling}
                isAnimating={animating}
                floatingEmotes={floatingEmotes}
                msLeft={msLeft}
                timerFor={decision && decision.playerId !== currentId ? decisionPlayer?.name : undefined}
                reconnectWait={reconnectWait}
                onSkipReconnectWait={role === 'host' && currentId ? () => dispatch({ type: 'SKIP_RECONNECT_WAIT', playerId: currentId }) : undefined}
                onTileClick={inspectTile}
                onRoll={runRoll}
                onEndTurn={() => dispatch({ type: 'END_TURN' })}
                onOpenTrade={() => setIsTradeOpen(true)}
                onOpenPropertyManager={() => setIsPropertyManagerOpen(true)}
                onSendEmote={sendEmote}
              />
            </main>
          </div>

          {/* Laptop and desktop: right column */}
          <aside className="hidden w-[330px] shrink-0 flex-col gap-3 overflow-y-auto pr-0.5 lg:flex 2xl:w-[350px]">
            <RightSidebar {...sidebarProps} />
            {role !== 'offline' && (
              <div className="xl:hidden">
                <VoiceControl state={state} localPlayerId={localPlayerId} />
              </div>
            )}
            {/* Activity lives on the board now; laptops keep chat here */}
            {chat('min-h-[300px] flex-1 xl:hidden')}
          </aside>

          {/* Phones and tablets: tabs under the board */}
          <section className="mx-auto w-full max-w-2xl space-y-2 lg:hidden">
            {tabBar([['players', 'Players'], ['chat', 'Chat']] as const, mobileTab, setMobileTab)}
            {mobileTab === 'players' && (
              <div className="space-y-3">
                <RightSidebar {...sidebarProps} />
                {role !== 'offline' && <VoiceControl state={state} localPlayerId={localPlayerId} />}
                {role !== 'offline' && <RoomCard roomCode={roomCode} role={role} connected={connected} connectedCount={connectedHumans} />}
              </div>
            )}
            {mobileTab === 'chat' && chat('h-[380px]')}
          </section>
        </div>
      )}

      {/* Phones and tablets: thumb-friendly action bar */}
      {state.phase === 'PLAYING' && me && !me.bankrupt && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/80 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-xl lg:hidden">
          {emoteOpen && (
            <div className="mx-auto mb-2 flex max-w-xl justify-center gap-1 rounded-2xl bg-white/5 p-1.5 ring-1 ring-white/10">
              {EMOTES.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="rounded-xl p-1.5 text-2xl leading-none transition active:scale-90"
                  onClick={() => {
                    sendEmote(e);
                    setEmoteOpen(false);
                  }}
                  aria-label={`React with ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <div className="min-w-0 flex-1">
              <div
                className={`flex h-12 items-center gap-2 rounded-2xl px-3 ring-1 ${
                  isMyTurn ? 'bg-amber-400/10 ring-amber-300/40' : 'bg-white/[0.04] ring-white/10'
                }`}
              >
                {current && <PlayerToken tokenId={current.tokenId} color={current.color} name={current.name} size="xs" />}
                <span className="truncate text-sm font-medium text-slate-200">
                  {isMyTurn
                    ? animating || isRolling
                      ? 'Moving…'
                      : canRollNow
                        ? 'Your turn — roll the dice ↑'
                        : canEndNow
                          ? doublesAgain
                            ? 'Doubles! Roll again ↑'
                            : 'Done? End your turn ↑'
                          : 'Your move…'
                    : `${current?.name ?? 'Someone'} is playing…`}
                </span>
                {msLeft !== null && (
                  <span className={`ml-auto rounded-full px-2 text-xs font-bold tabular-nums ${msLeft < 10000 ? 'bg-rose-500 text-white' : 'bg-white/10'}`}>
                    {Math.max(0, Math.ceil(msLeft / 1000))}s
                  </span>
                )}
              </div>
            </div>
            <button type="button" className="btn btn-secondary h-12 w-12 shrink-0 p-0" onClick={() => setIsPropertyManagerOpen(true)} aria-label="Build and mortgage">
              <Building2 size={18} />
            </button>
            <button
              type="button"
              className="btn btn-secondary relative h-12 w-12 shrink-0 p-0"
              onClick={() => {
                if (waitingOnMe > 0) {
                  setMobileTab('players');
                  document.getElementById('trade-board')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else setIsTradeOpen(true);
              }}
              aria-label={waitingOnMe > 0 ? `${waitingOnMe} trade offers waiting for you` : 'Trade'}
            >
              <Handshake size={18} />
              {waitingOnMe > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-ink-950">
                  {waitingOnMe}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`btn h-12 w-12 shrink-0 p-0 text-xl ${emoteOpen ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setEmoteOpen(!emoteOpen)}
              aria-label="Send a reaction"
              aria-expanded={emoteOpen}
            >
              😀
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ dialogs ----------------------------- */}

      {inspectedTile !== null && (
        <Modal size="sm" onClose={() => setInspectedTile(null)} className="!max-w-[320px] items-center bg-transparent !border-0 shadow-none">
          <div className="flex flex-col items-center gap-3 p-1">
            <DeedCard
              tile={getTile(inspectedTile)}
              tileState={state.tiles[inspectedTile]}
              owner={state.tiles[inspectedTile]?.ownerId ? state.players[state.tiles[inspectedTile]!.ownerId!] : null}
              doubleRentOnSet={state.settings.doubleRentOnSet}
              rentHint={rentHintFor(inspectedTile)}
              salePrice={!state.tiles[inspectedTile]?.ownerId ? priceOf(state, inspectedTile) : undefined}
            />
            <PropertyActions
              state={state}
              playerId={localPlayerId}
              tileIndex={inspectedTile}
              onBuild={() => dispatch({ type: 'BUILD_HOUSE', playerId: localPlayerId, tileIndex: inspectedTile })}
              onSell={() => dispatch({ type: 'SELL_HOUSE', playerId: localPlayerId, tileIndex: inspectedTile })}
              onMortgage={() => dispatch({ type: 'MORTGAGE_PROPERTY', playerId: localPlayerId, tileIndex: inspectedTile })}
              onUnmortgage={() => dispatch({ type: 'UNMORTGAGE_PROPERTY', playerId: localPlayerId, tileIndex: inspectedTile })}
            />
            <button type="button" className="btn btn-secondary" onClick={() => setInspectedTile(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}

      {isPropertyManagerOpen && state.phase === 'PLAYING' && (
        <PropertyManagerModal
          state={state}
          localPlayerId={localPlayerId}
          onClose={() => setIsPropertyManagerOpen(false)}
          onBuildHouse={(tileIndex) => dispatch({ type: 'BUILD_HOUSE', playerId: localPlayerId, tileIndex })}
          onSellHouse={(tileIndex) => dispatch({ type: 'SELL_HOUSE', playerId: localPlayerId, tileIndex })}
          onMortgage={(tileIndex) => dispatch({ type: 'MORTGAGE_PROPERTY', playerId: localPlayerId, tileIndex })}
          onUnmortgage={(tileIndex) => dispatch({ type: 'UNMORTGAGE_PROPERTY', playerId: localPlayerId, tileIndex })}
        />
      )}

      {isMyTurn && settled && state.turnPhase === 'AWAIT_BUY' && me && (
        <BuyPropertyModal
          tile={getTile(me.position)}
          price={priceOf(state, me.position)}
          player={me}
          auctionOnDecline={state.settings.auctionOnDecline}
          doubleRentOnSet={state.settings.doubleRentOnSet}
          mortgageable={ownedTiles(state, localPlayerId).filter((idx) => canMortgage(state, localPlayerId, idx))}
          onMortgage={(tileIndex) => dispatch({ type: 'MORTGAGE_PROPERTY', playerId: localPlayerId, tileIndex })}
          onBuy={() => dispatch({ type: 'BUY_PROPERTY', tileIndex: me.position })}
          onDecline={() => dispatch({ type: 'DECLINE_PROPERTY', tileIndex: me.position })}
        />
      )}

      {isMyTurn && settled && state.turnPhase === 'CARD_DRAWN' && state.activeCard && (
        <CardModal
          card={state.activeCard.card}
          deck={state.activeCard.deck}
          canDismiss
          onDismiss={() => dispatch({ type: 'DISMISS_CARD' })}
        />
      )}

      {isMyTurn && settled && state.turnPhase === 'ROLL' && me?.inJail && (
        <JailModal
          player={me}
          onPayFine={() => dispatch({ type: 'PAY_JAIL_FINE', playerId: localPlayerId })}
          onUseCard={() => dispatch({ type: 'USE_JAIL_CARD', playerId: localPlayerId })}
          onRollDoubles={runRoll}
        />
      )}

      {isMyTurn && settled && state.turnPhase === 'DEBT' && (
        <DebtModal
          state={state}
          localPlayerId={localPlayerId}
          onResolveDebt={() => dispatch({ type: 'RESOLVE_DEBT', playerId: localPlayerId })}
          onDeclareBankruptcy={() => dispatch({ type: 'DECLARE_BANKRUPTCY', playerId: localPlayerId })}
          onMortgage={(tileIndex) => dispatch({ type: 'MORTGAGE_PROPERTY', playerId: localPlayerId, tileIndex })}
          onSellHouse={(tileIndex) => dispatch({ type: 'SELL_HOUSE', playerId: localPlayerId, tileIndex })}
          onOpenTrade={() => setIsTradeOpen(true)}
        />
      )}

      {state.activeAuction && state.phase === 'PLAYING' && (
        <AuctionModal
          auction={state.activeAuction}
          state={state}
          localPlayerId={localPlayerId}
          onBid={(amount) => dispatch({ type: 'AUCTION_BID', playerId: localPlayerId, amount })}
          onPass={() => dispatch({ type: 'AUCTION_PASS', playerId: localPlayerId })}
        />
      )}

      {isTradeOpen && state.phase === 'PLAYING' && me && !me.bankrupt && (
        <TradeModal
          state={state}
          localPlayerId={localPlayerId}
          onClose={() => setIsTradeOpen(false)}
          onPropose={(offer) => {
            dispatch({ type: 'PROPOSE_TRADE', offer });
            setIsTradeOpen(false);
          }}
        />
      )}

      {viewedTrade && !counterBase && state.phase === 'PLAYING' && (
        <TradeOfferModal
          state={state}
          trade={viewedTrade}
          viewerId={localPlayerId}
          onClose={() => setViewTradeId(null)}
          onAccept={() => {
            dispatch({ type: 'ACCEPT_TRADE', tradeId: viewedTrade.id });
            setViewTradeId(null);
          }}
          onReject={() => {
            dispatch({ type: 'REJECT_TRADE', tradeId: viewedTrade.id });
            setViewTradeId(null);
          }}
          onCounter={() => {
            setCounterDraft(viewedTrade);
            setViewTradeId(null);
          }}
          onWithdraw={() => {
            dispatch({ type: 'CANCEL_TRADE', tradeId: viewedTrade.id });
            setViewTradeId(null);
          }}
        />
      )}

      {counterBase && counterBase.targetId === localPlayerId && state.phase === 'PLAYING' && (
        <TradeModal
          key={counterBase.id}
          state={state}
          localPlayerId={localPlayerId}
          counterTo={counterBase}
          onClose={() => setCounterDraft(null)}
          onPropose={(offer) => {
            dispatch({ type: 'COUNTER_TRADE', tradeId: counterBase.id, offer });
            setCounterDraft(null);
          }}
        />
      )}

      {/* Non-blocking notifications */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[55] flex flex-col items-center gap-2 px-3 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="panel pointer-events-auto flex w-full max-w-sm items-center gap-3 border-amber-300/40 px-3 py-2.5 text-[13px] shadow-2xl animate-pop-in"
          >
            <span className="text-lg">{t.tradeId ? '🤝' : '🎙️'}</span>
            <span className="min-w-0 flex-1 text-slate-100">{t.text}</span>
            {t.tradeId && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setViewTradeId(t.tradeId!);
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                View
              </button>
            )}
            <button type="button" className="icon-btn h-7 w-7" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {isSettingsOpen && (
        <GameSettingsModal
          settings={state.settings}
          readOnly={!canEditRules}
          onUpdateSettings={(settings) => dispatch({ type: 'UPDATE_SETTINGS', settings })}
          onClose={() => setIsSettingsOpen(false)}
          soundOn={soundOn}
          onToggleSound={toggleSound}
        />
      )}

      {confirmForfeit && (
        <ConfirmModal
          title="Forfeit the game?"
          message={
            <>
              You'll be declared bankrupt and your properties go back to the bank
              {state.settings.mode === 'TEAMS' && me?.teamId ? ' (or to your teammate)' : ''}. This can't be undone.
            </>
          }
          confirmLabel="Forfeit"
          danger
          onCancel={() => setConfirmForfeit(false)}
          onConfirm={() => {
            setConfirmForfeit(false);
            dispatch({ type: 'DECLARE_BANKRUPTCY', playerId: localPlayerId });
          }}
        />
      )}

      {state.phase === 'GAME_OVER' && (
        <GameOverModal state={state} canRestart={role !== 'guest'} onRematch={() => dispatch({ type: 'RESET_GAME' })} />
      )}

      {/* Screen-reader status for whose turn it is */}
      <div className="sr-only" aria-live="polite">
        {state.phase === 'PLAYING' && current ? (isMyTurn ? 'Your turn' : `${current.name}'s turn`) : ''}
      </div>
      {showCover && (
        <CoverPage
          joiningRoom={inviteRoom}
          onEnter={() => {
            safeSet('session', 'bazaar_cover_seen', '1');
            setShowCover(false);
          }}
        />
      )}
    </div>
  );
};

export default App;
