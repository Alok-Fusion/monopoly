import React, { useState } from 'react';
import { ChevronDown, Flag, Handshake, Building2 } from 'lucide-react';
import { GameState, PlayerId, TradeOffer } from '../../types/game';
import { getTile } from '../../engine/board';
import { ownedTiles } from '../../engine/rules';
import { hasMonopoly } from '../../engine/rent';
import { formatINR } from '../../lib/format';
import { GROUP_COLORS } from '../../lib/tiles';
import { PlayerList } from './PlayerList';
import { TradesPanel } from './TradesPanel';

interface Props {
  state: GameState;
  localPlayerId: PlayerId;
  hoveredPlayerId: PlayerId | null;
  onHoverPlayer: (id: PlayerId | null) => void;
  onOpenTrade: () => void;
  onOpenPropertyManager: () => void;
  onSelectProperty: (tileIndex: number) => void;
  onForfeit: () => void;
  onCancelTrade: (tradeId: string) => void;
  onOpenTradeDetails: (tradeId: string) => void;
  onAcceptTrade: (tradeId: string) => void;
  onRejectTrade: (tradeId: string) => void;
  onCounterTrade: (trade: TradeOffer) => void;
}

export const MyProperties: React.FC<{
  state: GameState;
  localPlayerId: PlayerId;
  onSelectProperty: (tileIndex: number) => void;
}> = ({ state, localPlayerId, onSelectProperty }) => {
  const [open, setOpen] = useState(true);
  const tiles = ownedTiles(state, localPlayerId);

  return (
    <div className="panel p-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left"
        aria-expanded={open}
      >
        <span className="panel-title">My properties ({tiles.length})</span>
        <ChevronDown size={15} className={`text-slate-500 transition ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="mt-1 max-h-56 space-y-0.5 overflow-y-auto pr-0.5">
          {tiles.length === 0 ? (
            <p className="px-1.5 py-3 text-center text-xs text-slate-500">You don't own anything yet. Land on a property to buy it.</p>
          ) : (
            tiles.map((idx) => {
              const tile = getTile(idx);
              const t = state.tiles[idx]!;
              const fullSet = tile.type === 'property' && hasMonopoly(state, localPlayerId, tile.group);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectProperty(idx)}
                  className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[13px] transition hover:bg-ink-800"
                >
                  <span className="h-3.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: GROUP_COLORS[tile.group] }} />
                  <span className={`min-w-0 flex-1 truncate ${t.mortgaged ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                    {tile.name}
                  </span>
                  {fullSet && t.houses === 0 && <span className="chip bg-amber-400/15 text-amber-300">Set</span>}
                  {t.houses > 0 && (
                    <span className="chip bg-emerald-500/15 text-emerald-300">{t.houses === 5 ? 'Hotel' : `${t.houses} 🏠`}</span>
                  )}
                  <span className="w-12 text-right text-[11px] tabular-nums text-slate-500">{formatINR(tile.price ?? 0, true)}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export const RightSidebar: React.FC<Props> = ({
  state,
  localPlayerId,
  hoveredPlayerId,
  onHoverPlayer,
  onOpenTrade,
  onOpenPropertyManager,
  onSelectProperty,
  onForfeit,
  onCancelTrade,
  onOpenTradeDetails,
  onAcceptTrade,
  onRejectTrade,
  onCounterTrade,
}) => {
  const me = state.players[localPlayerId];
  const active = !!me && !me.bankrupt && state.phase === 'PLAYING';

  return (
    <div className="flex w-full flex-col gap-3">
      <PlayerList state={state} localPlayerId={localPlayerId} hoveredPlayerId={hoveredPlayerId} onHoverPlayer={onHoverPlayer} />

      {active && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-secondary" onClick={onOpenPropertyManager}>
            <Building2 size={15} /> Build &amp; mortgage
          </button>
          <button type="button" className="btn btn-secondary" onClick={onOpenTrade}>
            <Handshake size={15} /> Trade
          </button>
        </div>
      )}

      {state.phase === 'PLAYING' && (
        <TradesPanel
          state={state}
          localPlayerId={localPlayerId}
          onNewOffer={onOpenTrade}
          onOpen={onOpenTradeDetails}
          onAccept={onAcceptTrade}
          onReject={onRejectTrade}
          onCounter={onCounterTrade}
          onWithdraw={onCancelTrade}
        />
      )}

      {me && <MyProperties state={state} localPlayerId={localPlayerId} onSelectProperty={onSelectProperty} />}

      {active && (
        <button type="button" onClick={onForfeit} className="btn btn-ghost btn-sm self-center text-slate-500 hover:text-rose-300">
          <Flag size={13} /> Forfeit game
        </button>
      )}
    </div>
  );
};
