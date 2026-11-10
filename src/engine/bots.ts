import { BotDifficulty, GameAction, GameState, PlayerId, TradeOffer } from '../types/game';
import { COLOR_GROUPS, getTile, GROUP_TILES, isColorGroup, JAIL_FINE } from './board';
import { hasMonopoly } from './rent';
import { houseCostOf, priceOf } from './festivals';
import {
  MIN_BID_STEP,
  canBuildHouse,
  canMortgage,
  canSellHouse,
  canUnmortgage,
  getCurrentPlayerId,
  isTradeable,
  MAX_COUNTER_OFFERS,
  openTradeBetween,
  openTrades,
  validateTrade,
  ownedTiles,
  unmortgageCost,
} from './rules';

interface Personality {
  /** Cash the bot tries to keep in hand after a purchase */
  reserve: number;
  /** Max auction bid as a fraction of list price */
  auctionCap: number;
  /** Extra appetite for a property that helps complete a set */
  setBonus: number;
  /** Trade must be worth this multiple of what the bot gives away */
  tradeGreed: number;
  /** Extra share of the price demanded when selling the last piece of someone else's set */
  completionPenalty: number;
  /** Most the bot will pay (as a multiple of list price) for the last piece of its own set */
  maxOfferMultiple: number;
}

const PERSONALITY: Record<BotDifficulty, Personality> = {
  easy: { reserve: 250, auctionCap: 0.7, setBonus: 1.1, tradeGreed: 1.0, completionPenalty: 0.3, maxOfferMultiple: 1.5 },
  normal: { reserve: 150, auctionCap: 0.95, setBonus: 1.35, tradeGreed: 1.1, completionPenalty: 0.5, maxOfferMultiple: 1.9 },
  hard: { reserve: 80, auctionCap: 1.15, setBonus: 1.7, tradeGreed: 1.2, completionPenalty: 0.8, maxOfferMultiple: 2.3 },
};

/** Rounds a bot waits before making another trade offer. */
const TRADE_COOLDOWN_ROUNDS = 3;

function personalityOf(state: GameState, botId: PlayerId): Personality {
  return PERSONALITY[state.players[botId]?.botDifficulty ?? 'normal'];
}

/** How many tiles of this tile's group the player (or their team) already holds. */
function ownedInGroup(state: GameState, playerId: PlayerId, tileIndex: number): number {
  const def = getTile(tileIndex);
  const group = GROUP_TILES[def.group] ?? [];
  const player = state.players[playerId];
  const teamMode = state.settings.mode === 'TEAMS' && !!player?.teamId;
  return group.filter((idx) => {
    const ownerId = state.tiles[idx]?.ownerId;
    if (!ownerId) return false;
    if (ownerId === playerId) return true;
    return teamMode && state.players[ownerId]?.teamId === player?.teamId;
  }).length;
}

function propertyValue(state: GameState, playerId: PlayerId, tileIndex: number): number {
  const def = getTile(tileIndex);
  const p = personalityOf(state, playerId);
  let value = def.price ?? 0;
  if (state.tiles[tileIndex]?.mortgaged) value *= 0.5;
  const groupSize = (GROUP_TILES[def.group] ?? []).length;
  const held = ownedInGroup(state, playerId, tileIndex);
  if (isColorGroup(def.group) && held > 0) value *= held + 1 >= groupSize ? p.setBonus * 1.3 : p.setBonus;
  if (def.type === 'railway' && held > 0) value *= 1 + held * 0.2;
  return value;
}

function wantsToBuy(state: GameState, botId: PlayerId, tileIndex: number): boolean {
  const bot = state.players[botId]!;
  const price = priceOf(state, tileIndex);
  const p = personalityOf(state, botId);
  if (bot.cash < price) return false;
  const helpsSet = ownedInGroup(state, botId, tileIndex) > 0;
  if (helpsSet) return bot.cash - price >= p.reserve * 0.4;
  return bot.cash - price >= p.reserve;
}

function completesSet(state: GameState, playerId: PlayerId, tileIndex: number): boolean {
  const def = getTile(tileIndex);
  if (!isColorGroup(def.group)) return false;
  return ownedInGroup(state, playerId, tileIndex) + 1 >= (GROUP_TILES[def.group] ?? []).length;
}

/** What the trade is worth to the bot: positive surplus means it likes the deal. */
function tradeSurplus(state: GameState, botId: PlayerId, trade: TradeOffer): { receive: number; give: number } {
  const p = personalityOf(state, botId);
  const proposerId = trade.proposerId;
  let receive = trade.offerCash + trade.offerJailCards * JAIL_FINE;
  trade.offerProperties.forEach((idx) => {
    const base = propertyValue(state, botId, idx);
    // The last piece of our own set is worth up to what we'd offer for it ourselves
    const setValue = completesSet(state, botId, idx) ? (getTile(idx).price ?? 0) * p.maxOfferMultiple : 0;
    receive += Math.max(base, setValue);
  });
  let give = trade.requestCash + trade.requestJailCards * JAIL_FINE;
  trade.requestProperties.forEach((idx) => {
    give += getTile(idx).price ?? 0;
    if (completesSet(state, proposerId, idx)) give += (getTile(idx).price ?? 0) * p.completionPenalty;
  });
  return { receive, give: give * p.tradeGreed };
}

/**
 * Instead of a flat no, ask for the extra cash that would make the deal worth it.
 * Returns null when no reasonable counter exists.
 */
function counterOffer(state: GameState, botId: PlayerId, trade: TradeOffer): GameAction | null {
  if ((trade.counterCount ?? 0) >= Math.min(2, MAX_COUNTER_OFFERS)) return null;
  const bot = state.players[botId]!;
  const other = state.players[trade.proposerId];
  if (!other) return null;
  const { receive, give } = tradeSurplus(state, botId, trade);
  const gap = give - receive;
  if (gap <= 0) return null;

  // First try trimming what we pay out, then ask them for cash on top
  let requestCash = trade.offerCash; // what they were going to pay us
  let offerCash = trade.requestCash; // what they wanted from us
  let remaining = Math.ceil(gap / 10) * 10;
  const trim = Math.min(offerCash, remaining);
  offerCash -= trim;
  remaining -= trim;
  requestCash += remaining;
  if (requestCash > other.cash) return null;
  if (offerCash > bot.cash) return null;
  // Don't haggle over a deal that would leave the bot short of cash to operate
  if (bot.cash - offerCash < 50) return null;

  return {
    type: 'COUNTER_TRADE',
    tradeId: trade.id,
    offer: {
      proposerId: botId,
      targetId: trade.proposerId,
      offerCash,
      offerProperties: trade.requestProperties,
      offerJailCards: trade.requestJailCards,
      requestCash,
      requestProperties: trade.offerProperties,
      requestJailCards: trade.offerJailCards,
    },
  };
}

function evaluateTrade(state: GameState, botId: PlayerId, trade: TradeOffer): boolean {
  const p = personalityOf(state, botId);
  const proposerId = trade.proposerId;
  let receive = trade.offerCash + trade.offerJailCards * JAIL_FINE;
  trade.offerProperties.forEach((idx) => {
    const base = propertyValue(state, botId, idx);
    const setValue = completesSet(state, botId, idx) ? (getTile(idx).price ?? 0) * p.maxOfferMultiple : 0;
    receive += Math.max(base, setValue);
  });

  let give = trade.requestCash + trade.requestJailCards * JAIL_FINE;
  trade.requestProperties.forEach((idx) => {
    give += getTile(idx).price ?? 0;
    // Never hand over the piece that completes the opponent's set cheaply
    const def = getTile(idx);
    const group = GROUP_TILES[def.group] ?? [];
    if (isColorGroup(def.group) && ownedInGroup(state, proposerId, idx) + 1 >= group.length) {
      give += (def.price ?? 0) * p.completionPenalty;
    }
  });

  const bot = state.players[botId]!;
  if (bot.cash - trade.requestCash < 50) return false;
  if (give === 0) return receive > 0;
  return receive >= give * p.tradeGreed;
}

function isTeammate(state: GameState, a: PlayerId, b: PlayerId): boolean {
  if (state.settings.mode !== 'TEAMS') return false;
  const ta = state.players[a]?.teamId;
  return !!ta && ta === state.players[b]?.teamId;
}

/**
 * If the bot is one property away from a full colour set and another player holds
 * that last piece, offer to buy it — sweetened with a spare property when short of cash.
 */
function setCompletingOffer(state: GameState, botId: PlayerId): GameAction | null {
  // One deal at a time per bot keeps the trade board readable
  if (openTrades(state).some((t) => t.proposerId === botId)) return null;
  const bot = state.players[botId]!;
  if (bot.lastTradeRound !== undefined && state.round - bot.lastTradeRound < TRADE_COOLDOWN_ROUNDS) return null;
  const p = personalityOf(state, botId);

  // Most valuable sets first
  for (const group of [...COLOR_GROUPS].reverse()) {
    const tiles = GROUP_TILES[group];
    const missing = tiles.filter((idx) => {
      const ownerId = state.tiles[idx]?.ownerId;
      return !ownerId || (ownerId !== botId && !isTeammate(state, botId, ownerId));
    });
    if (missing.length !== 1 || missing.length === tiles.length) continue;
    const target = missing[0]!;
    const ownerId = state.tiles[target]?.ownerId;
    if (!ownerId) continue; // still with the bank: just land on it
    const owner = state.players[ownerId];
    if (!owner || owner.bankrupt || !isTradeable(state, ownerId, target)) continue;
    if (openTradeBetween(state, botId, ownerId)) continue;

    const price = getTile(target).price ?? 0;
    const offer = Math.floor((price * p.maxOfferMultiple) / 10) * 10;
    const spendable = bot.cash - p.reserve;
    if (spendable >= offer) {
      return {
        type: 'PROPOSE_TRADE',
        offer: {
          proposerId: botId,
          targetId: ownerId,
          offerCash: offer,
          offerProperties: [],
          offerJailCards: 0,
          requestCash: 0,
          requestProperties: [target],
          requestJailCards: 0,
        },
      };
    }

    // Short on cash: add a lone property that doesn't help any of our sets
    const sweetener = ownedTiles(state, botId)
      .filter((idx) => isTradeable(state, botId, idx) && getTile(idx).group !== group && ownedInGroup(state, botId, idx) === 1)
      .filter((idx) => !state.tiles[idx]?.mortgaged)
      .sort((a, b) => (getTile(b).price ?? 0) - (getTile(a).price ?? 0))
      .find((idx) => (getTile(idx).price ?? 0) + Math.max(0, spendable) >= offer);
    if (sweetener !== undefined) {
      const cash = Math.max(0, Math.min(Math.max(0, spendable), offer - (getTile(sweetener).price ?? 0)));
      return {
        type: 'PROPOSE_TRADE',
        offer: {
          proposerId: botId,
          targetId: ownerId,
          offerCash: Math.floor(cash / 10) * 10,
          offerProperties: [sweetener],
          offerJailCards: 0,
          requestCash: 0,
          requestProperties: [target],
          requestJailCards: 0,
        },
      };
    }
  }
  return null;
}

function raiseMoneyAction(state: GameState, botId: PlayerId): GameAction | null {
  const tiles = ownedTiles(state, botId);
  // Sell buildings first (cheapest sets first), keeping even-build order valid
  const sellable = tiles
    .filter((idx) => canSellHouse(state, botId, idx))
    .sort((a, b) => (getTile(a).houseCost ?? 0) - (getTile(b).houseCost ?? 0));
  if (sellable.length) return { type: 'SELL_HOUSE', playerId: botId, tileIndex: sellable[0]! };

  // Then mortgage, starting with tiles that don't help a set
  const mortgageable = tiles
    .filter((idx) => canMortgage(state, botId, idx))
    .sort((a, b) => propertyValue(state, botId, a) - propertyValue(state, botId, b));
  if (mortgageable.length) return { type: 'MORTGAGE_PROPERTY', playerId: botId, tileIndex: mortgageable[0]! };
  return null;
}

/**
 * Returns the next thing this bot wants to do, or null if it has nothing to do right now.
 * `autopilot` lets the bot logic play for a human who disconnected mid-game.
 */
export function getBotNextAction(state: GameState, botId: PlayerId, autopilot = false): GameAction | null {
  const bot = state.players[botId];
  if (!bot || bot.bankrupt || (!bot.isBot && !autopilot) || state.phase !== 'PLAYING') return null;
  const p = personalityOf(state, botId);

  // 1. Incoming trade offers
  const trade = openTrades(state).find((t) => t.targetId === botId);
  if (trade) {
    // Can't go through as things stand (someone's short of cash, buildings in the way...)
    if (validateTrade(state, trade)) return { type: 'REJECT_TRADE', tradeId: trade.id };
    if (evaluateTrade(state, botId, trade)) return { type: 'ACCEPT_TRADE', tradeId: trade.id };
    return counterOffer(state, botId, trade) ?? { type: 'REJECT_TRADE', tradeId: trade.id };
  }

  // 2. Auctions (can happen on anyone's turn)
  const auction = state.activeAuction;
  if (auction) {
    if (!auction.activeBidderIds.includes(botId) || auction.highestBidderId === botId) return null;
    const def = getTile(auction.tileIndex);
    const price = def.price ?? 100;
    const helps = ownedInGroup(state, botId, auction.tileIndex) > 0;
    const cap = Math.floor(price * p.auctionCap * (helps ? p.setBonus : 1));
    const step = auction.highestBid < price * 0.5 ? MIN_BID_STEP * 2 : MIN_BID_STEP;
    const bid = auction.highestBid + step;
    const affordable = bot.cash - bid >= Math.min(p.reserve, 60);
    if (bid <= cap && affordable) return { type: 'AUCTION_BID', playerId: botId, amount: bid };
    return { type: 'AUCTION_PASS', playerId: botId };
  }

  if (getCurrentPlayerId(state) !== botId) return null;

  switch (state.turnPhase) {
    case 'ROLL': {
      if (bot.inJail) {
        if (bot.jailCardsCount > 0) return { type: 'USE_JAIL_CARD', playerId: botId };
        // Early in the game it pays to get out and buy; later, jail is a safe place to sit.
        const unowned = Object.values(state.tiles).filter((t, i) => !t.ownerId && getTile(i).price).length;
        if (unowned > 8 && bot.cash >= JAIL_FINE + p.reserve) return { type: 'PAY_JAIL_FINE', playerId: botId };
      }
      return { type: 'ROLL_DICE' };
    }

    case 'AWAIT_BUY':
      return wantsToBuy(state, botId, bot.position)
        ? { type: 'BUY_PROPERTY', tileIndex: bot.position }
        : { type: 'DECLINE_PROPERTY', tileIndex: bot.position };

    case 'CARD_DRAWN':
      return { type: 'DISMISS_CARD' };

    case 'DEBT': {
      if (bot.cash >= state.debtAmount) return { type: 'RESOLVE_DEBT', playerId: botId };
      return raiseMoneyAction(state, botId) ?? { type: 'DECLARE_BANKRUPTCY', playerId: botId };
    }

    case 'TURN_END': {
      const tiles = ownedTiles(state, botId);
      // Try to buy the last piece of a set before anything else
      const deal = setCompletingOffer(state, botId);
      if (deal) return deal;

      // Pay off mortgages on set pieces when flush
      const unmortgage = tiles.find(
        (idx) =>
          canUnmortgage(state, botId, idx) &&
          bot.cash - unmortgageCost(idx) >= p.reserve * 2 &&
          (isColorGroup(getTile(idx).group) ? hasMonopoly(state, botId, getTile(idx).group) : true)
      );
      if (unmortgage !== undefined) return { type: 'UNMORTGAGE_PROPERTY', playerId: botId, tileIndex: unmortgage };

      // Build on the most expensive set we can afford, evenly
      const buildable = tiles
        .filter((idx) => canBuildHouse(state, botId, idx))
        .filter((idx) => bot.cash - houseCostOf(state, idx) >= p.reserve)
        .sort((a, b) => (getTile(b).houseCost ?? 0) - (getTile(a).houseCost ?? 0));
      if (buildable.length) return { type: 'BUILD_HOUSE', playerId: botId, tileIndex: buildable[0]! };

      return { type: 'END_TURN' };
    }

    default:
      return null;
  }
}
