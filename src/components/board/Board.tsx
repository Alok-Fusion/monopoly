import React from 'react';
import { GameState, PlayerId } from '../../types/game';
import { getTile } from '../../engine/board';
import { getCurrentPlayerId } from '../../engine/rules';
import { Tile, TileOrientation } from './Tile';
import { CornerTile } from './CornerTile';
import { CenterBoard, FloatingEmote } from './CenterBoard';
import { BoardTokens } from './BoardTokens';
import { getTeamColor } from '../../lib/format';

interface Props {
  state: GameState;
  localPlayerId: PlayerId;
  hoveredPlayerId: PlayerId | null;
  displayPositions: Record<PlayerId, number>;
  isRolling: boolean;
  isAnimating: boolean;
  floatingEmotes: FloatingEmote[];
  msLeft: number | null;
  timerFor?: string;
  reconnectWait?: { name: string; secondsLeft: number };
  onSkipReconnectWait?: () => void;
  onTileClick: (index: number) => void;
  onRoll: () => void;
  onEndTurn: () => void;
  onOpenTrade: () => void;
  onOpenPropertyManager: () => void;
  onSendEmote: (emoji: string) => void;
}

/** [tileIndex, gridColumn, gridRow, orientation] for the 36 non-corner tiles. */
const EDGE_TILES: [number, number, number, TileOrientation][] = [
  // Bottom row, right to left: 1..9
  ...Array.from({ length: 9 }, (_, i) => [i + 1, 10 - i, 11, 'bottom'] as [number, number, number, TileOrientation]),
  // Left column, bottom to top: 11..19
  ...Array.from({ length: 9 }, (_, i) => [i + 11, 1, 10 - i, 'left'] as [number, number, number, TileOrientation]),
  // Top row, left to right: 21..29
  ...Array.from({ length: 9 }, (_, i) => [i + 21, i + 2, 1, 'top'] as [number, number, number, TileOrientation]),
  // Right column, top to bottom: 31..39
  ...Array.from({ length: 9 }, (_, i) => [i + 31, 11, i + 2, 'right'] as [number, number, number, TileOrientation]),
];

const CORNERS: [number, number, number][] = [
  [0, 11, 11],
  [10, 1, 11],
  [20, 1, 1],
  [30, 11, 1],
];

export const Board: React.FC<Props> = ({
  state,
  localPlayerId,
  hoveredPlayerId,
  displayPositions,
  isRolling,
  isAnimating,
  floatingEmotes,
  msLeft,
  timerFor,
  reconnectWait,
  onSkipReconnectWait,
  onTileClick,
  onRoll,
  onEndTurn,
  onOpenTrade,
  onOpenPropertyManager,
  onSendEmote,
}) => {
  const teamMode = state.settings.mode === 'TEAMS';

  const hovered = hoveredPlayerId ? state.players[hoveredPlayerId] : null;
  const ownerColorOf = (index: number): string | undefined => {
    const ownerId = state.tiles[index]?.ownerId;
    const owner = ownerId ? state.players[ownerId] : undefined;
    if (!owner) return undefined;
    return teamMode && owner.teamId ? getTeamColor(owner.teamId) : owner.color;
  };
  const isHighlighted = (index: number) => {
    if (!hovered) return false;
    const ownerId = state.tiles[index]?.ownerId;
    if (!ownerId) return false;
    if (teamMode && hovered.teamId) return state.players[ownerId]?.teamId === hovered.teamId;
    return ownerId === hovered.id;
  };

  const current = state.players[getCurrentPlayerId(state) ?? ''];
  const currentPos = current ? displayPositions[current.id] ?? current.position : -1;

  return (
    <div className="board board-frame relative mx-auto aspect-square w-full rounded-[22px] p-[0.9%]" style={{ maxWidth: 'min(100%, var(--board-max, 100%))' }}>
      <div className="relative h-full w-full">
      <div
        className="grid h-full w-full gap-px overflow-hidden rounded-[15px] bg-paper-400/90"
        style={{
          gridTemplateColumns: 'minmax(0,1.45fr) repeat(9, minmax(0,1fr)) minmax(0,1.45fr)',
          gridTemplateRows: 'minmax(0,1.45fr) repeat(9, minmax(0,1fr)) minmax(0,1.45fr)',
        }}
      >
        {CORNERS.map(([idx, col, row]) => (
          <div key={idx} className="min-h-0 min-w-0" style={{ gridColumn: col, gridRow: row }}>
            <CornerTile
              definition={getTile(idx)}
              isCurrentPosition={currentPos === idx}
              vacationPool={state.vacationPool}
              vacationEnabled={state.settings.vacationCash}
              chaiRest={!!state.settings.chaiBreakRest}
              onClick={() => onTileClick(idx)}
            />
          </div>
        ))}

        {EDGE_TILES.map(([idx, col, row, orientation]) => (
          <div key={idx} className="min-h-0 min-w-0" style={{ gridColumn: col, gridRow: row }}>
            <Tile
              definition={getTile(idx)}
              state={state.tiles[idx]!}
              isHighlighted={isHighlighted(idx)}
              highlightColor={hovered ? (teamMode && hovered.teamId ? getTeamColor(hovered.teamId) : hovered.color) : undefined}
              ownerColor={ownerColorOf(idx)}
              isCurrentPosition={currentPos === idx}
              onClick={() => onTileClick(idx)}
              orientation={orientation}
            />
          </div>
        ))}

        <div className="min-h-0 min-w-0" style={{ gridColumn: '2 / 11', gridRow: '2 / 11' }}>
          <CenterBoard
            state={state}
            localPlayerId={localPlayerId}
            isRolling={isRolling}
            isAnimating={isAnimating}
            floatingEmotes={floatingEmotes}
            msLeft={msLeft}
            timerFor={timerFor}
            reconnectWait={reconnectWait}
            onSkipReconnectWait={onSkipReconnectWait}
            onRoll={onRoll}
            onEndTurn={onEndTurn}
            onOpenTrade={onOpenTrade}
            onOpenPropertyManager={onOpenPropertyManager}
            onSendEmote={onSendEmote}
          />
        </div>
      </div>
      <BoardTokens
        state={state}
        displayPositions={displayPositions}
        currentPlayerId={current?.id}
        localPlayerId={localPlayerId}
        hoveredPlayerId={hoveredPlayerId}
        onTileClick={onTileClick}
      />
      </div>
    </div>
  );
};
