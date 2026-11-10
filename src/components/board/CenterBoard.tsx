import React from 'react';
import { GameState, PlayerId } from '../../types/game';
import { Dice } from './Dice';
import { PlayerToken } from './PlayerToken';
import { getCurrentPlayerId } from '../../engine/rules';
import { festivalText, roundsUntilNextFestival } from '../../engine/festivals';
import { Building2, Handshake } from 'lucide-react';

export const EMOTES = ['🔥', '😂', '😭', '🤡', '💸', '🙏', '👏', '😤'];

export interface FloatingEmote {
  id: string;
  emoji: string;
  x: number;
}

interface Props {
  state: GameState;
  localPlayerId: PlayerId;
  isRolling: boolean;
  isAnimating: boolean;
  floatingEmotes: FloatingEmote[];
  /** Milliseconds left on the turn timer for whoever the game is waiting on (null = no timer). */
  msLeft: number | null;
  /** Name of who the timer is running for, when it isn't the current player (e.g. a trade reply). */
  timerFor?: string;
  onRoll: () => void;
  onEndTurn: () => void;
  onOpenTrade: () => void;
  onOpenPropertyManager: () => void;
  onSendEmote: (emoji: string) => void;
}

function phaseHint(state: GameState, isMe: boolean, name: string): string {
  const player = state.players[getCurrentPlayerId(state) ?? ''];
  switch (state.turnPhase) {
    case 'ROLL':
      if (player?.inJail) return isMe ? 'You are in jail — pay, use a card or roll doubles' : `${name} is in jail`;
      return isMe ? 'Roll the dice' : `${name} is about to roll`;
    case 'AWAIT_BUY':
      return isMe ? 'Buy this property or pass' : `${name} is deciding whether to buy`;
    case 'AUCTION':
      return 'Auction in progress';
    case 'CARD_DRAWN':
      return isMe ? 'Read your card' : `${name} is reading a card`;
    case 'DEBT':
      return isMe ? 'Raise money to pay your debt' : `${name} is raising money`;
    case 'TURN_END':
      return isMe ? 'Build, trade, or end your turn' : `${name} is finishing their turn`;
    default:
      return '';
  }
}

export const CenterBoard: React.FC<Props> = ({
  state,
  localPlayerId,
  isRolling,
  isAnimating,
  floatingEmotes,
  msLeft,
  timerFor,
  onRoll,
  onEndTurn,
  onOpenTrade,
  onOpenPropertyManager,
  onSendEmote,
}) => {
  const currentId = getCurrentPlayerId(state);
  const current = currentId ? state.players[currentId] : undefined;
  const me = state.players[localPlayerId];
  const isMyTurn = currentId === localPlayerId && !!me && !me.bankrupt;
  const amPlaying = !!me && !me.bankrupt && state.phase === 'PLAYING';
  const busy = isRolling || isAnimating;

  const canRoll = isMyTurn && state.turnPhase === 'ROLL' && !busy;
  const canEnd = isMyTurn && state.turnPhase === 'TURN_END' && !busy;
  const doublesAgain =
    canEnd && !!me && !me.inJail && state.dice[0] === state.dice[1] && state.consecutiveDoubles > 0;
  const limit = state.settings.roundLimit;
  const festival = state.activeFestival ? festivalText(state.activeFestival) : null;
  const nextFestivalIn = state.settings.festivalEvents && !festival ? roundsUntilNextFestival(state) : null;
  const secondsLeft = msLeft === null ? null : Math.max(0, Math.ceil(msLeft / 1000));

  return (
    <div className="felt-bg relative flex h-full w-full flex-col items-center justify-between overflow-hidden p-[4%] text-center">
      {/* Floating reactions */}
      {floatingEmotes.map((e) => (
        <span
          key={e.id}
          className="animate-float-up pointer-events-none absolute z-40 text-[clamp(18px,5cqw,40px)]"
          style={{ left: `${e.x}%`, bottom: '22%' }}
        >
          {e.emoji}
        </span>
      ))}

      {/* Title, round and festival */}
      <div className="flex w-full flex-col items-center gap-[clamp(3px,0.8cqw,8px)]">
        <div className="center-title font-display font-extrabold leading-none tracking-tight text-amber-300">Bazaar</div>
        <div className="center-text-xs flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 font-semibold uppercase tracking-widest text-emerald-100/70">
          <span>
            Round {state.round}
            {limit > 0 && <span className="text-emerald-100/45"> / {limit}</span>}
          </span>
          {limit > 0 && state.round === limit && <span className="rounded-full bg-rose-500/80 px-2 text-white">Final round</span>}
          {state.settings.mode === 'TEAMS' && <span className="text-emerald-200/60">· Teams</span>}
        </div>
        {festival ? (
          <div
            className="flex max-w-[92%] items-center gap-[clamp(6px,1.4cqw,12px)] rounded-2xl border border-amber-300/40 bg-amber-400/15 px-[clamp(8px,2cqw,16px)] py-[clamp(4px,1cqw,8px)] text-left shadow-lg shadow-black/20"
            role="status"
          >
            <span className="text-[clamp(16px,4cqw,32px)] leading-none">{festival.icon}</span>
            <span className="min-w-0">
              <span className="center-text-sm block font-bold text-amber-100">
                {festival.title} <span className="font-medium text-amber-200/70">· this round</span>
              </span>
              <span className="center-text-xs block text-amber-50/85">{festival.description}</span>
            </span>
          </div>
        ) : (
          nextFestivalIn !== null && (
            <span className="center-text-xs text-emerald-100/45">
              Next festival in {nextFestivalIn} round{nextFestivalIn === 1 ? '' : 's'}
            </span>
          )
        )}
      </div>

      {/* Turn + dice + main action */}
      <div className="flex flex-col items-center gap-[clamp(6px,1.6cqw,14px)]">
        {current && (
          <div className="flex items-center gap-2 rounded-full bg-black/25 py-1 pl-1 pr-3 ring-1 ring-white/10">
            <PlayerToken tokenId={current.tokenId} color={current.color} name={current.name} size="xs" />
            <span className="center-text-sm font-semibold text-white">
              {isMyTurn ? 'Your turn' : `${current.name}'s turn`}
            </span>
            {secondsLeft !== null && (
              <span
                className={`center-text-xs ml-1 rounded-full px-2 py-0.5 font-bold tabular-nums ${
                  secondsLeft <= 10 ? 'bg-rose-500 text-white' : 'bg-white/15 text-white/90'
                }`}
                title={timerFor ? `Waiting on ${timerFor}` : 'Time left for this decision'}
              >
                ⏱ {timerFor ? `${timerFor} · ` : ''}
                {secondsLeft}s
              </span>
            )}
          </div>
        )}

        <Dice dice={state.dice} isRolling={isRolling} rollKey={state.rollCount ?? 0} canRoll={canRoll} onRoll={onRoll} />

        <div className="center-text-xs min-h-[1.2em] font-medium text-emerald-100/80">
          {current ? phaseHint(state, isMyTurn, current.name) : ''}
        </div>

        <div className="flex h-[clamp(36px,7.5cqw,52px)] items-center">
          {canRoll && (
            <button type="button" onClick={onRoll} className="btn btn-primary h-full rounded-[clamp(10px,2.2cqw,18px)] px-[clamp(20px,6cqw,44px)] text-[clamp(13px,2.4cqw,18px)] font-bold">
              🎲 {me?.inJail ? 'Roll for doubles' : 'Roll dice'}
            </button>
          )}
          {canEnd && (
            <button type="button" onClick={onEndTurn} className="btn btn-success h-full rounded-[clamp(10px,2.2cqw,18px)] px-[clamp(20px,6cqw,44px)] text-[clamp(13px,2.4cqw,18px)] font-bold">
              {doublesAgain ? 'Doubles — roll again ➜' : 'End turn ➜'}
            </button>
          )}
          {!canRoll && !canEnd && isMyTurn && busy && (
            <span className="center-text-sm font-semibold text-white/70">Moving…</span>
          )}
        </div>
      </div>

      {/* Secondary actions + recent activity */}
      <div className="flex w-full flex-col items-center gap-[clamp(4px,1.2cqw,10px)]">
        {amPlaying && (
          <div className="hidden items-center gap-2 lg:flex">
            <button
              type="button"
              onClick={onOpenPropertyManager}
              className="btn btn-sm border border-white/15 bg-white/10 text-white hover:bg-white/20 text-[clamp(9px,1.6cqw,12px)]"
            >
              <Building2 size={14} /> Build &amp; mortgage
            </button>
            <button
              type="button"
              onClick={onOpenTrade}
              className="btn btn-sm border border-white/15 bg-white/10 text-white hover:bg-white/20 text-[clamp(9px,1.6cqw,12px)]"
            >
              <Handshake size={14} /> Trade
            </button>
          </div>
        )}

        <ul className="w-full max-w-[90%] space-y-[2px]" aria-live="polite">
          {state.logs.slice(0, 3).map((log, i) => (
            <li
              key={log.id}
              className={`center-text-xs truncate ${i === 0 ? 'font-medium text-white' : 'text-emerald-100/55'}`}
            >
              {log.message}
            </li>
          ))}
        </ul>

        {amPlaying && (
          <div className="hidden items-center gap-[2px] rounded-full bg-black/25 px-2 py-0.5 ring-1 ring-white/10 lg:flex">
            {EMOTES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSendEmote(emoji)}
                className="rounded-full p-[clamp(1px,0.5cqw,4px)] text-[clamp(11px,2.3cqw,18px)] leading-none transition hover:scale-125 hover:bg-white/10 active:scale-95"
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
