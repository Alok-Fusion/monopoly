import { TileGroup } from '../types/game';

/** Colour for each property set (also used for railways/utilities). */
export const GROUP_COLORS: Record<TileGroup, string> = {
  brown: '#9A5B3C',
  lightblue: '#38BDF8',
  pink: '#EC4899',
  orange: '#F97316',
  red: '#E11D48',
  yellow: '#EAB308',
  green: '#16A34A',
  darkblue: '#4338CA',
  railway: '#334155',
  utility: '#0891B2',
  special: '#94A3B8',
};

export const GROUP_LABELS: Record<TileGroup, string> = {
  brown: 'Brown',
  lightblue: 'Light blue',
  pink: 'Pink',
  orange: 'Orange',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  darkblue: 'Dark blue',
  railway: 'Railways',
  utility: 'Utilities',
  special: 'Special',
};

/** Small landmark emblem shown on each tile. */
export const TILE_EMBLEMS: Record<number, string> = {
  1: '🍢',
  3: '💍',
  4: '🧾',
  5: '🚂',
  6: '🏰',
  8: '🪁',
  9: '🍲',
  11: '🌊',
  12: '⚡',
  13: '🌳',
  14: '⛵',
  15: '🚉',
  16: '🍛',
  18: '🎓',
  19: '🏖️',
  21: '🎨',
  23: '🌉',
  24: '🛕',
  25: '🚄',
  26: '💻',
  27: '🚀',
  28: '💧',
  29: '🏙️',
  31: '🎬',
  32: '🌃',
  34: '🏛️',
  35: '🚆',
  37: '🌅',
  38: '💸',
  39: '💎',
};
