import { GameAction, GameState, PlayerId, TradeOffer } from '../types/game';
import { getTile, GROUP_TILES, isColorGroup } from './board';
import { hasMonopoly } from './rent';
import { houseCostOf } from './festivals';

/**
 * Shared rule checks. The reducer, the bots and the UI all use these so that
 * a button is only enabled when the reducer would actually accept the action
 * (and bots never retry an action that silently does nothing).
 */

export const MIN_BID_STEP = 10;
/** A deal can go back and forth this many times before it has to be accepted or declined. */
export const MAX_COUNTER_OFFERS = 6;
/** Open offers a single player may have out at once. */
export const MAX_OPEN_OFFERS = 3;

export function openTrades(state: GameState): TradeOffer[] {
  return (state.trades ?? []).filter((t) => t.status === 'PENDING');
}

export function findTrade(state: GameState, tradeId: string): TradeOffer | undefined {
  return openTrades(state).find((t) => t.id === tradeId);
}

/** Is there already an open deal between these two players (in either direction)? */
export function openTradeBetween(state: GameState, a: PlayerId, b: PlayerId): TradeOffer | undefined {
  return openTrades(state).find((t) => (t.proposerId === a && t.targetId === b) || (t.proposerId === b && t.targetId === a));
}

/** Everything validateTrade checks, plus limits on how many offers can be open. */
export function proposalProblem(state: GameState, offer: Omit<TradeOffer, 'id' | 'status'>): string | null {
  const basic = validateTrade(state, offer);
  if (basic) return basic;
  const target = state.players[offer.targetId];
  if (openTradeBetween(state, offer.proposerId, offer.targetId)) {
    return `You already have an open deal with ${target?.name ?? 'them'} — answer or withdraw it first.`;
  }
  if (openTrades(state).filter((t) => t.proposerId === offer.proposerId).length >= MAX_OPEN_OFFERS) {
    return `You can have at most ${MAX_OPEN_OFFERS} offers out at once.`;
  }
  return null;
}

/**
 * The players and properties in an offer still exist as described. Cash can
 * come and go, so a cash shortfall only blocks accepting, it doesn't cancel.
 */
export function tradeStillPossible(state: GameState, t: TradeOffer): boolean {
  const a = state.players[t.proposerId];
  const b = state.players[t.targetId];
  if (!a || !b || a.bankrupt || b.bankrupt) return false;
  return (
    t.offerProperties.every((idx) => state.tiles[idx]?.ownerId === t.proposerId) &&
    t.requestProperties.every((idx) => state.tiles[idx]?.ownerId === t.targetId)
  );
}

export function getCurrentPlayerId(state: GameState): PlayerId | undefined {
  return state.playerOrder[state.currentPlayerIndex];
}

export function groupTilesOf(tileIndex: number): readonly number[] {
  const def = getTile(tileIndex);
  return GROUP_TILES[def.group] ?? [];
}

export function groupHasBuildings(state: GameState, tileIndex: number): boolean {
  const def = getTile(tileIndex);
  if (!isColorGroup(def.group)) return false;
  return groupTilesOf(tileIndex).some((idx) => (state.tiles[idx]?.houses ?? 0) > 0);
}

export function ownedTiles(state: GameState, playerId: PlayerId): number[] {
  return Object.entries(state.tiles)
    .filter(([, t]) => t.ownerId === playerId)
    .map(([idx]) => parseInt(idx, 10))
    .sort((a, b) => a - b);
}

export function unmortgageCost(tileIndex: number): number {
  const price = getTile(tileIndex).price ?? 0;
  return Math.floor((price / 2) * 1.1);
}

export function mortgageValue(tileIndex: number): number {
  return Math.floor((getTile(tileIndex).price ?? 0) / 2);
}

export function canBuildHouse(state: GameState, playerId: PlayerId, tileIndex: number): boolean {
  if (state.phase !== 'PLAYING') return false;
  const player = state.players[playerId];
  const def = getTile(tileIndex);
  const tile = state.tiles[tileIndex];
  if (!player || player.bankrupt || !tile || tile.ownerId !== playerId) return false;
  if (def.type !== 'property' || !def.houseCost || tile.houses >= 5) return false;
  if (player.cash < houseCostOf(state, tileIndex)) return false;
  if (!hasMonopoly(state, playerId, def.group)) return false;

  const group = groupTilesOf(tileIndex);
  // No building while any tile in the set is mortgaged
  if (group.some((idx) => state.tiles[idx]?.mortgaged)) return false;

  if (state.settings.evenBuild) {
    const minHouses = Math.min(...group.map((idx) => state.tiles[idx]?.houses ?? 0));
    if (tile.houses > minHouses) return false;
  }

  if (tile.houses === 4) return state.remainingHotels > 0;
  return state.remainingHouses > 0;
}

export function canSellHouse(state: GameState, playerId: PlayerId, tileIndex: number): boolean {
  if (state.phase !== 'PLAYING') return false;
  const def = getTile(tileIndex);
  const tile = state.tiles[tileIndex];
  if (!tile || tile.ownerId !== playerId || tile.houses <= 0 || !def.houseCost) return false;
  if (state.settings.evenBuild) {
    const maxHouses = Math.max(...groupTilesOf(tileIndex).map((idx) => state.tiles[idx]?.houses ?? 0));
    if (tile.houses < maxHouses) return false;
  }
  return true;
}

export function canMortgage(state: GameState, playerId: PlayerId, tileIndex: number): boolean {
  if (state.phase !== 'PLAYING' || !state.settings.mortgageEnabled) return false;
  const def = getTile(tileIndex);
  const tile = state.tiles[tileIndex];
  if (!tile || tile.ownerId !== playerId || tile.mortgaged || !def.price) return false;
  return !groupHasBuildings(state, tileIndex);
}

export function canUnmortgage(state: GameState, playerId: PlayerId, tileIndex: number): boolean {
  if (state.phase !== 'PLAYING') return false;
  const player = state.players[playerId];
  const tile = state.tiles[tileIndex];
  if (!player || !tile || tile.ownerId !== playerId || !tile.mortgaged) return false;
  return player.cash >= unmortgageCost(tileIndex);
}

/** A property can change hands only when no tile in its colour set has buildings. */
export function isTradeable(state: GameState, playerId: PlayerId, tileIndex: number): boolean {
  const tile = state.tiles[tileIndex];
  return !!tile && tile.ownerId === playerId && !groupHasBuildings(state, tileIndex);
}

export function validateTrade(
  state: GameState,
  offer: Omit<TradeOffer, 'id' | 'status'>
): string | null {
  const proposer = state.players[offer.proposerId];
  const target = state.players[offer.targetId];
  if (state.phase !== 'PLAYING') return 'Trades are only possible during a game.';
  if (!proposer || !target || proposer.bankrupt || target.bankrupt) return 'Invalid trade partner.';
  if (offer.proposerId === offer.targetId) return 'You cannot trade with yourself.';
  const nums = [offer.offerCash, offer.requestCash, offer.offerJailCards, offer.requestJailCards];
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return 'Amounts must be positive.';
  if (offer.offerCash > proposer.cash) return `${proposer.name} does not have enough cash.`;
  if (offer.requestCash > target.cash) return `${target.name} does not have enough cash.`;
  if (offer.offerJailCards > proposer.jailCardsCount) return 'Not enough jail cards to offer.';
  if (offer.requestJailCards > target.jailCardsCount) return 'Partner does not have that many jail cards.';
  if (!offer.offerProperties.every((idx) => isTradeable(state, offer.proposerId, idx))) {
    return 'One of the offered properties cannot be traded.';
  }
  if (!offer.requestProperties.every((idx) => isTradeable(state, offer.targetId, idx))) {
    return 'One of the requested properties cannot be traded.';
  }
  const empty =
    offer.offerCash === 0 &&
    offer.requestCash === 0 &&
    offer.offerJailCards === 0 &&
    offer.requestJailCards === 0 &&
    offer.offerProperties.length === 0 &&
    offer.requestProperties.length === 0;
  if (empty) return 'The trade is empty.';
  return null;
}

/** Cash a player could raise right now by mortgaging every property that can be mortgaged. */
export function mortgageableValue(state: GameState, playerId: PlayerId): number {
  return ownedTiles(state, playerId)
    .filter((idx) => canMortgage(state, playerId, idx))
    .reduce((sum, idx) => sum + mortgageValue(idx), 0);
}

/** Cash a player could raise right now by selling every building and mortgaging everything. */
export function liquidationValue(state: GameState, playerId: PlayerId): number {
  let total = 0;
  for (const idx of ownedTiles(state, playerId)) {
    const def = getTile(idx);
    const tile = state.tiles[idx]!;
    if (def.houseCost && tile.houses > 0) {
      total += tile.houses * Math.floor(def.houseCost / 2);
    }
    if (!tile.mortgaged && state.settings.mortgageEnabled) total += mortgageValue(idx);
  }
  return total;
}

/**
 * The player an action is performed on behalf of. Used by the host to make sure
 * an online guest can only act for themselves.
 */
export function actorOfAction(state: GameState, action: GameAction): PlayerId | 'HOST' | 'ANY' {
  switch (action.type) {
    case 'ROLL_DICE':
    case 'BUY_PROPERTY':
    case 'DECLINE_PROPERTY':
    case 'DISMISS_CARD':
    case 'END_TURN':
      return getCurrentPlayerId(state) ?? 'HOST';
    case 'AUCTION_BID':
    case 'AUCTION_PASS':
    case 'PAY_JAIL_FINE':
    case 'USE_JAIL_CARD':
    case 'BUILD_HOUSE':
    case 'SELL_HOUSE':
    case 'MORTGAGE_PROPERTY':
    case 'UNMORTGAGE_PROPERTY':
    case 'RESOLVE_DEBT':
    case 'DECLARE_BANKRUPTCY':
    case 'SET_PLAYER_CONNECTED':
      return action.playerId;
    case 'PROPOSE_TRADE':
      return action.offer.proposerId;
    case 'ACCEPT_TRADE':
    case 'REJECT_TRADE':
    case 'COUNTER_TRADE':
      return findTrade(state, action.tradeId)?.targetId ?? 'HOST';
    case 'CANCEL_TRADE':
      return findTrade(state, action.tradeId)?.proposerId ?? 'HOST';
    case 'SEND_CHAT':
      return action.message.senderId;
    case 'UPDATE_PLAYER':
      return action.profile.id;
    case 'SET_PLAYER_TEAM':
      return action.playerId;
    default:
      // START_GAME, ADD_BOT, ADD_PLAYER, REMOVE_PLAYER, UPDATE_SETTINGS, RESET_GAME,
      // AUCTION_TICK, LAND_ON_TILE, SET_ROOM, SYNC_STATE are host-only.
      return 'HOST';
  }
}

/* ------------------------------ turn timer ------------------------------ */

export type DecisionKind = 'ROLL' | 'BUY' | 'CARD' | 'DEBT' | 'END';

/**
 * Who the game is currently waiting on (auctions have their own clock and are excluded).
 * Trade offers never block play, so they don't count.
 */
export function decisionOwner(state: GameState): { playerId: PlayerId; kind: DecisionKind } | null {
  if (state.phase !== 'PLAYING' || state.activeAuction) return null;
  const currentId = getCurrentPlayerId(state);
  if (!currentId) return null;
  switch (state.turnPhase) {
    case 'ROLL':
      return { playerId: currentId, kind: 'ROLL' };
    case 'AWAIT_BUY':
      return { playerId: currentId, kind: 'BUY' };
    case 'CARD_DRAWN':
      return { playerId: currentId, kind: 'CARD' };
    case 'DEBT':
      return { playerId: currentId, kind: 'DEBT' };
    case 'TURN_END':
      return { playerId: currentId, kind: 'END' };
    default:
      return null;
  }
}

/** Milliseconds allowed for the current decision (debts get twice as long). */
export function decisionTimeLimitMs(state: GameState, kind: DecisionKind): number {
  const base = state.settings.turnTimeoutSeconds * 1000;
  return kind === 'DEBT' ? base * 2 : base;
}
