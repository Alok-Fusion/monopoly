import {
  GameState,
  GameAction,
  PlayerId,
  PlayerState,
  TeamId,
  TokenId,
  GameLogEntry,
  ChatMessage,
  TileState,
  PlayerProfile,
  PlayerStats,
} from '../types/game';
import {
  BOARD_SIZE,
  SALARY_AMOUNT,
  JAIL_FINE,
  JAIL_TILE_INDEX,
  GO_TO_JAIL_INDEX,
  getTile,
  GROUP_TILES,
} from './board';
import { KISMAT_CARDS, KHAZANA_CARDS } from './cards';
import { calculateNetWorth, calculateRent } from './rent';
import { FESTIVAL_EVERY_N_ROUNDS, festivalText, houseCostOf, pickFestival, priceOf, salaryOf, taxOf } from './festivals';
import {
  canBuildHouse,
  canMortgage,
  canSellHouse,
  canUnmortgage,
  getCurrentPlayerId,
  mortgageableValue,
  MAX_COUNTER_OFFERS,
  mortgageValue,
  unmortgageCost,
  validateTrade,
  findTrade,
  proposalProblem,
  tradeStillPossible,
  colorTaken,
  nameTaken,
  uniqueName,
} from './rules';
import { formatINR, formatTeamName } from '../lib/format';

export const MAX_PLAYERS_CAP = 8;
export const AUCTION_SECONDS = 12;
export const AUCTION_BID_EXTENSION = 6;

const ALL_TEAMS: TeamId[] = ['team-1', 'team-2', 'team-3', 'team-4'];
const PLAYER_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const TOKENS: TokenId[] = [
  'auto-rickshaw',
  'cricket-bat',
  'chai-cup',
  'bullet-bike',
  'royal-tiger',
  'peacock',
  'kite',
  'elephant',
];
const BOT_NAMES = [
  'Mukesh Tycoon',
  'Babu Rao',
  'Majnu Bhai',
  'Kolkata Babu',
  'Bangalore Techie',
  'Delhi Raja',
  'Gujarati Trader',
  'Goa Nomad',
  'Munna Bhaiya',
];

function freshTiles(): Record<number, TileState> {
  return Object.fromEntries(
    Array.from({ length: BOARD_SIZE }, (_, i) => [i, { ownerId: null, houses: 0, mortgaged: false }])
  );
}

/** First player colour nobody in the room is using. */
function freeColor(state: GameState): string {
  return PLAYER_COLORS.find((c) => !colorTaken(state, c)) ?? PLAYER_COLORS[Object.keys(state.players).length % PLAYER_COLORS.length]!;
}

/** Renames / recolours later duplicates so every player is unique (seat order decides who keeps theirs). */
function ensureUniqueIdentities(state: GameState) {
  const seen: PlayerState[] = [];
  state.playerOrder.forEach((id) => {
    const p = state.players[id];
    if (!p) return;
    const view = { ...state, players: Object.fromEntries(seen.map((o) => [o.id, o])) } as GameState;
    if (nameTaken(view, p.name)) p.name = uniqueName(view, p.name);
    if (colorTaken(view, p.color)) p.color = PLAYER_COLORS.find((c) => !colorTaken(view, c)) ?? p.color;
    seen.push(p);
  });
}

function makePlayer(profile: PlayerProfile, cash: number, extra: Partial<PlayerState> = {}): PlayerState {
  return {
    id: profile.id,
    name: profile.name,
    tokenId: profile.tokenId,
    color: profile.color,
    teamId: profile.teamId,
    cash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCardsCount: 0,
    bankrupt: false,
    isBot: false,
    connected: true,
    ...extra,
  };
}

export function createInitialState(localProfile: PlayerProfile): GameState {
  const startingCash = 1500;
  const bot = makePlayer(
    {
      id: 'bot-mukesh',
      name: 'Mukesh Tycoon',
      tokenId: localProfile.tokenId === 'cricket-bat' ? 'royal-tiger' : 'cricket-bat',
      color: localProfile.color === '#EF4444' ? '#F97316' : '#EF4444',
      teamId: 'team-2',
    },
    startingCash,
    { isBot: true, botDifficulty: 'normal' }
  );
  const me = makePlayer({ ...localProfile, teamId: localProfile.teamId ?? 'team-1' }, startingCash);

  return {
    roomCode: '',
    isHost: true,
    phase: 'LOBBY',
    settings: {
      maxPlayers: 4,
      privateRoom: false,
      allowBots: true,
      boardMap: 'Classic',
      doubleRentOnSet: true,
      vacationCash: true,
      auctionOnDecline: true,
      noRentInJail: true,
      mortgageEnabled: true,
      evenBuild: true,
      startingCash,
      randomizePlayerOrder: true,
      mode: 'SOLO',
      doubleSalaryOnGo: false,
      turnTimeoutSeconds: 0,
      roundLimit: 30,
      festivalEvents: true,
      chaiBreakRest: true,
    },
    players: { [me.id]: me, [bot.id]: bot },
    playerOrder: [me.id, bot.id],
    currentPlayerIndex: 0,
    tiles: freshTiles(),
    dice: [1, 1],
    consecutiveDoubles: 0,
    turnPhase: 'ROLL',
    vacationPool: 0,
    activeCard: null,
    activeAuction: null,
    trades: [],
    debtAmount: 0,
    debtCreditorId: null,
    pendingLanding: null,
    winnerPlayerId: null,
    winnerTeamId: null,
    logs: [],
    messages: [],
    remainingHouses: 32,
    remainingHotels: 12,
    round: 1,
    activeFestival: null,
    stats: {},
    history: [],
    decks: { kismat: [], khazana: [] },
    phaseStartedAt: 0,
    endReason: null,
    rollCount: 0,
  };
}

function emptyStats(): PlayerStats {
  return {
    rentCollected: 0,
    rentPaid: 0,
    propertiesBought: 0,
    auctionsWon: 0,
    jailVisits: 0,
    salaryCollected: 0,
    tradesMade: 0,
    buildingsBuilt: 0,
  };
}

function stat(state: GameState, playerId: PlayerId): PlayerStats {
  state.stats ??= {};
  return (state.stats[playerId] ??= emptyStats());
}

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function snapshotWorth(state: GameState): void {
  const worth: Record<PlayerId, number> = {};
  state.playerOrder.forEach((id) => {
    const p = state.players[id];
    worth[id] = p && !p.bankrupt ? calculateNetWorth(state, id) : 0;
  });
  state.history ??= [];
  const last = state.history[state.history.length - 1];
  if (last && last.round === state.round) last.worth = worth;
  else state.history.push({ round: state.round, worth });
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function addLog(state: GameState, entry: Omit<GameLogEntry, 'id' | 'timestamp'>): void {
  state.logs.unshift({ id: uid('log'), timestamp: Date.now(), ...entry });
  if (state.logs.length > 80) state.logs.length = 80;
}

function activePlayers(state: GameState): PlayerState[] {
  return state.playerOrder
    .map((id) => state.players[id])
    .filter((p): p is PlayerState => !!p && !p.bankrupt);
}

function checkGameOver(state: GameState): boolean {
  if (state.phase === 'GAME_OVER') return true;
  if (state.phase !== 'PLAYING') return false;
  const alive = activePlayers(state);

  if (alive.length <= 1) {
    snapshotWorth(state);
    state.endReason = 'BANKRUPTCY';
    state.phase = 'GAME_OVER';
    state.winnerPlayerId = alive[0]?.id ?? null;
    state.winnerTeamId = state.settings.mode === 'TEAMS' ? alive[0]?.teamId ?? null : null;
    state.activeAuction = null;
    state.trades = [];
    state.activeCard = null;
    addLog(state, { type: 'SYSTEM', message: `Game over! ${alive[0]?.name ?? 'Nobody'} wins the game.` });
    return true;
  }

  if (state.settings.mode === 'TEAMS') {
    const teams = new Set(alive.map((p) => p.teamId ?? p.id));
    if (teams.size === 1) {
      const winningTeam = alive[0]!.teamId ?? null;
      snapshotWorth(state);
      state.endReason = 'BANKRUPTCY';
      state.phase = 'GAME_OVER';
      state.winnerTeamId = winningTeam;
      state.winnerPlayerId = alive[0]!.id;
      state.activeAuction = null;
      state.trades = [];
      state.activeCard = null;
      addLog(state, {
        type: 'SYSTEM',
        message: `Game over! ${winningTeam ? formatTeamName(winningTeam) : alive[0]!.name} wins the game.`,
      });
      return true;
    }
  }
  return false;
}

/** Round limit reached: the richest player (or team) wins. */
function endByRoundLimit(state: GameState): void {
  const alive = activePlayers(state);
  snapshotWorth(state);
  let winnerId: PlayerId | null = null;
  let winnerTeam: TeamId | null = null;
  const worthOf = (id: PlayerId) => calculateNetWorth(state, id);
  if (state.settings.mode === 'TEAMS') {
    const totals = new Map<string, number>();
    alive.forEach((p) => {
      const key = p.teamId ?? p.id;
      totals.set(key, (totals.get(key) ?? 0) + worthOf(p.id));
    });
    const bestKey = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const members = alive.filter((p) => (p.teamId ?? p.id) === bestKey).sort((a, b) => worthOf(b.id) - worthOf(a.id));
    winnerId = members[0]?.id ?? null;
    winnerTeam = members[0]?.teamId ?? null;
  } else {
    winnerId = [...alive].sort((a, b) => worthOf(b.id) - worthOf(a.id))[0]?.id ?? null;
  }
  state.phase = 'GAME_OVER';
  state.endReason = 'ROUND_LIMIT';
  state.winnerPlayerId = winnerId;
  state.winnerTeamId = winnerTeam;
  state.activeAuction = null;
  state.trades = [];
  state.activeCard = null;
  const name = winnerTeam ? formatTeamName(winnerTeam) : state.players[winnerId ?? '']?.name ?? 'Nobody';
  addLog(state, {
    type: 'SYSTEM',
    message: `Time is up after ${state.settings.roundLimit} rounds! ${name} finishes richest and wins.`,
  });
}

/** Called when play wraps back to the first seat. */
function startNewRound(state: GameState): void {
  state.round = (state.round ?? 1) + 1;
  if (state.settings.roundLimit > 0 && state.round > state.settings.roundLimit) {
    state.round = state.settings.roundLimit;
    endByRoundLimit(state);
    return;
  }
  snapshotWorth(state);
  const limit = state.settings.roundLimit;
  addLog(state, { type: 'SYSTEM', message: `Round ${state.round}${limit ? ` of ${limit}` : ''} begins.` });
  if (limit > 0 && state.round === limit) {
    addLog(state, { type: 'SYSTEM', message: 'Final round! The richest player at the end wins.' });
  }

  const previous = state.activeFestival?.id ?? null;
  if (state.activeFestival) {
    addLog(state, { type: 'SYSTEM', message: `${festivalText(state.activeFestival).title} is over.` });
    state.activeFestival = null;
  }
  if (state.settings.festivalEvents && state.round % FESTIVAL_EVERY_N_ROUNDS === 0) {
    state.activeFestival = pickFestival(state, previous);
    const f = festivalText(state.activeFestival);
    addLog(state, { type: 'SYSTEM', message: `${f.icon} ${f.title}! ${f.description} (this round only)` });
  }
}

function sendToJail(state: GameState, player: PlayerState): void {
  stat(state, player.id).jailVisits += 1;
  player.position = JAIL_TILE_INDEX;
  player.inJail = true;
  player.jailTurns = 0;
  state.consecutiveDoubles = 0;
  state.turnPhase = 'TURN_END';
}

function collectSalary(state: GameState, player: PlayerState, reason = 'passed Shuru', multiplier = 1): void {
  const amount = salaryOf(state) * multiplier;
  player.cash += amount;
  stat(state, player.id).salaryCollected += amount;
  addLog(state, {
    type: 'MOVE',
    playerId: player.id,
    message: `${player.name} ${reason} and collected ${formatINR(amount)}.`,
  });
}

/** Charge the current player. Opens a debt if they can't cover it. Returns true if paid. */
function chargeCurrentPlayer(
  state: GameState,
  player: PlayerState,
  amount: number,
  creditorId: PlayerId | 'BANK',
  pendingLanding: number | null = null
): boolean {
  if (amount <= 0) return true;
  if (player.cash >= amount) {
    player.cash -= amount;
    if (creditorId === 'BANK') {
      if (state.settings.vacationCash) state.vacationPool += amount;
    } else {
      const creditor = state.players[creditorId];
      if (creditor) creditor.cash += amount;
      stat(state, player.id).rentPaid += amount;
      stat(state, creditorId).rentCollected += amount;
    }
    return true;
  }
  state.debtAmount = amount;
  state.debtCreditorId = creditorId;
  state.pendingLanding = pendingLanding;
  state.turnPhase = 'DEBT';
  return false;
}

function finishAuction(state: GameState, timedOut: boolean): void {
  const auction = state.activeAuction;
  if (!auction) return;
  const tileDef = getTile(auction.tileIndex);
  const winner = auction.highestBidderId ? state.players[auction.highestBidderId] : null;

  if (winner && !winner.bankrupt && winner.cash >= auction.highestBid) {
    winner.cash -= auction.highestBid;
    state.tiles[auction.tileIndex]!.ownerId = winner.id;
    stat(state, winner.id).auctionsWon += 1;
    addLog(state, {
      type: 'AUCTION',
      playerId: winner.id,
      tileIndex: auction.tileIndex,
      message: `${winner.name} won ${tileDef.name} at auction for ${formatINR(auction.highestBid)}.`,
    });
  } else {
    addLog(state, {
      type: 'AUCTION',
      message: `${timedOut ? 'Auction timed out' : 'Everyone passed'} — ${tileDef.name} stays with the bank.`,
    });
  }
  state.activeAuction = null;
  state.turnPhase = 'TURN_END';
}

function startAuction(state: GameState, tileIndex: number): void {
  const bidders = state.playerOrder.filter((id) => {
    const p = state.players[id];
    return !!p && !p.bankrupt;
  });
  state.activeAuction = {
    tileIndex,
    highestBid: 0,
    highestBidderId: null,
    activeBidderIds: bidders,
    currentBidderIndex: 0,
    secondsRemaining: AUCTION_SECONDS,
  };
  state.turnPhase = 'AUCTION';
  addLog(state, {
    type: 'AUCTION',
    tileIndex,
    message: `Auction started for ${getTile(tileIndex).name}.`,
  });
}

/** Moves the player forward `steps` squares, paying salary when passing Shuru. */
function moveForward(state: GameState, player: PlayerState, steps: number): number {
  const oldPos = player.position;
  const newPos = (oldPos + steps) % BOARD_SIZE;
  player.position = newPos;
  if (newPos < oldPos) {
    if (newPos === 0 && state.settings.doubleSalaryOnGo) {
      collectSalary(state, player, 'landed exactly on Shuru', 2);
    } else {
      collectSalary(state, player);
    }
  }
  return newPos;
}

/** Drop open offers that can no longer happen (a property changed hands, a player went bust). */
function pruneTrades(state: GameState): void {
  const keep: typeof state.trades = [];
  for (const t of state.trades ?? []) {
    if (tradeStillPossible(state, t)) {
      keep.push(t);
    } else {
      const a = state.players[t.proposerId]?.name ?? 'Someone';
      const b = state.players[t.targetId]?.name ?? 'someone';
      addLog(state, { type: 'TRADE', message: `${a}'s offer to ${b} was cancelled — it can't happen any more.` });
    }
  }
  state.trades = keep;
}

function returnBuildingsToBank(state: GameState, tile: TileState): void {
  if (tile.houses === 5) state.remainingHotels += 1;
  else state.remainingHouses += tile.houses;
  tile.houses = 0;
}

/**
 * Public reducer. Stamps the time whenever a new decision starts so the turn
 * timer (and its countdown on every client) has a reference point.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  const next = baseReducer(state, action);
  if (action.type === 'SYNC_STATE' || next === state || next.phase !== 'PLAYING') return next;
  if (
    next.turnPhase !== state.turnPhase ||
    next.currentPlayerIndex !== state.currentPlayerIndex ||
    state.phase !== 'PLAYING'
  ) {
    next.phaseStartedAt = Date.now();
  }
  return next;
}

function baseReducer(state: GameState, action: GameAction): GameState {
  // Network sync replaces the whole state; no need to clone the old one.
  if (action.type === 'SYNC_STATE') {
    return { ...action.state, isHost: false };
  }

  const next = JSON.parse(JSON.stringify(state)) as GameState;
  // Saves from before open trades existed
  next.trades ??= [];
  delete (next as unknown as { activeTrade?: unknown }).activeTrade;
  const currentId = getCurrentPlayerId(next);
  const current = currentId ? next.players[currentId] : undefined;
  const playing = next.phase === 'PLAYING';

  switch (action.type) {
    case 'START_GAME': {
      if (next.phase !== 'LOBBY') return state;
      // The host can start whenever they like: play alone and we add a bot opponent...
      if (next.playerOrder.length < 2) {
        const withBot = baseReducer(next, { type: 'ADD_BOT', difficulty: 'normal' });
        if (withBot.playerOrder.length < 2) return state;
        return gameReducer(withBot, action);
      }
      // ...and in Teams mode anyone without a valid team is paired up automatically.
      if (next.settings.mode === 'TEAMS') {
        const teams = new Set(next.playerOrder.map((id) => next.players[id]?.teamId));
        if (teams.size < 2 || teams.has(undefined)) {
          next.playerOrder.forEach((id, i) => {
            const p = next.players[id];
            if (p) p.teamId = ALL_TEAMS[Math.min(Math.floor(i / 2), ALL_TEAMS.length - 1)];
          });
          if (next.playerOrder.length === 2) next.players[next.playerOrder[1]!]!.teamId = 'team-2';
          addLog(next, { type: 'SYSTEM', message: 'Teams were balanced automatically.' });
        }
      }

      ensureUniqueIdentities(next);

      if (next.settings.randomizePlayerOrder) {
        for (let i = next.playerOrder.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [next.playerOrder[i], next.playerOrder[j]] = [next.playerOrder[j]!, next.playerOrder[i]!];
        }
      }

      Object.values(next.players).forEach((p) => {
        p.cash = next.settings.startingCash;
        p.position = 0;
        p.inJail = false;
        p.jailTurns = 0;
        p.jailCardsCount = 0;
        p.bankrupt = false;
        p.bankruptTo = undefined;
      });

      next.phase = 'PLAYING';
      next.tiles = freshTiles();
      next.currentPlayerIndex = 0;
      next.turnPhase = 'ROLL';
      next.consecutiveDoubles = 0;
      next.vacationPool = 0;
      next.activeCard = null;
      next.activeAuction = null;
      next.trades = [];
      next.debtAmount = 0;
      next.debtCreditorId = null;
      next.pendingLanding = null;
      next.winnerPlayerId = null;
      next.winnerTeamId = null;
      next.remainingHouses = 32;
      next.remainingHotels = 12;
      next.round = 1;
      next.activeFestival = null;
      next.endReason = null;
      next.stats = Object.fromEntries(next.playerOrder.map((id) => [id, emptyStats()]));
      next.decks = { kismat: shuffled(KISMAT_CARDS.length), khazana: shuffled(KHAZANA_CARDS.length) };
      next.history = [];
      Object.values(next.players).forEach((p) => {
        p.lastTradeRound = undefined;
        p.skipNextTurn = false;
      });
      snapshotWorth(next);
      next.logs = [];
      addLog(next, { type: 'SYSTEM', message: 'Game started! Good luck, tycoons.' });
      if (next.settings.roundLimit > 0) {
        addLog(next, { type: 'SYSTEM', message: `The richest player after ${next.settings.roundLimit} rounds wins — unless everyone else goes broke first.` });
      }
      const first = next.players[next.playerOrder[0]!];
      addLog(next, { type: 'SYSTEM', message: `${first?.name ?? 'Player'} goes first.` });
      return next;
    }

    case 'ROLL_DICE': {
      if (!playing || next.turnPhase !== 'ROLL' || !current || current.bankrupt) return state;
      const player = current;

      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      next.dice = [d1, d2];
      next.rollCount = (next.rollCount ?? 0) + 1;
      const isDoubles = d1 === d2;
      const total = d1 + d2;

      addLog(next, {
        type: 'ROLL',
        playerId: player.id,
        message: `${player.name} rolled ${d1} + ${d2} = ${total}${isDoubles ? ' (doubles!)' : ''}.`,
      });

      if (player.inJail) {
        if (isDoubles) {
          player.inJail = false;
          player.jailTurns = 0;
          next.consecutiveDoubles = 0; // escaping with doubles does not earn another roll
          addLog(next, { type: 'JAIL', playerId: player.id, message: `${player.name} rolled doubles and walked out of Tihar Jail!` });
          const pos = moveForward(next, player, total);
          return gameReducer(next, { type: 'LAND_ON_TILE', tileIndex: pos });
        }

        player.jailTurns += 1;
        addLog(next, {
          type: 'JAIL',
          playerId: player.id,
          message: `${player.name} didn't roll doubles and stays in Tihar Jail — free to walk out next turn.`,
        });
        next.turnPhase = 'TURN_END';
        return next;
      }

      if (isDoubles) {
        next.consecutiveDoubles += 1;
        if (next.consecutiveDoubles >= 3) {
          addLog(next, { type: 'JAIL', playerId: player.id, message: `${player.name} rolled doubles three times in a row — straight to Tihar Jail for speeding!` });
          sendToJail(next, player);
          return next;
        }
      } else {
        next.consecutiveDoubles = 0;
      }

      const pos = moveForward(next, player, total);
      return gameReducer(next, { type: 'LAND_ON_TILE', tileIndex: pos });
    }

    case 'LAND_ON_TILE': {
      if (!playing || !current || current.bankrupt) return state;
      const player = current;
      const tileIndex = action.tileIndex;
      const tileDef = getTile(tileIndex);
      const tileState = next.tiles[tileIndex]!;

      addLog(next, { type: 'MOVE', playerId: player.id, tileIndex, message: `${player.name} landed on ${tileDef.name}.` });

      if (tileIndex === GO_TO_JAIL_INDEX) {
        addLog(next, { type: 'JAIL', playerId: player.id, message: `${player.name} was taken into police custody and sent to Tihar Jail.` });
        sendToJail(next, player);
        return next;
      }

      if (tileIndex === 20) {
        if (next.settings.vacationCash && next.vacationPool > 0) {
          const pool = next.vacationPool;
          player.cash += pool;
          next.vacationPool = 0;
          addLog(next, { type: 'SYSTEM', playerId: player.id, message: `${player.name} took a Chai Break and collected the ${formatINR(pool)} pool!` });
        }
        if (next.settings.chaiBreakRest) {
          player.skipNextTurn = true;
          next.consecutiveDoubles = 0; // sitting down for chai ends a doubles streak
          addLog(next, { type: 'SYSTEM', playerId: player.id, message: `☕ ${player.name} sits down for chai and will miss their next turn.` });
        }
        next.turnPhase = 'TURN_END';
        return next;
      }

      if (tileDef.type === 'tax') {
        const tax = taxOf(next, tileIndex);
        if (chargeCurrentPlayer(next, player, tax, 'BANK')) {
          addLog(next, { type: 'SYSTEM', playerId: player.id, message: `${player.name} paid ${formatINR(tax)} for ${tileDef.name}.` });
          next.turnPhase = 'TURN_END';
        } else {
          addLog(next, { type: 'SYSTEM', playerId: player.id, message: `${player.name} can't cover ${formatINR(tax)} ${tileDef.name} and must raise money.` });
        }
        return next;
      }

      if (tileDef.type === 'chance' || tileDef.type === 'chest') {
        const deck = tileDef.type === 'chance' ? 'kismat' : 'khazana';
        const cards = deck === 'kismat' ? KISMAT_CARDS : KHAZANA_CARDS;
        next.decks ??= { kismat: [], khazana: [] };
        if (!next.decks[deck]?.length) next.decks[deck] = shuffled(cards.length);
        const card = cards[next.decks[deck].shift()!] ?? cards[0]!;
        next.activeCard = { card, deck };
        next.turnPhase = 'CARD_DRAWN';
        addLog(next, {
          type: 'CARD',
          playerId: player.id,
          message: `${player.name} drew a ${deck === 'kismat' ? 'Kismat' : 'Khazana'} card: "${card.title}".`,
        });
        return next;
      }

      if (tileDef.type === 'property' || tileDef.type === 'railway' || tileDef.type === 'utility') {
        if (!tileState.ownerId) {
          const price = priceOf(next, tileIndex);
          const canRaise = !player.isBot && player.connected && player.cash + mortgageableValue(next, player.id) >= price;
          if (player.cash >= price || canRaise) {
            next.turnPhase = 'AWAIT_BUY';
          } else {
            addLog(next, { type: 'SYSTEM', playerId: player.id, message: `${player.name} can't afford ${tileDef.name} (${formatINR(price)}).` });
            if (next.settings.auctionOnDecline) startAuction(next, tileIndex);
            else next.turnPhase = 'TURN_END';
          }
          return next;
        }

        if (tileState.ownerId === player.id) {
          next.turnPhase = 'TURN_END';
          return next;
        }

        const owner = next.players[tileState.ownerId];
        const rent = calculateRent(next, tileIndex, player.id, next.dice[0] + next.dice[1]);
        if (rent.isTeammate) {
          addLog(next, { type: 'RENT', playerId: player.id, message: `${player.name} visited teammate ${owner?.name}'s ${tileDef.name} — no rent.` });
          next.turnPhase = 'TURN_END';
          return next;
        }
        if (rent.rent <= 0) {
          if (rent.reason) {
            addLog(next, { type: 'RENT', playerId: player.id, message: `No rent for ${tileDef.name}: ${rent.reason}.` });
          }
          next.turnPhase = 'TURN_END';
          return next;
        }
        if (chargeCurrentPlayer(next, player, rent.rent, tileState.ownerId)) {
          addLog(next, {
            type: 'RENT',
            playerId: player.id,
            tileIndex,
            message: `${player.name} paid ${formatINR(rent.rent)} rent to ${owner?.name} for ${tileDef.name}.`,
          });
          next.turnPhase = 'TURN_END';
        } else {
          addLog(next, {
            type: 'RENT',
            playerId: player.id,
            message: `${player.name} owes ${formatINR(rent.rent)} rent to ${owner?.name} but only has ${formatINR(player.cash)}.`,
          });
        }
        return next;
      }

      // GO, Just Visiting, etc.
      next.turnPhase = 'TURN_END';
      return next;
    }

    case 'BUY_PROPERTY': {
      if (!playing || next.turnPhase !== 'AWAIT_BUY' || !current) return state;
      const tileIndex = action.tileIndex;
      if (current.position !== tileIndex) return state;
      const tileDef = getTile(tileIndex);
      const tileState = next.tiles[tileIndex]!;
      const price = priceOf(next, tileIndex);
      if (tileState.ownerId || !tileDef.price || current.cash < price) return state;

      current.cash -= price;
      tileState.ownerId = current.id;
      stat(next, current.id).propertiesBought += 1;
      addLog(next, { type: 'BUY', playerId: current.id, tileIndex, message: `${current.name} bought ${tileDef.name} for ${formatINR(price)}.` });
      next.turnPhase = 'TURN_END';
      return next;
    }

    case 'DECLINE_PROPERTY': {
      if (!playing || next.turnPhase !== 'AWAIT_BUY' || !current) return state;
      if (current.position !== action.tileIndex) return state;
      addLog(next, { type: 'SYSTEM', playerId: current.id, message: `${current.name} decided not to buy ${getTile(action.tileIndex).name}.` });
      if (next.settings.auctionOnDecline) startAuction(next, action.tileIndex);
      else next.turnPhase = 'TURN_END';
      return next;
    }

    case 'AUCTION_BID': {
      const auction = next.activeAuction;
      if (!auction) return state;
      const player = next.players[action.playerId];
      if (!player || player.bankrupt || !auction.activeBidderIds.includes(player.id)) return state;
      if (auction.highestBidderId === player.id) return state;
      const amount = Math.floor(action.amount);
      if (amount <= auction.highestBid || amount > player.cash) return state;

      auction.highestBid = amount;
      auction.highestBidderId = player.id;
      auction.secondsRemaining = Math.max(auction.secondsRemaining, AUCTION_BID_EXTENSION);
      addLog(next, { type: 'AUCTION', playerId: player.id, message: `${player.name} bid ${formatINR(amount)}.` });
      // Everyone else already passed: the bid wins immediately.
      if (auction.activeBidderIds.every((id) => id === player.id)) finishAuction(next, false);
      return next;
    }

    case 'AUCTION_PASS': {
      const auction = next.activeAuction;
      if (!auction || !auction.activeBidderIds.includes(action.playerId)) return state;
      // The leading bidder can't withdraw their bid.
      if (auction.highestBidderId === action.playerId) return state;

      auction.activeBidderIds = auction.activeBidderIds.filter((id) => id !== action.playerId);
      addLog(next, { type: 'AUCTION', playerId: action.playerId, message: `${next.players[action.playerId]?.name ?? 'Player'} passed.` });

      const remaining = auction.activeBidderIds;
      const onlyLeaderLeft =
        auction.highestBidderId !== null && remaining.every((id) => id === auction.highestBidderId);
      if (onlyLeaderLeft || remaining.length === 0) finishAuction(next, false);
      return next;
    }

    case 'AUCTION_TICK': {
      const auction = next.activeAuction;
      if (!auction) return state;
      auction.secondsRemaining -= 1;
      if (auction.secondsRemaining <= 0) finishAuction(next, true);
      return next;
    }

    case 'DISMISS_CARD': {
      if (!playing || next.turnPhase !== 'CARD_DRAWN' || !next.activeCard || !current) return state;
      const { card } = next.activeCard;
      const player = current;
      next.activeCard = null;
      next.turnPhase = 'TURN_END';

      switch (card.type) {
        case 'MOVE_TO': {
          if (card.targetIndex === undefined) break;
          const target = card.targetIndex;
          if (target === 0) {
            player.position = 0;
            collectSalary(next, player, 'advanced to Shuru');
            return gameReducer(next, { type: 'LAND_ON_TILE', tileIndex: 0 });
          }
          const steps = (target - player.position + BOARD_SIZE) % BOARD_SIZE;
          const pos = moveForward(next, player, steps);
          return gameReducer(next, { type: 'LAND_ON_TILE', tileIndex: pos });
        }
        case 'MOVE_REL': {
          if (!card.steps) break;
          if (card.steps > 0) {
            const pos = moveForward(next, player, card.steps);
            return gameReducer(next, { type: 'LAND_ON_TILE', tileIndex: pos });
          }
          player.position = (player.position + card.steps + BOARD_SIZE) % BOARD_SIZE;
          return gameReducer(next, { type: 'LAND_ON_TILE', tileIndex: player.position });
        }
        case 'CASH': {
          const amount = card.amount ?? 0;
          if (amount > 0) {
            player.cash += amount;
            addLog(next, { type: 'CARD', playerId: player.id, message: `${player.name} collected ${formatINR(amount)}.` });
          } else if (amount < 0) {
            if (chargeCurrentPlayer(next, player, -amount, 'BANK')) {
              addLog(next, { type: 'CARD', playerId: player.id, message: `${player.name} paid ${formatINR(-amount)}.` });
            } else {
              addLog(next, { type: 'CARD', playerId: player.id, message: `${player.name} can't pay ${formatINR(-amount)} and must raise money.` });
            }
          }
          return next;
        }
        case 'GO_TO_JAIL': {
          addLog(next, { type: 'JAIL', playerId: player.id, message: `${player.name} was sent to Tihar Jail.` });
          sendToJail(next, player);
          return next;
        }
        case 'GET_OUT_OF_JAIL': {
          player.jailCardsCount += 1;
          addLog(next, { type: 'CARD', playerId: player.id, message: `${player.name} kept a Get Out of Jail Free card.` });
          return next;
        }
        case 'BIRTHDAY': {
          const amt = card.amount ?? 10;
          let collected = 0;
          next.playerOrder.forEach((pid) => {
            const other = next.players[pid];
            if (!other || pid === player.id || other.bankrupt) return;
            if (next.settings.mode === 'TEAMS' && other.teamId && other.teamId === player.teamId) return;
            const pay = Math.min(other.cash, amt);
            other.cash -= pay;
            collected += pay;
          });
          player.cash += collected;
          addLog(next, { type: 'CARD', playerId: player.id, message: `${player.name} collected ${formatINR(collected)} in birthday gifts.` });
          return next;
        }
        case 'REPAIRS': {
          let houses = 0;
          let hotels = 0;
          Object.values(next.tiles).forEach((t) => {
            if (t.ownerId !== player.id) return;
            if (t.houses === 5) hotels += 1;
            else houses += t.houses;
          });
          const cost = houses * (card.houseCost ?? 25) + hotels * (card.hotelCost ?? 100);
          if (cost === 0) {
            addLog(next, { type: 'CARD', playerId: player.id, message: `${player.name} has no buildings — nothing to pay.` });
          } else if (chargeCurrentPlayer(next, player, cost, 'BANK')) {
            addLog(next, { type: 'CARD', playerId: player.id, message: `${player.name} paid ${formatINR(cost)} for repairs.` });
          }
          return next;
        }
        case 'NEAREST_RAILWAY':
        case 'NEAREST_UTILITY': {
          const targets = card.type === 'NEAREST_RAILWAY' ? GROUP_TILES.railway : GROUP_TILES.utility;
          const cur = player.position;
          const nearest = targets.find((r) => r > cur) ?? targets[0]!;
          const steps = (nearest - cur + BOARD_SIZE) % BOARD_SIZE;
          const pos = moveForward(next, player, steps);
          return gameReducer(next, { type: 'LAND_ON_TILE', tileIndex: pos });
        }
      }
      return next;
    }

    case 'PAY_JAIL_FINE': {
      const player = next.players[action.playerId];
      if (!playing || next.turnPhase !== 'ROLL' || !player || player.id !== currentId) return state;
      if (!player.inJail || player.cash < JAIL_FINE) return state;
      player.cash -= JAIL_FINE;
      player.inJail = false;
      player.jailTurns = 0;
      if (next.settings.vacationCash) next.vacationPool += JAIL_FINE;
      addLog(next, { type: 'JAIL', playerId: player.id, message: `${player.name} paid the ${formatINR(JAIL_FINE)} fine and is free.` });
      return next;
    }

    case 'USE_JAIL_CARD': {
      const player = next.players[action.playerId];
      if (!playing || next.turnPhase !== 'ROLL' || !player || player.id !== currentId) return state;
      if (!player.inJail || player.jailCardsCount <= 0) return state;
      player.jailCardsCount -= 1;
      player.inJail = false;
      player.jailTurns = 0;
      addLog(next, { type: 'JAIL', playerId: player.id, message: `${player.name} used a Get Out of Jail Free card.` });
      return next;
    }

    case 'BUILD_HOUSE': {
      const { playerId, tileIndex } = action;
      if (!canBuildHouse(next, playerId, tileIndex)) return state;
      const player = next.players[playerId]!;
      const tileDef = getTile(tileIndex);
      const tile = next.tiles[tileIndex]!;
      player.cash -= houseCostOf(next, tileIndex);
      stat(next, playerId).buildingsBuilt += 1;
      if (tile.houses === 4) {
        tile.houses = 5;
        next.remainingHouses += 4;
        next.remainingHotels -= 1;
        addLog(next, { type: 'BUY', playerId, tileIndex, message: `${player.name} built a hotel on ${tileDef.name}.` });
      } else {
        tile.houses += 1;
        next.remainingHouses -= 1;
        addLog(next, {
          type: 'BUY',
          playerId,
          tileIndex,
          message: `${player.name} built a house on ${tileDef.name} (${tile.houses}).`,
        });
      }
      return next;
    }

    case 'SELL_HOUSE': {
      const { playerId, tileIndex } = action;
      if (!canSellHouse(next, playerId, tileIndex)) return state;
      const player = next.players[playerId]!;
      const tileDef = getTile(tileIndex);
      const tile = next.tiles[tileIndex]!;
      const half = Math.floor(tileDef.houseCost! / 2);
      let refund = half;

      if (tile.houses === 5) {
        next.remainingHotels += 1;
        if (next.remainingHouses >= 4) {
          tile.houses = 4;
          next.remainingHouses -= 4;
        } else {
          // Not enough houses in the bank to break the hotel down: sell it outright.
          refund = half * 5;
          tile.houses = 0;
        }
      } else {
        tile.houses -= 1;
        next.remainingHouses += 1;
      }
      player.cash += refund;
      addLog(next, { type: 'BUY', playerId, tileIndex, message: `${player.name} sold a building on ${tileDef.name} for ${formatINR(refund)}.` });
      return next;
    }

    case 'MORTGAGE_PROPERTY': {
      const { playerId, tileIndex } = action;
      if (!canMortgage(next, playerId, tileIndex)) return state;
      const player = next.players[playerId]!;
      const value = mortgageValue(tileIndex);
      player.cash += value;
      next.tiles[tileIndex]!.mortgaged = true;
      addLog(next, { type: 'BUY', playerId, tileIndex, message: `${player.name} mortgaged ${getTile(tileIndex).name} for ${formatINR(value)}.` });
      return next;
    }

    case 'UNMORTGAGE_PROPERTY': {
      const { playerId, tileIndex } = action;
      if (!canUnmortgage(next, playerId, tileIndex)) return state;
      const player = next.players[playerId]!;
      const cost = unmortgageCost(tileIndex);
      player.cash -= cost;
      next.tiles[tileIndex]!.mortgaged = false;
      addLog(next, { type: 'BUY', playerId, tileIndex, message: `${player.name} paid off the mortgage on ${getTile(tileIndex).name} (${formatINR(cost)}).` });
      return next;
    }

    case 'PROPOSE_TRADE': {
      if (!playing || proposalProblem(next, action.offer)) return state;
      next.trades.push({ ...action.offer, id: uid('trade'), status: 'PENDING', counterCount: 0, createdAt: Date.now() });
      const proposer = next.players[action.offer.proposerId];
      if (proposer) proposer.lastTradeRound = next.round;
      const target = next.players[action.offer.targetId];
      addLog(next, { type: 'TRADE', playerId: proposer?.id, message: `${proposer?.name} offered ${target?.name} a trade.` });
      return next;
    }

    case 'COUNTER_TRADE': {
      const trade = findTrade(next, action.tradeId);
      if (!playing || !trade) return state;
      const count = (trade.counterCount ?? 0) + 1;
      if (count > MAX_COUNTER_OFFERS) return state;
      // The person answering becomes the proposer of the new terms
      if (action.offer.proposerId !== trade.targetId || action.offer.targetId !== trade.proposerId) return state;
      if (validateTrade(next, action.offer)) return state;
      const i = next.trades.indexOf(trade);
      next.trades[i] = { ...action.offer, id: uid('trade'), status: 'PENDING', counterCount: count, createdAt: Date.now() };
      const from = next.players[action.offer.proposerId];
      const to = next.players[action.offer.targetId];
      addLog(next, { type: 'TRADE', playerId: from?.id, message: `${from?.name} sent ${to?.name} a counter-offer.` });
      return next;
    }

    case 'ACCEPT_TRADE': {
      const trade = findTrade(next, action.tradeId);
      if (!playing || !trade) return state;
      const p1 = next.players[trade.proposerId];
      const p2 = next.players[trade.targetId];
      const problem = validateTrade(next, trade);
      if (!p1 || !p2 || problem) return state; // stays open; the UI explains what's blocking it

      p1.cash += trade.requestCash - trade.offerCash;
      p2.cash += trade.offerCash - trade.requestCash;
      trade.offerProperties.forEach((idx) => (next.tiles[idx]!.ownerId = p2.id));
      trade.requestProperties.forEach((idx) => (next.tiles[idx]!.ownerId = p1.id));
      p1.jailCardsCount += trade.requestJailCards - trade.offerJailCards;
      p2.jailCardsCount += trade.offerJailCards - trade.requestJailCards;

      stat(next, p1.id).tradesMade += 1;
      stat(next, p2.id).tradesMade += 1;
      next.trades = next.trades.filter((t) => t.id !== trade.id);
      addLog(next, { type: 'TRADE', playerId: p2.id, message: `${p2.name} accepted ${p1.name}'s trade.` });
      pruneTrades(next);
      return next;
    }

    case 'REJECT_TRADE':
    case 'CANCEL_TRADE': {
      const trade = findTrade(next, action.tradeId);
      if (!trade) return state;
      const p1 = next.players[trade.proposerId];
      const p2 = next.players[trade.targetId];
      addLog(next, {
        type: 'TRADE',
        message:
          action.type === 'REJECT_TRADE'
            ? `${p2?.name ?? 'Player'} declined ${p1?.name ?? 'the'}'s trade.`
            : `${p1?.name ?? 'Player'} withdrew their trade offer.`,
      });
      next.trades = next.trades.filter((t) => t.id !== trade.id);
      return next;
    }

    case 'RESOLVE_DEBT': {
      const player = next.players[action.playerId];
      if (!playing || next.turnPhase !== 'DEBT' || !player || player.id !== currentId) return state;
      if (player.cash < next.debtAmount) return state;

      const amount = next.debtAmount;
      player.cash -= amount;
      if (next.debtCreditorId && next.debtCreditorId !== 'BANK') {
        const creditor = next.players[next.debtCreditorId];
        if (creditor) creditor.cash += amount;
        stat(next, player.id).rentPaid += amount;
        stat(next, next.debtCreditorId).rentCollected += amount;
      } else if (next.settings.vacationCash) {
        next.vacationPool += amount;
      }
      addLog(next, { type: 'SYSTEM', playerId: player.id, message: `${player.name} paid off ${formatINR(amount)}.` });

      const landing = next.pendingLanding;
      next.debtAmount = 0;
      next.debtCreditorId = null;
      next.pendingLanding = null;
      next.turnPhase = 'TURN_END';

      if (landing !== null) {
        const steps = (landing - player.position + BOARD_SIZE) % BOARD_SIZE;
        const pos = moveForward(next, player, steps);
        return gameReducer(next, { type: 'LAND_ON_TILE', tileIndex: pos });
      }
      return next;
    }

    case 'DECLARE_BANKRUPTCY': {
      if (!playing) return state;
      const player = next.players[action.playerId];
      if (!player || player.bankrupt) return state;
      const isCurrent = player.id === currentId;
      // Debt belongs to the current player only
      const creditorId = isCurrent && next.turnPhase === 'DEBT' ? next.debtCreditorId : 'BANK';

      player.bankrupt = true;
      player.bankruptTo = creditorId ?? 'BANK';
      player.inJail = false;
      player.skipNextTurn = false;
      addLog(next, { type: 'BANKRUPT', playerId: player.id, message: `${player.name} went bankrupt and is out of the game.` });

      const teammate =
        next.settings.mode === 'TEAMS' && player.teamId
          ? Object.values(next.players).find((p) => p.teamId === player.teamId && p.id !== player.id && !p.bankrupt)
          : undefined;
      const creditor = creditorId && creditorId !== 'BANK' ? next.players[creditorId] : undefined;
      const heir = teammate ?? (creditor && !creditor.bankrupt ? creditor : undefined);

      Object.entries(next.tiles).forEach(([idxStr, tile]) => {
        if (tile.ownerId !== player.id) return;
        if (heir) {
          if (!teammate && tile.houses > 0) {
            // Creditors receive buildings as cash at the bank's buy-back price.
            const def = getTile(Number(idxStr));
            heir.cash += tile.houses * Math.floor((def.houseCost ?? 0) / 2);
            returnBuildingsToBank(next, tile);
          }
          tile.ownerId = heir.id;
        } else {
          returnBuildingsToBank(next, tile);
          tile.ownerId = null;
          tile.mortgaged = false;
        }
      });

      if (heir) {
        heir.cash += Math.max(player.cash, 0);
        heir.jailCardsCount += player.jailCardsCount;
        addLog(next, {
          type: 'BANKRUPT',
          message: teammate
            ? `${teammate.name} inherited all of ${player.name}'s cash and properties.`
            : `${heir.name} received ${player.name}'s remaining assets.`,
        });
      } else {
        addLog(next, { type: 'BANKRUPT', message: `${player.name}'s properties went back to the bank.` });
      }
      player.cash = 0;
      player.jailCardsCount = 0;

      // Clean up anything this player was part of
      pruneTrades(next);
      if (next.activeAuction) {
        const auction = next.activeAuction;
        auction.activeBidderIds = auction.activeBidderIds.filter((id) => id !== player.id);
        if (auction.highestBidderId === player.id) {
          auction.highestBidderId = null;
          auction.highestBid = 0;
        }
      }

      if (isCurrent) {
        next.debtAmount = 0;
        next.debtCreditorId = null;
        next.pendingLanding = null;
        next.activeCard = null;
      }

      if (checkGameOver(next)) return next;

      if (next.activeAuction) {
        const auction = next.activeAuction;
        const leaderOnly =
          auction.highestBidderId !== null && auction.activeBidderIds.every((id) => id === auction.highestBidderId);
        if (leaderOnly || auction.activeBidderIds.length === 0) finishAuction(next, false);
      }

      if (isCurrent) return gameReducer(next, { type: 'END_TURN', force: true });
      return next;
    }

    case 'END_TURN': {
      if (!playing) return state;
      if (!action.force && next.turnPhase !== 'TURN_END') return state;
      if (checkGameOver(next)) return next;

      const player = current;
      const rolledDoubles = next.dice[0] === next.dice[1] && next.consecutiveDoubles > 0;
      if (!action.force && player && !player.bankrupt && !player.inJail && rolledDoubles) {
        addLog(next, { type: 'SYSTEM', playerId: player.id, message: `${player.name} rolled doubles and goes again.` });
        next.turnPhase = 'ROLL';
        return next;
      }

      next.turnPhase = 'ROLL';
      next.consecutiveDoubles = 0;
      next.activeCard = null;

      const n = next.playerOrder.length;
      let idx = next.currentPlayerIndex;
      for (let guard = 0; guard < n * 3; guard++) {
        const prev = idx;
        idx = (idx + 1) % n;
        // Passing the first seat starts a new round
        if (idx <= prev) {
          next.currentPlayerIndex = idx;
          startNewRound(next);
          if (next.phase !== 'PLAYING') return next;
        }
        const p = next.players[next.playerOrder[idx]!];
        if (!p || p.bankrupt) continue;
        if (p.skipNextTurn) {
          p.skipNextTurn = false;
          addLog(next, { type: 'SYSTEM', playerId: p.id, message: `☕ ${p.name} is still on a Chai Break and sits this turn out.` });
          continue;
        }
        break;
      }

      next.currentPlayerIndex = idx;
      const nextPlayer = next.players[next.playerOrder[idx]!];
      // A full round behind bars is the whole sentence: walk out free, no fine
      if (nextPlayer?.inJail && nextPlayer.jailTurns >= 1) {
        nextPlayer.inJail = false;
        nextPlayer.jailTurns = 0;
        addLog(next, { type: 'JAIL', playerId: nextPlayer.id, message: `${nextPlayer.name} served their time and walks out of Tihar Jail.` });
      }
      addLog(next, { type: 'SYSTEM', playerId: nextPlayer?.id, message: `It's ${nextPlayer?.name ?? 'the next player'}'s turn.` });
      return next;
    }

    case 'SEND_CHAT': {
      const text = action.message.text.trim().slice(0, 200);
      if (!text) return state;
      const msg: ChatMessage = { ...action.message, text, id: uid('chat'), timestamp: Date.now() };
      next.messages.push(msg);
      if (next.messages.length > 100) next.messages.shift();
      return next;
    }

    case 'ADD_BOT': {
      if (next.phase !== 'LOBBY') return state;
      const cap = Math.min(next.settings.maxPlayers, MAX_PLAYERS_CAP);
      if (next.playerOrder.length >= cap) return state;

      const players = Object.values(next.players);
      const usedColors = new Set(players.map((p) => p.color));
      const usedTokens = new Set(players.map((p) => p.tokenId));
      const id = uid('bot');
      const name = BOT_NAMES.find((n) => !nameTaken(next, n)) ?? uniqueName(next, 'Bot');
      const color = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[players.length % PLAYER_COLORS.length]!;
      const tokenId = TOKENS.find((t) => !usedTokens.has(t)) ?? TOKENS[players.length % TOKENS.length]!;

      let teamId: TeamId | undefined = action.teamId;
      if (!teamId) {
        const counts = Object.fromEntries(ALL_TEAMS.map((t) => [t, 0])) as Record<TeamId, number>;
        players.forEach((p) => p.teamId && (counts[p.teamId] += 1));
        teamId = ALL_TEAMS.find((t) => counts[t] < 2) ?? 'team-2';
      }

      next.players[id] = makePlayer({ id, name, tokenId, color, teamId }, next.settings.startingCash, {
        isBot: true,
        botDifficulty: action.difficulty,
      });
      next.playerOrder.push(id);
      return next;
    }

    case 'ADD_PLAYER': {
      const existing = next.players[action.profile.id];
      if (existing) {
        existing.connected = true;
        delete existing.disconnectedAt;
        return next;
      }
      if (next.phase !== 'LOBBY') return state;
      const cap = Math.min(next.settings.maxPlayers, MAX_PLAYERS_CAP);
      if (next.playerOrder.length >= cap) return state;

      const players = Object.values(next.players);
      const counts = Object.fromEntries(ALL_TEAMS.map((t) => [t, 0])) as Record<TeamId, number>;
      players.forEach((p) => p.teamId && (counts[p.teamId] += 1));
      const teamId = ALL_TEAMS.find((t) => counts[t] < 2) ?? 'team-1';
      // Nobody in a room shares a name or a colour: newcomers get the next free one
      const name = uniqueName(next, action.profile.name || 'Guest');
      const color = colorTaken(next, action.profile.color) ? freeColor(next) : action.profile.color;

      next.players[action.profile.id] = makePlayer({ ...action.profile, name, color, teamId }, next.settings.startingCash);
      next.playerOrder.push(action.profile.id);
      addLog(next, { type: 'SYSTEM', message: `${name} joined the room.` });
      return next;
    }

    case 'UPDATE_PLAYER': {
      const p = next.players[action.profile.id];
      if (!p) return state;
      // Names and colours identify players on the board and in the log, so they are never shared
      const wanted = action.profile.name.trim().replace(/\s+/g, ' ').slice(0, 18);
      if (wanted && !nameTaken(next, wanted, p.id)) p.name = wanted;
      p.tokenId = action.profile.tokenId;
      if (!colorTaken(next, action.profile.color, p.id)) p.color = action.profile.color;
      return next;
    }

    case 'SET_PLAYER_CONNECTED': {
      const p = next.players[action.playerId];
      if (!p) return state;
      if (p.connected === action.connected) return state;
      p.connected = action.connected;
      if (action.connected) delete p.disconnectedAt;
      else p.disconnectedAt = Date.now();
      return next;
    }

    case 'SKIP_RECONNECT_WAIT': {
      const p = next.players[action.playerId];
      if (!p || p.connected || p.isBot) return state;
      p.disconnectedAt = 0;
      addLog(next, { type: 'SYSTEM', playerId: p.id, message: `Autopilot is playing for ${p.name} until they reconnect.` });
      return next;
    }

    case 'REMOVE_PLAYER': {
      if (next.phase !== 'LOBBY' || !next.players[action.playerId]) return state;
      delete next.players[action.playerId];
      next.playerOrder = next.playerOrder.filter((id) => id !== action.playerId);
      if (next.currentPlayerIndex >= next.playerOrder.length) next.currentPlayerIndex = 0;
      return next;
    }

    case 'UPDATE_SETTINGS': {
      if (next.phase !== 'LOBBY') return state;
      next.settings = { ...next.settings, ...action.settings };
      next.settings.maxPlayers = Math.max(next.settings.maxPlayers, 2);
      Object.values(next.players).forEach((p) => (p.cash = next.settings.startingCash));
      return next;
    }

    case 'SET_PLAYER_TEAM': {
      if (next.phase !== 'LOBBY') return state;
      const p = next.players[action.playerId];
      if (!p) return state;
      if (action.teamId) {
        const size = Object.values(next.players).filter((o) => o.teamId === action.teamId && o.id !== p.id).length;
        if (size >= 2) return state;
      }
      p.teamId = action.teamId;
      return next;
    }

    case 'SET_ROOM': {
      next.roomCode = action.roomCode;
      next.isHost = action.isHost;
      return next;
    }

    case 'RESET_GAME': {
      if (next.phase === 'LOBBY') return state;
      Object.values(next.players).forEach((p) => {
        p.cash = next.settings.startingCash;
        p.position = 0;
        p.inJail = false;
        p.jailTurns = 0;
        p.jailCardsCount = 0;
        p.bankrupt = false;
        p.bankruptTo = undefined;
        p.skipNextTurn = false;
      });
      // Drop guests who left mid-game
      next.playerOrder = next.playerOrder.filter((id) => next.players[id]?.connected !== false);
      Object.keys(next.players).forEach((id) => {
        if (!next.playerOrder.includes(id)) delete next.players[id];
      });
      next.phase = 'LOBBY';
      next.tiles = freshTiles();
      next.currentPlayerIndex = 0;
      next.turnPhase = 'ROLL';
      next.consecutiveDoubles = 0;
      next.vacationPool = 0;
      next.activeCard = null;
      next.activeAuction = null;
      next.trades = [];
      next.debtAmount = 0;
      next.debtCreditorId = null;
      next.pendingLanding = null;
      next.winnerPlayerId = null;
      next.winnerTeamId = null;
      next.remainingHouses = 32;
      next.remainingHotels = 12;
      next.round = 1;
      next.activeFestival = null;
      next.stats = {};
      next.history = [];
      next.decks = { kismat: [], khazana: [] };
      next.endReason = null;
      next.logs = [];
      return next;
    }

    default:
      return state;
  }
}
