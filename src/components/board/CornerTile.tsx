import React from 'react';
import { TileDefinition } from '../../types/game';
import { formatINR } from '../../lib/format';
import { SALARY_AMOUNT } from '../../engine/board';

interface Props {
  definition: TileDefinition;
  isCurrentPosition?: boolean;
  vacationPool?: number;
  vacationEnabled?: boolean;
  chaiRest?: boolean;
  onClick?: () => void;
}

export const CornerTile: React.FC<Props> = ({
  definition,
  isCurrentPosition,
  vacationPool = 0,
  vacationEnabled = true,
  chaiRest = false,
  onClick,
}) => {
  const ring = isCurrentPosition ? { boxShadow: 'inset 0 0 0 2px #F59E0B', zIndex: 10 } : undefined;
  const base = 'relative flex h-full w-full flex-col items-center justify-center overflow-hidden text-center';

  // Tihar Jail: a cell in the inner corner, "Just visiting" lane along the outer edges.
  if (definition.index === 10) {
    return (
      <div className={`${base} bg-paper-100`} style={ring} onClick={onClick} title="Tihar Jail">
        <div className="absolute right-0 top-0 flex h-[68%] w-[68%] flex-col items-center justify-center border-b-2 border-l-2 border-ink-700 bg-orange-200/90">
          <div className="pointer-events-none absolute inset-0 flex justify-evenly">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-full w-[3px] bg-ink-700/35" />
            ))}
          </div>
          <span className="tile-corner-title relative font-display font-extrabold uppercase text-ink-900">Tihar</span>
          <span className="tile-corner-title relative font-display font-extrabold uppercase text-ink-900">Jail</span>
        </div>
        <span className="tile-corner-sub absolute bottom-[4%] left-0 right-[32%] font-semibold uppercase tracking-wide text-ink-600">
          Just
        </span>
        <span
          className="tile-corner-sub absolute left-[2%] top-[34%] font-semibold uppercase tracking-wide text-ink-600"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          visiting
        </span>
      </div>
    );
  }

  let icon = '';
  let title = '';
  let sub: React.ReactNode = null;
  let tone = 'bg-paper-100';

  switch (definition.index) {
    case 0:
      icon = '🏁';
      title = 'Shuru';
      sub = (
        <>
          Collect {formatINR(SALARY_AMOUNT)}
          <span className="mt-[3%] block font-display text-[1.6em] font-black leading-none text-emerald-700">←</span>
        </>
      );
      tone = 'bg-emerald-100';
      break;
    case 20:
      icon = '☕';
      title = 'Chai Break';
      sub = (
        <>
          {vacationEnabled && (
            <span className="rounded-full bg-amber-500/90 px-[6%] py-[2%] font-bold text-white">{formatINR(vacationPool)} pool</span>
          )}
          {chaiRest && <span className="mt-[3%] block">Rest 1 turn</span>}
          {!vacationEnabled && !chaiRest && 'Free rest stop'}
        </>
      );
      tone = 'bg-amber-100';
      break;
    case 30:
      icon = '🚓';
      title = 'Police Custody';
      sub = 'Go to jail';
      tone = 'bg-rose-100';
      break;
  }

  return (
    <div className={`${base} gap-[4%] p-[6%] ${tone}`} style={ring} onClick={onClick} title={definition.name}>
      <span className="tile-corner-icon">{icon}</span>
      <span className="tile-corner-title font-display font-extrabold uppercase tracking-tight text-ink-900">{title}</span>
      {sub && <span className="tile-corner-sub font-semibold text-ink-600">{sub}</span>}
    </div>
  );
};
