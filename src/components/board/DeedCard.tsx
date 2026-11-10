import React, { useState } from 'react';
import { PlayerState, TileDefinition, TileState } from '../../types/game';
import { formatINR } from '../../lib/format';
import { GROUP_COLORS, GROUP_LABELS, TILE_EMBLEMS } from '../../lib/tiles';
import { RAILWAY_RENTS } from '../../engine/board';
import { mortgageValue } from '../../engine/rules';
import { PlayerToken } from './PlayerToken';

interface Props {
  tile: TileDefinition;
  tileState?: TileState;
  owner?: PlayerState | null;
  className?: string;
  compact?: boolean;
  /** e.g. "You'd pay ₹120 if you land here" */
  rentHint?: string;
  /** Discounted price during a sale festival */
  salePrice?: number;
  doubleRentOnSet?: boolean;
}

const Row: React.FC<{ label: React.ReactNode; value: React.ReactNode; active?: boolean }> = ({ label, value, active }) => (
  <div className={`flex items-center justify-between rounded-md px-2 py-[3px] ${active ? 'bg-amber-100 font-semibold text-ink-900' : ''}`}>
    <span>{label}</span>
    <span className="font-semibold tabular-nums text-ink-900">{value}</span>
  </div>
);

export const DeedCard: React.FC<Props> = ({ tile, tileState, owner, className = '', compact, doubleRentOnSet = true, rentHint, salePrice }) => {
  const discounted = salePrice !== undefined && salePrice < (tile.price ?? 0);
  const [imgOk, setImgOk] = useState(true);
  const color = GROUP_COLORS[tile.group];
  const houses = tileState?.houses ?? 0;

  return (
    <div className={`w-full max-w-[300px] overflow-hidden rounded-2xl bg-paper-50 text-ink-700 shadow-xl ring-1 ring-black/10 ${className}`}>
      {/* Header band */}
      <div
        className={`relative overflow-hidden px-4 pb-3 text-center text-white ${tile.image && imgOk ? (compact ? 'pt-14' : 'pt-24') : 'pt-3'}`}
        style={{ backgroundColor: color }}
      >
        {tile.image && imgOk && (
          <>
            <img
              src={tile.image}
              alt={tile.name}
              onError={() => setImgOk(false)}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(180deg, rgba(0,0,0,0) 25%, ${color}cc 72%, ${color} 100%)` }}
            />
          </>
        )}
        <div className="relative [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-90">
            {tile.type === 'property' ? `${GROUP_LABELS[tile.group]} set` : tile.type === 'railway' ? 'Railway station' : 'Utility'}
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-1.5 font-display text-xl font-extrabold leading-tight drop-shadow">
            {TILE_EMBLEMS[tile.index] && <span className="text-lg">{TILE_EMBLEMS[tile.index]}</span>}
            {tile.name}
          </div>
        </div>
      </div>

      <div className="space-y-2 px-3 pb-3 pt-2.5 text-[12.5px]">
        {tile.tagline && !compact && <p className="text-center text-[11px] italic text-ink-500">{tile.tagline}</p>}

        {tile.type === 'property' && tile.rent && (
          <div className="space-y-0.5">
            <Row label="Rent" value={formatINR(tile.rent[0])} active={!!owner && houses === 0} />
            {doubleRentOnSet && <Row label="With full set" value={formatINR(tile.rent[0] * 2)} />}
            {[1, 2, 3, 4].map((n) => (
              <Row key={n} label={`With ${n} house${n > 1 ? 's' : ''}`} value={formatINR(tile.rent![n]!)} active={houses === n} />
            ))}
            <Row label="With hotel" value={formatINR(tile.rent[5])} active={houses === 5} />
          </div>
        )}

        {tile.type === 'railway' && (
          <div className="space-y-0.5">
            {RAILWAY_RENTS.map((rent, i) => (
              <Row key={i} label={`${i + 1} station${i ? 's' : ''} owned`} value={formatINR(rent)} />
            ))}
          </div>
        )}

        {tile.type === 'utility' && (
          <div className="space-y-1 px-2 text-[12px] leading-snug">
            <p>
              One utility owned: rent is <b className="text-ink-900">4×</b> the dice roll.
            </p>
            <p>
              Both utilities owned: rent is <b className="text-ink-900">10×</b> the dice roll.
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-1 border-t border-paper-300 pt-2 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-500">Price</div>
            {discounted ? (
              <div className="font-bold text-emerald-700">
                <span className="mr-1 text-[11px] font-medium text-ink-500 line-through">{formatINR(tile.price ?? 0)}</span>
                {formatINR(salePrice!)}
              </div>
            ) : (
              <div className="font-bold text-ink-900">{formatINR(tile.price ?? 0)}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-500">{tile.houseCost ? 'House / hotel' : '—'}</div>
            <div className="font-bold text-ink-900">{tile.houseCost ? formatINR(tile.houseCost) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-500">Mortgage</div>
            <div className="font-bold text-ink-900">{formatINR(mortgageValue(tile.index))}</div>
          </div>
        </div>

        {rentHint && (
          <div className="rounded-lg bg-amber-100 px-2 py-1.5 text-center text-[12px] font-semibold text-amber-900">{rentHint}</div>
        )}

        {tileState && (
          <div className="flex items-center justify-center gap-2 border-t border-paper-300 pt-2 text-[12px]">
            {owner ? (
              <>
                <PlayerToken tokenId={owner.tokenId} color={owner.color} name={owner.name} size="xs" />
                <span>
                  Owned by <b className="text-ink-900">{owner.name}</b>
                </span>
                {tileState.mortgaged && <span className="chip bg-rose-100 text-rose-700">Mortgaged</span>}
              </>
            ) : (
              <span className="text-ink-500">Unowned — available from the bank</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
