import React from 'react';
import { Landmark } from 'lucide-react';
import { TileDefinition, PlayerState } from '../../types/game';
import { getTile } from '../../engine/board';
import { mortgageValue } from '../../engine/rules';
import { formatINR } from '../../lib/format';
import { GROUP_COLORS } from '../../lib/tiles';
import { DeedCard } from '../board/DeedCard';
import { Modal } from '../common/Modal';

interface Props {
  tile: TileDefinition;
  /** Price to pay right now (festival discounts applied) */
  price: number;
  player: PlayerState;
  auctionOnDecline: boolean;
  doubleRentOnSet: boolean;
  /** Properties the player could mortgage to raise the money */
  mortgageable: number[];
  onMortgage: (tileIndex: number) => void;
  onBuy: () => void;
  onDecline: () => void;
}

export const BuyPropertyModal: React.FC<Props> = ({
  tile,
  price,
  player,
  auctionOnDecline,
  doubleRentOnSet,
  mortgageable,
  onMortgage,
  onBuy,
  onDecline,
}) => {
  const canAfford = player.cash >= price;
  const short = price - player.cash;

  return (
    <Modal size="sm" labelledBy="buy-title">
      <div className="flex min-h-0 flex-col items-center gap-4 overflow-y-auto p-5">
        <div className="text-center">
          <div className="panel-title">You landed on</div>
          <h2 id="buy-title" className="font-display text-xl font-bold text-white">
            {tile.name}
          </h2>
        </div>
        <DeedCard tile={tile} doubleRentOnSet={doubleRentOnSet} salePrice={price} />
        <div className="flex w-full items-center justify-between rounded-xl bg-black/25 px-3 py-2 text-sm ring-1 ring-white/5">
          <span className="text-slate-400">Your cash</span>
          <span className="font-semibold tabular-nums text-white">
            {formatINR(player.cash)} <span className="text-slate-500">→</span>{' '}
            <span className={canAfford ? 'text-emerald-300' : 'text-rose-300'}>{formatINR(player.cash - price)}</span>
          </span>
        </div>

        {!canAfford && mortgageable.length > 0 && (
          <div className="w-full space-y-2 rounded-xl border border-amber-300/30 bg-amber-400/[0.07] p-3">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-amber-100">
              <Landmark size={14} /> You're {formatINR(short)} short — mortgage something to buy it:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {mortgageable.map((idx) => {
                const t = getTile(idx);
                return (
                  <button key={idx} type="button" className="btn btn-secondary btn-sm" onClick={() => onMortgage(idx)}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[t.group] }} />
                    {t.name}
                    <span className="text-emerald-300">+{formatINR(mortgageValue(idx))}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid w-full grid-cols-2 gap-2">
          <button type="button" className="btn btn-secondary" onClick={onDecline}>
            {auctionOnDecline ? 'Send to auction' : 'Skip'}
          </button>
          <button type="button" className="btn btn-primary" disabled={!canAfford} onClick={onBuy} autoFocus={canAfford}>
            Buy for {formatINR(price)}
          </button>
        </div>
      </div>
    </Modal>
  );
};
