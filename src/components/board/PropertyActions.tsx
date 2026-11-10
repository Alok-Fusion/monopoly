import React from 'react';
import { Home, Hotel, Landmark, HandCoins, MinusCircle } from 'lucide-react';
import { GameState, PlayerId } from '../../types/game';
import { getTile } from '../../engine/board';
import { canBuildHouse, canMortgage, canSellHouse, canUnmortgage, groupHasBuildings, mortgageValue, unmortgageCost } from '../../engine/rules';
import { houseCostOf } from '../../engine/festivals';
import { formatINR } from '../../lib/format';
import { buildHint } from '../modals/PropertyManagerModal';

interface Props {
  state: GameState;
  playerId: PlayerId;
  tileIndex: number;
  onBuild: () => void;
  onSell: () => void;
  onMortgage: () => void;
  onUnmortgage: () => void;
}

/** Quick actions shown under a property card you own: build, sell, mortgage, pay off. */
export const PropertyActions: React.FC<Props> = ({ state, playerId, tileIndex, onBuild, onSell, onMortgage, onUnmortgage }) => {
  const tile = getTile(tileIndex);
  const t = state.tiles[tileIndex];
  if (!t || t.ownerId !== playerId || state.phase !== 'PLAYING') return null;
  const street = tile.type === 'property';
  const hint = street ? buildHint(state, playerId, tileIndex) : null;
  const mortgageBlocked = !t.mortgaged && groupHasBuildings(state, tileIndex);

  return (
    <div className="w-full max-w-[300px] space-y-2 rounded-2xl bg-ink-850/90 p-3 ring-1 ring-white/10 backdrop-blur">
      <div className="grid grid-cols-2 gap-2">
        {street && (
          <>
            <button type="button" className="btn btn-success btn-sm" disabled={!canBuildHouse(state, playerId, tileIndex)} onClick={onBuild}>
              {t.houses === 4 ? <Hotel size={14} /> : <Home size={14} />}
              {t.houses === 4 ? 'Hotel' : 'House'} −{formatINR(houseCostOf(state, tileIndex))}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!canSellHouse(state, playerId, tileIndex)} onClick={onSell}>
              <MinusCircle size={14} /> Sell +{formatINR(Math.floor((tile.houseCost ?? 0) / 2))}
            </button>
          </>
        )}
        {state.settings.mortgageEnabled &&
          (t.mortgaged ? (
            <button
              type="button"
              className="btn btn-primary btn-sm col-span-2"
              disabled={!canUnmortgage(state, playerId, tileIndex)}
              onClick={onUnmortgage}
            >
              <HandCoins size={14} /> Pay off mortgage −{formatINR(unmortgageCost(tileIndex))}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm col-span-2 border-rose-400/30 text-rose-100 hover:bg-rose-500/20"
              disabled={!canMortgage(state, playerId, tileIndex)}
              onClick={onMortgage}
            >
              <Landmark size={14} /> Mortgage for +{formatINR(mortgageValue(tileIndex))}
            </button>
          ))}
      </div>
      {(hint || mortgageBlocked || t.mortgaged) && (
        <p className="text-center text-[11px] leading-snug text-slate-400">
          {t.mortgaged
            ? `Mortgaged — earns no rent until you pay it off (10% interest).`
            : mortgageBlocked
              ? 'Sell the buildings in this set before mortgaging.'
              : hint}
        </p>
      )}
    </div>
  );
};
