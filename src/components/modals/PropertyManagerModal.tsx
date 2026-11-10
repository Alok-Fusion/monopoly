import React from 'react';
import { GameState, PlayerId, TileGroup } from '../../types/game';
import { getTile, GROUP_TILES, COLOR_GROUPS } from '../../engine/board';
import { hasMonopoly } from '../../engine/rent';
import {
  canBuildHouse,
  canMortgage,
  canSellHouse,
  canUnmortgage,
  groupHasBuildings,
  mortgageValue,
  ownedTiles,
  unmortgageCost,
} from '../../engine/rules';
import { Building2 } from 'lucide-react';
import { houseCostOf } from '../../engine/festivals';
import { formatINR } from '../../lib/format';
import { GROUP_COLORS, GROUP_LABELS } from '../../lib/tiles';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../common/Modal';

interface Props {
  state: GameState;
  localPlayerId: PlayerId;
  onClose: () => void;
  onBuildHouse: (tileIndex: number) => void;
  onSellHouse: (tileIndex: number) => void;
  onMortgage: (tileIndex: number) => void;
  onUnmortgage: (tileIndex: number) => void;
}

const GROUP_ORDER: TileGroup[] = [...COLOR_GROUPS, 'railway', 'utility'];

export function buildHint(state: GameState, playerId: PlayerId, idx: number): string | null {
  const tile = getTile(idx);
  const t = state.tiles[idx]!;
  if (tile.type !== 'property') return null;
  if (!hasMonopoly(state, playerId, tile.group)) return state.settings.mode === 'TEAMS' ? 'Your team needs the full set to build' : 'Own the full set to build';
  if (GROUP_TILES[tile.group].some((i) => state.tiles[i]?.mortgaged)) return 'Pay off mortgages in this set first';
  if (t.houses >= 5) return 'Fully built';
  if ((state.players[playerId]?.cash ?? 0) < houseCostOf(state, idx)) return 'Not enough cash';
  if (state.settings.evenBuild && !canBuildHouse(state, playerId, idx)) return 'Build evenly across the set';
  if (t.houses === 4 && state.remainingHotels <= 0) return 'Bank is out of hotels';
  if (t.houses < 4 && state.remainingHouses <= 0) return 'Bank is out of houses';
  return null;
}

export const PropertyManagerModal: React.FC<Props> = ({ state, localPlayerId, onClose, onBuildHouse, onSellHouse, onMortgage, onUnmortgage }) => {
  const me = state.players[localPlayerId];
  const tiles = ownedTiles(state, localPlayerId);
  const groups = GROUP_ORDER.map((g) => ({ group: g, tiles: tiles.filter((idx) => getTile(idx).group === g) })).filter((g) => g.tiles.length);

  return (
    <Modal size="lg" onClose={onClose} labelledBy="pm-title">
      <ModalHeader
        id="pm-title"
        eyebrow={`Cash ${formatINR(me?.cash ?? 0)} · Bank has ${state.remainingHouses} houses, ${state.remainingHotels} hotels`}
        title="Build & manage"
        icon={<Building2 size={20} />}
        onClose={onClose}
      />
      <ModalBody className="space-y-4">
        {groups.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">You don't own any properties yet. Land on one to buy it, or make a trade.</p>
        )}
        {groups.map(({ group, tiles: groupTiles }) => {
          const total = GROUP_TILES[group].length;
          const fullSet = hasMonopoly(state, localPlayerId, group);
          return (
            <section key={group} className="overflow-hidden rounded-xl border border-ink-700">
              <header className="flex items-center gap-2 bg-ink-900 px-3 py-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: GROUP_COLORS[group] }} />
                <span className="text-sm font-semibold text-white">{GROUP_LABELS[group]}</span>
                <span className="text-xs text-slate-500">
                  {groupTiles.length}/{total} owned
                </span>
                {fullSet && COLOR_GROUPS.includes(group) && <span className="chip ml-auto bg-amber-400/15 text-amber-300">Full set</span>}
              </header>
              <ul className="divide-y divide-ink-700">
                {groupTiles.map((idx) => {
                  const tile = getTile(idx);
                  const t = state.tiles[idx]!;
                  const isStreet = tile.type === 'property';
                  const hint = buildHint(state, localPlayerId, idx);
                  return (
                    <li key={idx} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${t.mortgaged ? 'text-slate-500 line-through' : 'text-white'}`}>{tile.name}</span>
                          {t.mortgaged && <span className="chip bg-rose-500/15 text-rose-300">Mortgaged</span>}
                        </div>
                        {isStreet && (
                          <div className="mt-1 flex items-center gap-1" aria-label={`${t.houses === 5 ? 'Hotel' : `${t.houses} houses`}`}>
                            {[0, 1, 2, 3].map((i) => (
                              <span
                                key={i}
                                className={`h-2.5 w-2.5 rounded-[2px] ${t.houses === 5 ? 'bg-ink-700' : i < t.houses ? 'bg-emerald-400' : 'bg-ink-700'}`}
                              />
                            ))}
                            <span className={`ml-1 h-2.5 w-4 rounded-[2px] ${t.houses === 5 ? 'bg-rose-500' : 'bg-ink-700'}`} />
                            {hint && <span className="ml-2 text-[11px] text-slate-500">{hint}</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {isStreet && (
                          <>
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              disabled={!canBuildHouse(state, localPlayerId, idx)}
                              onClick={() => onBuildHouse(idx)}
                            >
                              {t.houses === 4 ? 'Hotel' : 'House'} −{formatINR(houseCostOf(state, idx))}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={!canSellHouse(state, localPlayerId, idx)}
                              onClick={() => onSellHouse(idx)}
                            >
                              Sell +{formatINR(Math.floor((tile.houseCost ?? 0) / 2))}
                            </button>
                          </>
                        )}
                        {t.mortgaged ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={!canUnmortgage(state, localPlayerId, idx)}
                            onClick={() => onUnmortgage(idx)}
                          >
                            Unmortgage −{formatINR(unmortgageCost(idx))}
                          </button>
                        ) : (
                          state.settings.mortgageEnabled && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={!canMortgage(state, localPlayerId, idx)}
                              onClick={() => onMortgage(idx)}
                              title={groupHasBuildings(state, idx) ? 'Sell the buildings in this set first' : undefined}
                            >
                              Mortgage +{formatINR(mortgageValue(idx))}
                            </button>
                          )
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Done
        </button>
      </ModalFooter>
    </Modal>
  );
};
