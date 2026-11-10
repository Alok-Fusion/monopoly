import React from 'react';
import { GameState, PlayerId, PlayerState } from '../../types/game';
import { TOKEN_EMOJIS } from './PlayerToken';

/**
 * All player tokens, drawn in one layer above the board instead of inside each tile.
 * That way a crowded tile never squashes or clips them: every player on a tile gets
 * their own spot, and tokens glide from tile to tile as they move.
 */

/** Grid tracks of the board: corners are 1.45× an ordinary tile. */
const TRACK = [1.45, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.45];
const TOTAL = TRACK.reduce((a, b) => a + b, 0);
const START = TRACK.map((_, i) => TRACK.slice(0, i).reduce((a, b) => a + b, 0));

type Side = 'bottom' | 'left' | 'top' | 'right' | 'corner';

/** Grid cell (1-based column/row) and side of the board for a tile index. */
function cellOf(index: number): { col: number; row: number; side: Side } {
  if (index === 0) return { col: 11, row: 11, side: 'corner' };
  if (index < 10) return { col: 11 - index, row: 11, side: 'bottom' };
  if (index === 10) return { col: 1, row: 11, side: 'corner' };
  if (index < 20) return { col: 1, row: 21 - index, side: 'left' };
  if (index === 20) return { col: 1, row: 1, side: 'corner' };
  if (index < 30) return { col: index - 19, row: 1, side: 'top' };
  if (index === 30) return { col: 11, row: 1, side: 'corner' };
  return { col: 11, row: index - 29, side: 'right' };
}

/** A tile's box as percentages of the board. */
export function boxOf(index: number) {
  const { col, row, side } = cellOf(index);
  return {
    side,
    left: (START[col - 1]! / TOTAL) * 100,
    top: (START[row - 1]! / TOTAL) * 100,
    w: (TRACK[col - 1]! / TOTAL) * 100,
    h: (TRACK[row - 1]! / TOTAL) * 100,
  };
}

/** Offsets for n tokens in a grid: `across` per row, rows stacked along the other axis. */
function grid(n: number, across: number, gapAcross: number, gapAlong: number): [number, number][] {
  const rows = Math.ceil(n / across);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / across);
    const inRow = r === rows - 1 ? n - r * across : across;
    const c = i % across;
    out.push([(c - (inRow - 1) / 2) * gapAcross, (r - (rows - 1) / 2) * gapAlong]);
  }
  return out;
}

/** Where (in % of the board) the i-th of n tokens on a tile stands. */
export function slotsFor(index: number, n: number, jailed: boolean): [number, number][] {
  const b = boxOf(index);
  const cx = b.left + b.w / 2;
  const cy = b.top + b.h / 2;
  const tight = n > 6;

  if (index === 10) {
    if (jailed) {
      // Behind bars: the cell in the inner corner of the tile
      const ox = b.left + b.w * 0.66;
      const oy = b.top + b.h * 0.34;
      const crowded = n > 4;
      return grid(n, crowded ? 3 : 2, crowded ? 2.7 : 3.7, crowded ? 2.9 : 3.7).map(([dx, dy]) => [ox + dx, oy + dy]);
    }
    // Just visiting: the L-shaped outer lane — along the bottom strip from its corner,
    // then up the left side. Up to 5 visitors stand a full token apart.
    const along = n <= 5 ? [0.16, 0.48, 0.8] : n <= 7 ? [0.16, 0.4, 0.64, 0.88] : [0.16, 0.35, 0.54, 0.73, 0.92];
    const up = n <= 5 ? [0.52, 0.2] : [0.6, 0.36, 0.12];
    const lane: [number, number][] = [...along.map((x): [number, number] => [x, 0.84]), ...up.map((y): [number, number] => [0.16, y])];
    return lane.slice(0, n).map(([tx, ty]) => [b.left + b.w * tx, b.top + b.h * ty]);
  }

  if (b.side === 'corner') {
    // Lower part of the corner, so its name and icon stay readable
    const oy = b.top + b.h * (n > 6 ? 0.56 : 0.68);
    return grid(n, n <= 4 ? 2 : 3, 3.9, 3.9).map(([dx, dy]) => [cx + dx, oy + dy]);
  }

  // Ordinary tiles are long and narrow: two across, stacked along the long side
  const across = n === 1 ? 1 : 2;
  // Spots are a token apart (3.6% of the board), so nobody hides behind anybody else
  const along = tight ? 2.9 : 3.75;
  const offsets = grid(n, across, 3.9, along);
  const vertical = b.side === 'left' || b.side === 'right';
  return offsets.map(([a, l]) => (vertical ? [cx + l, cy + a] : [cx + a, cy + l]));
}

interface Props {
  state: GameState;
  displayPositions: Record<PlayerId, number>;
  currentPlayerId?: PlayerId;
  localPlayerId: PlayerId;
  hoveredPlayerId: PlayerId | null;
  onTileClick: (index: number) => void;
}

export const BoardTokens: React.FC<Props> = ({ state, displayPositions, currentPlayerId, localPlayerId, hoveredPlayerId, onTileClick }) => {
  // Group by tile (and, at the jail, by cell vs. lane) in seat order so spots are stable
  const groups = new Map<string, PlayerState[]>();
  state.playerOrder.forEach((id) => {
    const p = state.players[id];
    if (!p || p.bankrupt) return;
    const pos = displayPositions[id] ?? p.position;
    const key = pos === 10 ? `10:${p.inJail ? 'cell' : 'lane'}` : String(pos);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  });

  const placed: { p: PlayerState; pos: number; x: number; y: number }[] = [];
  groups.forEach((players, key) => {
    const pos = Number(key.split(':')[0]);
    const slots = slotsFor(pos, players.length, key.endsWith('cell'));
    players.forEach((p, i) => {
      const [x, y] = slots[i] ?? slots[slots.length - 1] ?? [50, 50];
      placed.push({ p, pos, x, y });
    });
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden="true">
      {placed.map(({ p, pos, x, y }) => {
        const isCurrent = p.id === currentPlayerId;
        const isMe = p.id === localPlayerId;
        const isHovered = p.id === hoveredPlayerId;
        const dim = !!hoveredPlayerId && !isHovered;
        const token = TOKEN_EMOJIS[p.tokenId] ?? { emoji: '♟️', label: 'Token' };
        return (
          <span
            key={p.id}
            className="board-token-slot pointer-events-auto absolute cursor-pointer"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              zIndex: isHovered ? 40 : isCurrent ? 30 : isMe ? 25 : 20,
              opacity: dim ? 0.35 : 1,
            }}
            title={`${p.name}${isMe ? ' (you)' : ''}${p.inJail ? ' · in jail' : ''}`}
            onClick={() => onTileClick(pos)}
          >
            {/* Re-keyed on every step so the token hops as it walks */}
            <span
              key={pos}
              className={`board-token2 animate-token-hop ${isCurrent ? 'board-token2-current' : ''} ${isMe ? 'board-token2-me' : ''} ${isHovered ? 'board-token2-hovered' : ''}`}
              style={{ '--token': p.color } as React.CSSProperties}
            >
              <span className="board-token2-face">{token.emoji}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
};
