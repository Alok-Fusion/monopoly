import React from 'react';
import { ArrowRightLeft, Plus } from 'lucide-react';
import { GameState, PlayerId, TradeOffer } from '../../types/game';
import { getTile } from '../../engine/board';
import { MAX_COUNTER_OFFERS, openTrades, validateTrade } from '../../engine/rules';
import { formatINR } from '../../lib/format';
import { GROUP_COLORS } from '../../lib/tiles';
import { PlayerToken } from '../board/PlayerToken';

/** Compact chips for one side of a deal: cash, jail cards and properties. */
export const TradeItems: React.FC<{ cash: number; props: number[]; jail: number; empty?: string }> = ({ cash, props, jail, empty = 'nothing' }) => {
  if (!cash && !jail && props.length === 0) return <span className="text-slate-500">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {cash > 0 && <span className="chip bg-emerald-500/15 text-emerald-200 tabular-nums">{formatINR(cash)}</span>}
      {jail > 0 && <span className="chip bg-sky-500/15 text-sky-200">🎟 ×{jail}</span>}
      {props.map((idx) => {
        const t = getTile(idx);
        return (
          <span key={idx} className="chip bg-white/[0.07] text-slate-200">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[t.group] }} />
            {t.name}
          </span>
        );
      })}
    </span>
  );
};

function ago(ts?: number): string {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

interface Props {
  state: GameState;
  localPlayerId: PlayerId;
  onNewOffer: () => void;
  onOpen: (tradeId: string) => void;
  onAccept: (tradeId: string) => void;
  onReject: (tradeId: string) => void;
  onCounter: (trade: TradeOffer) => void;
  onWithdraw: (tradeId: string) => void;
}

export const TradesPanel: React.FC<Props> = ({ state, localPlayerId, onNewOffer, onOpen, onAccept, onReject, onCounter, onWithdraw }) => {
  const me = state.players[localPlayerId];
  const canTrade = !!me && !me.bankrupt && state.phase === 'PLAYING';
  // Offers waiting on me first, then mine, then everyone else's
  const trades = [...openTrades(state)].sort((a, b) => {
    const rank = (t: TradeOffer) => (t.targetId === localPlayerId ? 0 : t.proposerId === localPlayerId ? 1 : 2);
    return rank(a) - rank(b) || (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });
  const waitingOnMe = trades.filter((t) => t.targetId === localPlayerId).length;

  return (
    <section id="trade-board" className="panel p-2" aria-label="Trade board">
      <div className="flex items-center justify-between px-1.5 pb-1.5 pt-0.5">
        <span className="panel-title flex items-center gap-1.5">
          <ArrowRightLeft size={13} /> Trade board
          {trades.length > 0 && <span className="text-slate-500">· {trades.length} open</span>}
          {waitingOnMe > 0 && <span className="chip bg-amber-400 text-ink-950">{waitingOnMe} for you</span>}
        </span>
        {canTrade && (
          <button type="button" className="btn btn-sm btn-secondary px-2.5" onClick={onNewOffer}>
            <Plus size={13} /> Offer
          </button>
        )}
      </div>

      {trades.length === 0 ? (
        <p className="px-1.5 pb-2 pt-1 text-xs leading-relaxed text-slate-500">
          No open deals. Offers made by anyone show up here for everyone to see — and they stay open until the other player decides.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {trades.map((t) => {
            const from = state.players[t.proposerId];
            const to = state.players[t.targetId];
            if (!from || !to) return null;
            const forMe = t.targetId === localPlayerId;
            const mine = t.proposerId === localPlayerId;
            const problem = validateTrade(state, t);
            const round = t.counterCount ?? 0;
            return (
              <li
                key={t.id}
                className={`rounded-xl border p-2.5 text-[12.5px] transition ${
                  forMe ? 'border-amber-300/50 bg-amber-400/[0.07]' : 'border-white/[0.07] bg-white/[0.03]'
                }`}
              >
                <button type="button" onClick={() => onOpen(t.id)} className="block w-full text-left" aria-label={`Open trade between ${from.name} and ${to.name}`}>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <PlayerToken tokenId={from.tokenId} color={from.color} name={from.name} size="xs" />
                    <span className="truncate font-semibold text-white">{mine ? 'You' : from.name}</span>
                    <ArrowRightLeft size={12} className="shrink-0 text-slate-500" />
                    <PlayerToken tokenId={to.tokenId} color={to.color} name={to.name} size="xs" />
                    <span className="truncate font-semibold text-white">{forMe ? 'You' : to.name}</span>
                    <span className="ml-auto shrink-0 text-[10.5px] text-slate-500">
                      {round > 0 ? `counter ${round}` : ago(t.createdAt)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1">
                    <span className="pt-0.5 text-[11px] text-slate-500">{mine ? 'You give' : `${from.name.split(' ')[0]} gives`}</span>
                    <TradeItems cash={t.offerCash} props={t.offerProperties} jail={t.offerJailCards} />
                    <span className="pt-0.5 text-[11px] text-slate-500">{forMe ? 'You give' : `${to.name.split(' ')[0]} gives`}</span>
                    <TradeItems cash={t.requestCash} props={t.requestProperties} jail={t.requestJailCards} />
                  </div>
                </button>

                {problem && <p className="mt-1.5 text-[11px] text-rose-300">Can't go through right now: {problem}</p>}

                {forMe && canTrade && (
                  <div className="mt-2 flex gap-1.5">
                    <button type="button" className="btn btn-sm btn-success flex-1" disabled={!!problem} onClick={() => onAccept(t.id)}>
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary flex-1"
                      disabled={round >= MAX_COUNTER_OFFERS}
                      onClick={() => onCounter(t)}
                    >
                      Counter
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => onReject(t.id)}>
                      Decline
                    </button>
                  </div>
                )}
                {mine && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">Waiting for {to.name} — no rush.</span>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => onWithdraw(t.id)}>
                      Withdraw
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
