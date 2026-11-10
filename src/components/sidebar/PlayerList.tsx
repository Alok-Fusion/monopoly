import React, { useEffect, useRef, useState } from 'react';
import { GameState, PlayerId } from '../../types/game';
import { formatINR, formatTeamName, getTeamColor } from '../../lib/format';
import { calculateNetWorth } from '../../engine/rent';
import { getCurrentPlayerId, reconnectWaitMs } from '../../engine/rules';
import { PlayerToken } from '../board/PlayerToken';

interface Props {
  state: GameState;
  localPlayerId: PlayerId;
  hoveredPlayerId: PlayerId | null;
  onHoverPlayer: (id: PlayerId | null) => void;
}

interface CashPop {
  id: number;
  playerId: PlayerId;
  amount: number;
}

/** Shows a short-lived "+₹200" / "−₹120" next to a player whenever their cash changes. */
function useCashPops(state: GameState): CashPop[] {
  const prev = useRef<Record<string, number> | null>(null);
  const [pops, setPops] = useState<CashPop[]>([]);
  const signature = state.playerOrder.map((id) => `${id}:${state.players[id]?.cash}`).join('|');

  useEffect(() => {
    const cash: Record<string, number> = {};
    state.playerOrder.forEach((id) => (cash[id] = state.players[id]?.cash ?? 0));
    const before = prev.current;
    prev.current = cash;
    if (!before || state.phase !== 'PLAYING') return;
    const added: CashPop[] = [];
    for (const id of state.playerOrder) {
      const delta = (cash[id] ?? 0) - (before[id] ?? cash[id] ?? 0);
      if (delta !== 0 && before[id] !== undefined) added.push({ id: Date.now() + Math.random(), playerId: id, amount: delta });
    }
    if (!added.length) return;
    setPops((p) => [...p, ...added]);
    const ids = new Set(added.map((a) => a.id));
    // Not cancelled on re-run: each batch of pops removes itself
    setTimeout(() => setPops((p) => p.filter((x) => !ids.has(x.id))), 1650);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, state.phase]);

  return pops;
}

export const PlayerList: React.FC<Props> = ({ state, localPlayerId, hoveredPlayerId, onHoverPlayer }) => {
  const teamMode = state.settings.mode === 'TEAMS';
  const pops = useCashPops(state);
  const currentId = getCurrentPlayerId(state);

  const propCount: Record<string, number> = {};
  Object.values(state.tiles).forEach((t) => {
    if (t.ownerId) propCount[t.ownerId] = (propCount[t.ownerId] ?? 0) + 1;
  });

  const teams: Record<string, number> = {};
  if (teamMode) {
    state.playerOrder.forEach((id) => {
      const p = state.players[id];
      if (p?.teamId && !p.bankrupt) teams[p.teamId] = (teams[p.teamId] ?? 0) + calculateNetWorth(state, id);
    });
  }

  return (
    <div className="panel p-2">
      <div className="flex items-center justify-between px-1.5 pb-1.5 pt-0.5">
        <span className="panel-title">Players</span>
        <span className="text-[11px] text-slate-500">Cash · Net worth</span>
      </div>

      {teamMode && Object.keys(teams).length > 0 && (
        <div className="mb-2 grid grid-cols-2 gap-1.5 px-0.5">
          {Object.entries(teams).map(([teamId, worth]) => (
            <div key={teamId} className="flex items-center justify-between rounded-lg bg-ink-900 px-2 py-1 text-[11px]">
              <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getTeamColor(teamId) }} />
                {formatTeamName(teamId)}
              </span>
              <span className="tabular-nums text-slate-400">{formatINR(worth, true)}</span>
            </div>
          ))}
        </div>
      )}

      <ul className="space-y-1">
        {state.playerOrder.map((pid) => {
          const p = state.players[pid];
          if (!p) return null;
          const isCurrent = pid === currentId && state.phase === 'PLAYING';
          const isMe = pid === localPlayerId;
          const isHovered = pid === hoveredPlayerId;
          return (
            <li
              key={pid}
              onMouseEnter={() => onHoverPlayer(pid)}
              onMouseLeave={() => onHoverPlayer(null)}
              className={`relative flex items-center gap-2.5 rounded-xl border px-2 py-2 transition ${
                p.bankrupt
                  ? 'border-transparent opacity-45'
                  : isCurrent
                    ? 'animate-turn-glow border-transparent bg-gradient-to-r from-amber-400/[0.14] to-transparent'
                    : isHovered
                      ? 'border-ink-600 bg-ink-800'
                      : 'border-transparent hover:bg-ink-800'
              }`}
            >
              {isCurrent && <span className="absolute -left-[3px] top-2 bottom-2 w-[3px] rounded-full bg-amber-400" aria-hidden="true" />}
              <PlayerToken tokenId={p.tokenId} color={p.color} name={p.name} size="sm" dimmed={p.bankrupt} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold text-white">{p.name}</span>
                  {isMe && <span className="chip bg-amber-400/15 text-amber-300">You</span>}
                  {p.isBot && <span className="chip bg-ink-700 text-slate-300">Bot</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {teamMode && p.teamId && (
                    <span className="chip text-white" style={{ backgroundColor: `${getTeamColor(p.teamId)}cc` }}>
                      {formatTeamName(p.teamId)}
                    </span>
                  )}
                  {p.inJail && (
                    <span className="chip bg-orange-500/15 text-orange-300">{p.jailTurns >= 1 ? '⛓️ Free next turn' : '⛓️ In jail'}</span>
                  )}
                  {p.skipNextTurn && <span className="chip bg-amber-500/15 text-amber-200">☕ Skips next turn</span>}
                  {p.jailCardsCount > 0 && (
                    <span className="chip bg-sky-500/15 text-sky-300" title="Get Out of Jail Free cards">
                      🎟 {p.jailCardsCount}
                    </span>
                  )}
                  {!p.connected && !p.isBot && !p.bankrupt && (
                    (reconnectWaitMs(p, Date.now()) ?? 0) > 0 ? (
                      <span className="chip bg-amber-500/15 text-amber-200" title="Their seat is kept while they reconnect">
                        📶 Reconnecting…
                      </span>
                    ) : (
                      <span className="chip bg-ink-700 text-slate-300" title="Offline. The computer is playing their turns until they're back">
                        🤖 Autopilot
                      </span>
                    )
                  )}
                  {p.bankrupt ? (
                    <span className="chip bg-rose-500/15 text-rose-300">Bankrupt</span>
                  ) : (
                    <span className="text-[11px] text-slate-500">{propCount[pid] ?? 0} properties</span>
                  )}
                </div>
              </div>
              {!p.bankrupt && (
                <div className="relative text-right">
                  {pops
                    .filter((x) => x.playerId === pid)
                    .slice(-1)
                    .map((x) => (
                      <span
                        key={x.id}
                        className={`animate-cash-pop pointer-events-none absolute -top-3 right-0 whitespace-nowrap rounded-full px-1.5 text-[11px] font-bold tabular-nums shadow ${
                          x.amount > 0 ? 'bg-emerald-500 text-ink-950' : 'bg-rose-500 text-white'
                        }`}
                      >
                        {x.amount > 0 ? '+' : '−'}
                        {formatINR(Math.abs(x.amount))}
                      </span>
                    ))}
                  <div className="text-[13px] font-bold tabular-nums text-emerald-300">{formatINR(p.cash)}</div>
                  <div className="text-[11px] tabular-nums text-slate-500">{formatINR(calculateNetWorth(state, pid), true)}</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
