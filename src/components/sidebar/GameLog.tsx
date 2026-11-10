import React from 'react';
import { GameLogEntry, GameState } from '../../types/game';

const ICONS: Record<GameLogEntry['type'], string> = {
  ROLL: '🎲',
  MOVE: '👣',
  BUY: '🏠',
  RENT: '💸',
  CARD: '🃏',
  JAIL: '⛓️',
  AUCTION: '🔨',
  TRADE: '🤝',
  BANKRUPT: '📉',
  SYSTEM: '•',
};

export const GameLog: React.FC<{ state: GameState; className?: string }> = ({ state, className = '' }) => (
  <div className={`panel flex min-h-0 flex-col overflow-hidden ${className}`}>
    <div className="border-b border-ink-700 px-3 py-2">
      <span className="panel-title">Activity</span>
    </div>
    <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2 text-[12.5px] leading-snug text-slate-300">
      {state.logs.length === 0 && <li className="py-4 text-center text-xs text-slate-500">Nothing has happened yet.</li>}
      {state.logs.map((log) => {
        const player = log.playerId ? state.players[log.playerId] : undefined;
        return (
          <li key={log.id} className="flex gap-2">
            <span className="w-4 shrink-0 text-center text-[12px]" aria-hidden="true">
              {ICONS[log.type]}
            </span>
            <span className="min-w-0 flex-1">
              {player && <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: player.color }} />}
              {log.message}
            </span>
          </li>
        );
      })}
    </ol>
  </div>
);
