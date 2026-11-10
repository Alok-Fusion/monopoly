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

/** The game's running commentary, in the middle of the board under the dice. Newest first. */
export const ActivityFeed: React.FC<{ state: GameState; className?: string }> = ({ state, className = '' }) => {
  const logs = state.logs.slice(0, 60);
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-[clamp(8px,1.8cqw,16px)] bg-black/30 ring-1 ring-white/10 backdrop-blur-[2px] ${className}`}
      aria-label="Game activity"
    >
      <div className="center-log-title flex shrink-0 items-center justify-between border-b border-white/10 px-[clamp(6px,1.6cqw,12px)] py-[clamp(2px,0.6cqw,5px)] font-bold uppercase tracking-widest text-emerald-100/60">
        <span>Activity</span>
        {logs.length > 0 && <span className="center-roomy-only font-semibold normal-case tracking-normal text-emerald-100/40">newest first</span>}
      </div>
      <ol className="center-log min-h-0 flex-1 space-y-[clamp(1px,0.45cqw,4px)] overflow-y-auto overscroll-contain px-[clamp(6px,1.6cqw,12px)] py-[clamp(3px,0.8cqw,7px)] text-left" role="log">
        {logs.length === 0 && <li className="py-2 text-center text-emerald-100/50">Roll the dice to get things going.</li>}
        {logs.map((log, i) => {
          const player = log.playerId ? state.players[log.playerId] : undefined;
          return (
            <li
              key={log.id}
              className={`flex gap-[clamp(3px,0.8cqw,7px)] leading-snug ${
                i === 0 ? 'animate-fade-in font-semibold text-white' : i < 3 ? 'text-emerald-50/85' : 'text-emerald-100/55'
              }`}
            >
              <span className="w-[1.3em] shrink-0 text-center" aria-hidden="true">
                {ICONS[log.type]}
              </span>
              <span className="min-w-0 flex-1">
                {player && (
                  <span
                    className="mr-[0.35em] inline-block h-[0.65em] w-[0.65em] rounded-full align-[0.05em] ring-1 ring-white/70"
                    style={{ backgroundColor: player.color }}
                    aria-hidden="true"
                  />
                )}
                {log.message}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
