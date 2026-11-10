import React, { useState } from 'react';
import { GameState, PlayerId } from '../../types/game';
import { getTile } from '../../engine/board';
import { canMortgage, canSellHouse, liquidationValue, mortgageValue, ownedTiles } from '../../engine/rules';
import { formatINR } from '../../lib/format';
import { GROUP_COLORS } from '../../lib/tiles';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../common/Modal';

interface Props {
  state: GameState;
  localPlayerId: PlayerId;
  onResolveDebt: () => void;
  onDeclareBankruptcy: () => void;
  onMortgage: (tileIndex: number) => void;
  onSellHouse: (tileIndex: number) => void;
  onOpenTrade: () => void;
}

export const DebtModal: React.FC<Props> = ({ state, localPlayerId, onResolveDebt, onDeclareBankruptcy, onMortgage, onSellHouse, onOpenTrade }) => {
  const [confirming, setConfirming] = useState(false);
  const me = state.players[localPlayerId];
  if (!me) return null;

  const creditor = state.debtCreditorId && state.debtCreditorId !== 'BANK' ? state.players[state.debtCreditorId] : null;
  const canPay = me.cash >= state.debtAmount;
  const shortfall = Math.max(0, state.debtAmount - me.cash);
  const raisable = liquidationValue(state, localPlayerId);
  const tiles = ownedTiles(state, localPlayerId);
  const sellable = tiles.filter((idx) => canSellHouse(state, localPlayerId, idx));
  const mortgageable = tiles.filter((idx) => canMortgage(state, localPlayerId, idx));
  const teammateHeir = state.settings.mode === 'TEAMS' && !!me.teamId;

  return (
    <Modal size="md" labelledBy="debt-title">
      <ModalHeader
        id="debt-title"
        eyebrow={`You owe ${creditor ? creditor.name : 'the bank'}`}
        title={canPay ? 'Ready to pay' : `Raise ${formatINR(shortfall)} more`}
        icon="⚠️"
        accent="#F43F5E"
      />
      <ModalBody className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-ink-900 px-3 py-2.5">
            <div className="panel-title">Owed</div>
            <div className="text-xl font-bold tabular-nums text-rose-300">{formatINR(state.debtAmount)}</div>
          </div>
          <div className="rounded-xl bg-ink-900 px-3 py-2.5">
            <div className="panel-title">Your cash</div>
            <div className={`text-xl font-bold tabular-nums ${canPay ? 'text-emerald-300' : 'text-white'}`}>{formatINR(me.cash)}</div>
          </div>
        </div>

        {!canPay && (
          <>
            {sellable.length > 0 && (
              <section>
                <h3 className="panel-title mb-1.5">Sell buildings (half price back)</h3>
                <div className="flex flex-wrap gap-1.5">
                  {sellable.map((idx) => {
                    const tile = getTile(idx);
                    const houses = state.tiles[idx]!.houses;
                    return (
                      <button key={idx} type="button" className="btn btn-secondary btn-sm" onClick={() => onSellHouse(idx)}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[tile.group] }} />
                        {houses === 5 ? 'Hotel' : 'House'} on {tile.name}
                        <span className="text-emerald-300">+{formatINR(Math.floor((tile.houseCost ?? 0) / 2))}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            {mortgageable.length > 0 && (
              <section>
                <h3 className="panel-title mb-1.5">Mortgage properties</h3>
                <div className="flex flex-wrap gap-1.5">
                  {mortgageable.map((idx) => {
                    const tile = getTile(idx);
                    return (
                      <button key={idx} type="button" className="btn btn-secondary btn-sm" onClick={() => onMortgage(idx)}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[tile.group] }} />
                        {tile.name}
                        <span className="text-emerald-300">+{formatINR(mortgageValue(idx))}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            {sellable.length === 0 && mortgageable.length === 0 && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
                Nothing left to sell or mortgage. You'll have to declare bankruptcy.
              </p>
            )}
            {raisable + me.cash < state.debtAmount && (sellable.length > 0 || mortgageable.length > 0) && (
              <p className="text-xs text-slate-400">
                Even selling everything raises only {formatINR(raisable)} — not enough to cover this debt.
              </p>
            )}
            <button type="button" className="btn btn-ghost btn-sm -ml-2 text-sky-300" onClick={onOpenTrade}>
              🤝 Offer a trade to raise cash
            </button>
          </>
        )}

        {teammateHeir && (
          <p className="rounded-xl bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-200">
            Teams mode: if you go bankrupt, your teammate inherits everything you own.
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        {confirming ? (
          <>
            <span className="mr-auto text-sm text-rose-200">Leave the game for good?</span>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
              Keep playing
            </button>
            <button type="button" className="btn btn-danger" onClick={onDeclareBankruptcy}>
              Declare bankruptcy
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost mr-auto text-rose-300" onClick={() => setConfirming(true)}>
              Go bankrupt
            </button>
            <button type="button" className="btn btn-primary" disabled={!canPay} onClick={onResolveDebt}>
              Pay {formatINR(state.debtAmount)}
            </button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
};
