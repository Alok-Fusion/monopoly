import { ActiveFestival, FestivalId, GameState, TileGroup } from '../types/game';
import { COLOR_GROUPS, getTile, GROUP_TILES, SALARY_AMOUNT } from './board';

/**
 * Festivals: every few rounds a city-wide event bends one rule for a full round,
 * so every player gets to exploit (or suffer) it exactly once. They're announced a
 * round ahead on the board, which gives players something to plan around.
 */

export const FESTIVAL_EVERY_N_ROUNDS = 3;

export interface FestivalDef {
  id: FestivalId;
  icon: string;
  title: string;
  describe: (group?: TileGroup) => string;
}

const GROUP_NAMES: Partial<Record<TileGroup, string>> = {
  brown: 'Brown',
  lightblue: 'Light blue',
  pink: 'Pink',
  orange: 'Orange',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  darkblue: 'Dark blue',
};

export const FESTIVALS: Record<FestivalId, FestivalDef> = {
  diwali: { id: 'diwali', icon: '🪔', title: 'Diwali Dhamaka', describe: () => 'Houses and hotels cost half price.' },
  monsoon: { id: 'monsoon', icon: '🌧️', title: 'Monsoon Season', describe: () => 'Utility rent is doubled.' },
  ipl: { id: 'ipl', icon: '🏏', title: 'IPL Fever', describe: () => 'Everyone is travelling to the match — railway rent is doubled.' },
  shaadi: {
    id: 'shaadi',
    icon: '💍',
    title: 'Shaadi Season',
    describe: (g) => `Wedding crowds everywhere — rent is doubled on the ${GROUP_NAMES[g ?? 'brown'] ?? ''} set.`,
  },
  startup: { id: 'startup', icon: '🚀', title: 'Startup Boom', describe: () => 'Passing Shuru pays double salary.' },
  taxraid: { id: 'taxraid', icon: '🕵️', title: 'Income Tax Raid', describe: () => 'Tax squares charge double.' },
  bandh: { id: 'bandh', icon: '✊', title: 'Bharat Bandh', describe: () => 'Everything is shut — no rent is collected anywhere.' },
  sale: { id: 'sale', icon: '🛍️', title: 'Great Indian Sale', describe: () => 'Unowned properties cost 25% less.' },
};

export function festivalText(f: ActiveFestival): { icon: string; title: string; description: string } {
  const def = FESTIVALS[f.id];
  return { icon: def.icon, title: def.title, description: def.describe(f.group) };
}

/** Rounds until the next festival starts (0 = one is running now). */
export function roundsUntilNextFestival(state: GameState): number {
  if (state.activeFestival) return 0;
  const n = FESTIVAL_EVERY_N_ROUNDS;
  return n - (state.round % n);
}

/** Pick a festival for the coming round, avoiding a repeat of the previous one. */
export function pickFestival(state: GameState, previous: FestivalId | null): ActiveFestival {
  const ids = (Object.keys(FESTIVALS) as FestivalId[]).filter((id) => id !== previous);
  const id = ids[Math.floor(Math.random() * ids.length)]!;
  let group: TileGroup | undefined;
  if (id === 'shaadi') {
    // Prefer a set somebody actually owns property in, so the event matters
    const owned = COLOR_GROUPS.filter((g) => GROUP_TILES[g].some((idx) => state.tiles[idx]?.ownerId));
    const pool = owned.length ? owned : COLOR_GROUPS;
    group = pool[Math.floor(Math.random() * pool.length)];
  }
  return { id, group, startedRound: state.round };
}

/* ------------------------- rule modifiers ------------------------- */

const is = (state: GameState, id: FestivalId) => state.activeFestival?.id === id;

export function priceOf(state: GameState, tileIndex: number): number {
  const price = getTile(tileIndex).price ?? 0;
  return is(state, 'sale') ? Math.floor(price * 0.75) : price;
}

export function houseCostOf(state: GameState, tileIndex: number): number {
  const cost = getTile(tileIndex).houseCost ?? 0;
  return is(state, 'diwali') ? Math.floor(cost / 2) : cost;
}

export function salaryOf(state: GameState): number {
  return is(state, 'startup') ? SALARY_AMOUNT * 2 : SALARY_AMOUNT;
}

export function taxOf(state: GameState, tileIndex: number): number {
  const tax = getTile(tileIndex).price ?? 100;
  return is(state, 'taxraid') ? tax * 2 : tax;
}

/** Multiplier applied to rent on this tile by the current festival, with a reason for the log. */
export function festivalRentModifier(state: GameState, tileIndex: number): { multiplier: number; reason?: string } {
  const f = state.activeFestival;
  if (!f) return { multiplier: 1 };
  const def = getTile(tileIndex);
  if (f.id === 'bandh') return { multiplier: 0, reason: 'Bharat Bandh — no rent today' };
  if (f.id === 'monsoon' && def.type === 'utility') return { multiplier: 2, reason: 'Monsoon Season' };
  if (f.id === 'ipl' && def.type === 'railway') return { multiplier: 2, reason: 'IPL Fever' };
  if (f.id === 'shaadi' && def.group === f.group) return { multiplier: 2, reason: 'Shaadi Season' };
  return { multiplier: 1 };
}
