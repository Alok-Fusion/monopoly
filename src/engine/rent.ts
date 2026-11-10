import { GameState, PlayerId } from '../types/game';
import { getTile, GROUP_TILES, isColorGroup, RAILWAY_RENTS } from './board';
import { festivalRentModifier } from './festivals';

export interface RentCalculation {
  rent: number;
  reason: string;
  isTeammate: boolean;
  isOwner: boolean;
  isMortgaged: boolean;
}

/**
 * Checks if a player (or their team in TEAMS mode) owns all tiles in a group
 */
export function hasMonopoly(
  state: GameState,
  ownerId: PlayerId,
  group: string
): boolean {
  const tileIndexes = GROUP_TILES[group as keyof typeof GROUP_TILES];
  if (!tileIndexes) return false;

  const owner = state.players[ownerId];
  if (!owner) return false;

  const isTeamMode = state.settings.mode === 'TEAMS' && !!owner.teamId;

  return tileIndexes.every((idx) => {
    const tileState = state.tiles[idx];
    if (!tileState || !tileState.ownerId) return false;

    if (isTeamMode) {
      const tileOwner = state.players[tileState.ownerId];
      return tileOwner && tileOwner.teamId === owner.teamId;
    } else {
      return tileState.ownerId === ownerId;
    }
  });
}

/**
 * Computes rent owed when landing on a tile, including any festival modifier.
 */
export function calculateRent(
  state: GameState,
  tileIndex: number,
  landingPlayerId: PlayerId,
  diceTotal: number = 7
): RentCalculation {
  const base = baseRent(state, tileIndex, landingPlayerId, diceTotal);
  if (base.rent <= 0) return base;
  const mod = festivalRentModifier(state, tileIndex);
  if (mod.multiplier === 1) return base;
  return {
    ...base,
    rent: Math.floor(base.rent * mod.multiplier),
    reason: mod.multiplier === 0 ? mod.reason ?? base.reason : `${base.reason} · ${mod.reason} ×${mod.multiplier}`,
  };
}

function baseRent(
  state: GameState,
  tileIndex: number,
  landingPlayerId: PlayerId,
  diceTotal: number = 7
): RentCalculation {
  const tileDef = getTile(tileIndex);
  const tileState = state.tiles[tileIndex];

  if (!tileState || !tileState.ownerId) {
    return { rent: 0, reason: 'Unowned', isTeammate: false, isOwner: false, isMortgaged: false };
  }

  const ownerId = tileState.ownerId;
  const owner = state.players[ownerId];
  const landingPlayer = state.players[landingPlayerId];

  if (!owner || !landingPlayer) {
    return { rent: 0, reason: 'Invalid player', isTeammate: false, isOwner: false, isMortgaged: false };
  }

  if (ownerId === landingPlayerId) {
    return { rent: 0, reason: 'You own this property', isTeammate: false, isOwner: true, isMortgaged: false };
  }

  // Team mode immunity
  if (
    state.settings.mode === 'TEAMS' &&
    owner.teamId &&
    landingPlayer.teamId &&
    owner.teamId === landingPlayer.teamId
  ) {
    return {
      rent: 0,
      reason: 'Teammates do not pay rent to each other!',
      isTeammate: true,
      isOwner: false,
      isMortgaged: false,
    };
  }

  // If mortgaged, no rent
  if (tileState.mortgaged) {
    return {
      rent: 0,
      reason: 'Property is currently mortgaged (no rent)',
      isTeammate: false,
      isOwner: false,
      isMortgaged: true,
    };
  }

  // If owner is in jail and rule is active: Don't collect rent while in prison
  if (state.settings.noRentInJail && owner.inJail) {
    return {
      rent: 0,
      reason: `${owner.name} is serving time in prison (No rent collected)`,
      isTeammate: false,
      isOwner: false,
      isMortgaged: false,
    };
  }

  // Railway Rent
  if (tileDef.type === 'railway') {
    const isTeamMode = state.settings.mode === 'TEAMS' && !!owner.teamId;
    let count = 0;
    GROUP_TILES.railway.forEach((rIdx) => {
      const rState = state.tiles[rIdx];
      if (rState?.ownerId) {
        if (isTeamMode) {
          const rOwner = state.players[rState.ownerId];
          if (rOwner && rOwner.teamId === owner.teamId) count++;
        } else if (rState.ownerId === ownerId) {
          count++;
        }
      }
    });

    const index = Math.min(Math.max(count - 1, 0), RAILWAY_RENTS.length - 1);
    const rentVal = RAILWAY_RENTS[index] ?? 25;
    return {
      rent: rentVal,
      reason: `${owner.name} owns ${count} railway station${count > 1 ? 's' : ''}`,
      isTeammate: false,
      isOwner: false,
      isMortgaged: false,
    };
  }

  // Utility Rent
  if (tileDef.type === 'utility') {
    const isTeamMode = state.settings.mode === 'TEAMS' && !!owner.teamId;
    let count = 0;
    GROUP_TILES.utility.forEach((uIdx) => {
      const uState = state.tiles[uIdx];
      if (uState?.ownerId) {
        if (isTeamMode) {
          const uOwner = state.players[uState.ownerId];
          if (uOwner && uOwner.teamId === owner.teamId) count++;
        } else if (uState.ownerId === ownerId) {
          count++;
        }
      }
    });

    const multiplier = count >= 2 ? 10 : 4;
    const rentVal = diceTotal * multiplier;
    return {
      rent: rentVal,
      reason: `${owner.name} owns ${count} utility (${multiplier}x dice roll of ${diceTotal})`,
      isTeammate: false,
      isOwner: false,
      isMortgaged: false,
    };
  }

  // Standard Street Property Rent
  if (tileDef.type === 'property' && tileDef.rent) {
    const houses = tileState.houses;
    if (houses > 0) {
      const rentVal = tileDef.rent[houses] ?? tileDef.rent[0]!;
      const houseLabel = houses === 5 ? 'Mall/Hotel' : `${houses} house${houses > 1 ? 's' : ''}`;
      return {
        rent: rentVal,
        reason: `${owner.name} has ${houseLabel} built here`,
        isTeammate: false,
        isOwner: false,
        isMortgaged: false,
      };
    }

    // Unimproved: check if owner (or team) holds full color group monopoly
    const fullSet = isColorGroup(tileDef.group) && hasMonopoly(state, ownerId, tileDef.group);
    const baseRent = tileDef.rent[0] ?? 0;
    const shouldDouble = fullSet && state.settings.doubleRentOnSet;
    const rentVal = shouldDouble ? baseRent * 2 : baseRent;
    const reason = fullSet
      ? shouldDouble
        ? `${owner.name} owns the entire color group! (Double base rent)`
        : `${owner.name} owns the color group (x2 rent off)`
      : `Base unimproved rent`;

    return {
      rent: rentVal,
      reason,
      isTeammate: false,
      isOwner: false,
      isMortgaged: false,
    };
  }

  return { rent: 0, reason: '', isTeammate: false, isOwner: false, isMortgaged: false };
}

/**
 * Compute total net worth of a player (Cash + property purchase prices + house costs)
 */
export function calculateNetWorth(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return 0;

  let total = player.cash;

  Object.entries(state.tiles).forEach(([tileIndexStr, tileState]) => {
    if (tileState.ownerId === playerId) {
      const tileDef = getTile(parseInt(tileIndexStr, 10));
      if (tileState.mortgaged) {
        total += Math.round((tileDef.price ?? 0) / 2);
      } else {
        total += tileDef.price ?? 0;
        if (tileDef.houseCost && tileState.houses > 0) {
          total += tileState.houses * tileDef.houseCost;
        }
      }
    }
  });

  return total;
}
