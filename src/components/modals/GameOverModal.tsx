import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { GameState, PlayerState, PlayerStats } from '../../types/game';
import { formatINR, formatTeamName, getTeamColor } from '../../lib/format';
import { calculateNetWorth } from '../../engine/rent';
import { SALARY_AMOUNT } from '../../engine/board';
import { sounds } from '../../lib/sound';
import { PlayerToken } from '../board/PlayerToken';
import { Modal } from '../common/Modal';

interface Props {
  state: GameState;
  canRestart: boolean;
  onRematch: () => void;
}

interface AwardDef {
  icon: string;
  title: string;
  stat: keyof PlayerStats;
  format: (v: number) => string;
}

const AWARDS: AwardDef[] = [
  { icon: '🏠', title: 'Landlord of the Year', stat: 'rentCollected', format: (v) => `${formatINR(v)} rent collected` },
  { icon: '🧱', title: 'Master Builder', stat: 'buildingsBuilt', format: (v) => `${v} building${v === 1 ? '' : 's'} put up` },
  { icon: '🤝', title: 'Deal Maker', stat: 'tradesMade', format: (v) => `${v} trade${v === 1 ? '' : 's'} closed` },
  { icon: '🔨', title: 'Auction Ace', stat: 'auctionsWon', format: (v) => `${v} auction${v === 1 ? '' : 's'} won` },
  { icon: '🏁', title: 'Road Warrior', stat: 'salaryCollected', format: (v) => {
      const laps = Math.max(1, Math.round(v / SALARY_AMOUNT));
      return `${laps} lap${laps === 1 ? '' : 's'} of the board`;
    } },
  { icon: '💸', title: 'Most Generous Tenant', stat: 'rentPaid', format: (v) => `${formatINR(v)} rent paid` },
  { icon: '⛓️', title: 'Tihar Regular', stat: 'jailVisits', format: (v) => `${v} trip${v === 1 ? '' : 's'} to jail` },
];

function computeAwards(state: GameState) {
  const stats = state.stats ?? {};
  const results: { def: AwardDef; player: PlayerState; value: number }[] = [];
  for (const def of AWARDS) {
    let best: { player: PlayerState; value: number } | null = null;
    for (const id of state.playerOrder) {
      const p = state.players[id];
      const v = stats[id]?.[def.stat] ?? 0;
      if (p && v > 0 && (!best || v > best.value)) best = { player: p, value: v };
    }
    if (best) results.push({ def, ...best });
  }
  return results.slice(0, 6);
}

const WorthChart: React.FC<{ state: GameState }> = ({ state }) => {
  const history = state.history ?? [];
  if (history.length < 2) return null;
  const W = 320;
  const H = 120;
  const max = Math.max(1, ...history.flatMap((h) => Object.values(h.worth)));
  const x = (i: number) => (i / (history.length - 1)) * W;
  const y = (v: number) => H - (v / max) * (H - 6) - 3;

  return (
    <div className="rounded-xl bg-ink-900 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="panel-title">Net worth over time</span>
        <span className="text-[11px] text-slate-500">peak {formatINR(max, true)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label="Net worth of each player by round">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="rgba(148,163,184,0.12)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {state.playerOrder.map((id) => {
          const p = state.players[id];
          if (!p) return null;
          const points = history.map((h, i) => `${x(i)},${y(h.worth[id] ?? 0)}`).join(' ');
          return (
            <polyline
              key={id}
              points={points}
              fill="none"
              stroke={p.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={p.bankrupt ? 0.45 : 1}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>Round {history[0]!.round}</span>
        <span>Round {history[history.length - 1]!.round}</span>
      </div>
    </div>
  );
};

export const GameOverModal: React.FC<Props> = ({ state, canRestart, onRematch }) => {
  const teamMode = state.settings.mode === 'TEAMS';
  const winner = state.winnerPlayerId ? state.players[state.winnerPlayerId] : null;
  const title =
    teamMode && state.winnerTeamId ? `${formatTeamName(state.winnerTeamId)} wins!` : winner ? `${winner.name} wins!` : 'Game over';
  const subtitle =
    state.endReason === 'ROUND_LIMIT'
      ? `Richest after ${state.settings.roundLimit} rounds.`
      : 'Everyone else ran out of money.';

  // Survivors first (by net worth), then bankrupt players
  const ranking = [...state.playerOrder]
    .map((id) => state.players[id])
    .filter((p): p is PlayerState => !!p)
    .sort((a, b) => {
      if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
      return calculateNetWorth(state, b.id) - calculateNetWorth(state, a.id);
    });
  const awards = computeAwards(state);

  useEffect(() => {
    sounds.playVictory();
    const end = Date.now() + 2500;
    let raf = 0;
    const frame = () => {
      confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#FBBF24', '#34D399', '#F472B6', '#60A5FA'] });
      confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#FBBF24', '#34D399', '#F472B6', '#60A5FA'] });
      if (Date.now() < end) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Modal size="lg" labelledBy="go-title">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="bg-gradient-to-b from-amber-400/15 to-transparent px-6 pb-4 pt-6 text-center">
          <div className="text-5xl">🏆</div>
          <h2 id="go-title" className="mt-2 font-display text-3xl font-extrabold text-white">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {subtitle} {state.round > 1 && `${state.round} rounds played.`}
          </p>
        </div>

        <div className="grid gap-4 px-5 pb-4 md:grid-cols-2">
          <div className="space-y-3">
            <ol className="space-y-1">
              {ranking.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-ink-900 px-3 py-2">
                  <span className="w-5 text-center text-sm font-bold text-slate-500">{i + 1}</span>
                  <PlayerToken tokenId={p.tokenId} color={p.color} name={p.name} size="sm" dimmed={p.bankrupt} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{p.name}</span>
                  {teamMode && p.teamId && (
                    <span className="chip text-white" style={{ backgroundColor: `${getTeamColor(p.teamId)}cc` }}>
                      {formatTeamName(p.teamId)}
                    </span>
                  )}
                  <span className={`text-sm font-semibold tabular-nums ${p.bankrupt ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {p.bankrupt ? 'Bankrupt' : formatINR(calculateNetWorth(state, p.id))}
                  </span>
                </li>
              ))}
            </ol>
            <WorthChart state={state} />
          </div>

          {awards.length > 0 && (
            <div>
              <div className="panel-title mb-2">Awards</div>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
                {awards.map(({ def, player, value }) => (
                  <li key={def.title} className="flex items-start gap-2.5 rounded-xl border border-ink-700 bg-ink-900 p-2.5">
                    <span className="text-2xl leading-none">{def.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-white">{def.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-300">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: player.color }} />
                        <span className="truncate">{player.name}</span>
                      </span>
                      <span className="block text-[11px] text-slate-500">{def.format(value)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-ink-700 px-5 py-4">
        {canRestart ? (
          <button type="button" className="btn btn-primary w-full" onClick={onRematch}>
            Back to lobby for a rematch
          </button>
        ) : (
          <p className="text-center text-sm text-slate-400">Waiting for the host to start a rematch…</p>
        )}
      </div>
    </Modal>
  );
};
