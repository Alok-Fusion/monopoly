import React, { useState } from 'react';
import { Gavel } from 'lucide-react';
import { AuctionState, GameState, PlayerId } from '../../types/game';
import { getTile } from '../../engine/board';
import { MIN_BID_STEP } from '../../engine/rules';
import { AUCTION_SECONDS } from '../../engine/state';
import { formatINR } from '../../lib/format';
import { DeedCard } from '../board/DeedCard';
import { PlayerToken } from '../board/PlayerToken';
import { Modal, ModalHeader } from '../common/Modal';

interface Props {
  auction: AuctionState;
  state: GameState;
  localPlayerId: PlayerId;
  onBid: (amount: number) => void;
  onPass: () => void;
}

export const AuctionModal: React.FC<Props> = ({ auction, state, localPlayerId, onBid, onPass }) => {
  const [custom, setCustom] = useState('');
  const tile = getTile(auction.tileIndex);
  const leader = auction.highestBidderId ? state.players[auction.highestBidderId] : null;
  const me = state.players[localPlayerId];
  const amBidding = auction.activeBidderIds.includes(localPlayerId);
  const amLeading = auction.highestBidderId === localPlayerId;
  const canBid = amBidding && !amLeading && !!me;
  const minBid = auction.highestBid + MIN_BID_STEP;
  const customValue = parseInt(custom, 10);
  const customValid = canBid && Number.isFinite(customValue) && customValue >= minBid && customValue <= (me?.cash ?? 0);
  const pct = Math.max(0, Math.min(100, (auction.secondsRemaining / AUCTION_SECONDS) * 100));

  const bid = (amount: number) => {
    if (!canBid || amount <= auction.highestBid || amount > (me?.cash ?? 0)) return;
    onBid(amount);
    setCustom('');
  };

  let status = '';
  if (!me || me.bankrupt) status = 'You are watching this auction.';
  else if (amLeading) status = 'You have the highest bid.';
  else if (!amBidding) status = 'You passed — watching the rest of the auction.';

  return (
    <Modal size="lg" labelledBy="auction-title">
      <ModalHeader id="auction-title" eyebrow="Auction" title={tile.name} icon={<Gavel size={20} />} />
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 sm:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <div>
            <div className="panel-title mb-1.5">Highest bid</div>
            <div className="flex items-center gap-3">
              {leader ? (
                <PlayerToken tokenId={leader.tokenId} color={leader.color} name={leader.name} size="lg" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-700 text-xl">🔨</span>
              )}
              <div>
                <div className="font-display text-3xl font-bold tabular-nums text-white">{formatINR(auction.highestBid)}</div>
                <div className="text-xs text-slate-400">{leader ? leader.name : `No bids yet — list price ${formatINR(tile.price ?? 0)}`}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>Time left</span>
              <span className="tabular-nums">{auction.secondsRemaining}s</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-900">
              <div
                className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${pct < 34 ? 'bg-rose-500' : 'bg-amber-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {auction.activeBidderIds.length === 0 && <span className="text-xs text-slate-500">Everyone has passed.</span>}
            {state.playerOrder.map((id) => {
              const p = state.players[id];
              if (!p || p.bankrupt) return null;
              const inIt = auction.activeBidderIds.includes(id);
              return (
                <span
                  key={id}
                  className={`chip ${inIt ? 'bg-ink-700 text-slate-200' : 'bg-ink-900 text-slate-500 line-through'}`}
                  title={inIt ? 'Still bidding' : 'Passed'}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </span>
              );
            })}
          </div>

          {status && <p className="rounded-lg bg-ink-900 px-3 py-2 text-[13px] text-slate-300">{status}</p>}

          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              {[10, 50, 100].map((inc) => {
                const amount = auction.highestBid + inc;
                return (
                  <button
                    key={inc}
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!canBid || amount > (me?.cash ?? 0)}
                    onClick={() => bid(amount)}
                  >
                    Bid {formatINR(amount)}
                  </button>
                );
              })}
            </div>
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (customValid) bid(customValue);
              }}
            >
              <input
                type="number"
                inputMode="numeric"
                min={minBid}
                max={me?.cash ?? 0}
                placeholder={`${minBid}+`}
                value={custom}
                disabled={!canBid}
                onChange={(e) => setCustom(e.target.value)}
                className="input py-1.5"
                aria-label="Custom bid amount"
              />
              <button type="submit" className="btn btn-secondary btn-sm shrink-0" disabled={!customValid}>
                Bid
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm shrink-0 border border-ink-600"
                disabled={!amBidding || amLeading}
                onClick={onPass}
              >
                Pass
              </button>
            </form>
            {me && !me.bankrupt && <p className="text-[11px] text-slate-500">Your cash: {formatINR(me.cash)}</p>}
          </div>
        </div>

        <div className="hidden items-start justify-center sm:flex">
          <DeedCard tile={tile} compact doubleRentOnSet={state.settings.doubleRentOnSet} className="w-[240px]" />
        </div>
      </div>
    </Modal>
  );
};
