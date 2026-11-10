import React, { useState } from 'react';
import { TileDefinition, TileState } from '../../types/game';
import { formatINR } from '../../lib/format';
import { GROUP_COLORS, TILE_EMBLEMS } from '../../lib/tiles';

export type TileOrientation = 'bottom' | 'left' | 'top' | 'right';

interface Props {
  definition: TileDefinition;
  state: TileState;
  isHighlighted?: boolean;
  highlightColor?: string;
  ownerColor?: string;
  isCurrentPosition?: boolean;
  onClick?: () => void;
  orientation: TileOrientation;
}

/** Layout so the colour bar always faces the centre of the board. */
const LAYOUT: Record<TileOrientation, { flex: string; bar: string; band: string; houses: string; text: string; shade: string }> = {
  bottom: {
    flex: 'flex-col',
    bar: 'h-[16%] w-full',
    band: 'h-[22%] w-full',
    houses: 'flex-row',
    text: 'justify-end',
    shade: 'bg-gradient-to-b from-black/5 via-black/30 to-black/80',
  },
  top: {
    flex: 'flex-col-reverse',
    bar: 'h-[16%] w-full',
    band: 'h-[22%] w-full',
    houses: 'flex-row',
    text: 'justify-start',
    shade: 'bg-gradient-to-t from-black/5 via-black/30 to-black/80',
  },
  left: {
    flex: 'flex-row-reverse',
    bar: 'w-[16%] h-full',
    band: 'w-[22%] h-full',
    houses: 'flex-col',
    text: 'justify-center',
    shade: 'bg-gradient-to-l from-black/20 via-black/45 to-black/75',
  },
  right: {
    flex: 'flex-row',
    bar: 'w-[16%] h-full',
    band: 'w-[22%] h-full',
    houses: 'flex-col',
    text: 'justify-center',
    shade: 'bg-gradient-to-r from-black/20 via-black/45 to-black/75',
  },
};

/** Little house: white roof-and-walls with a dark outline so it reads on any owner colour. */
const HouseIcon: React.FC<{ vertical: boolean }> = ({ vertical }) => (
  <svg
    viewBox="0 0 16 16"
    className={vertical ? 'h-auto w-[62%] max-w-[14px]' : 'h-[66%] w-auto max-h-[14px]'}
    aria-hidden="true"
  >
    <path d="M8 1.6 15 7.6h-2.1V14.4H3.1V7.6H1z" fill="#fff" stroke="rgba(15,23,42,0.55)" strokeWidth="1.1" strokeLinejoin="round" />
    <rect x="6.4" y="9.6" width="3.2" height="4.8" rx="0.5" fill="rgba(15,23,42,0.35)" />
  </svg>
);

/** Hotel: a wide red block with an "H". */
const HotelIcon: React.FC<{ vertical: boolean }> = ({ vertical }) => (
  <svg viewBox="0 0 24 16" className={vertical ? 'h-auto w-[78%] max-w-[24px]' : 'h-[74%] w-auto max-h-[16px]'} aria-hidden="true">
    <path d="M1.5 6.5 12 1l10.5 5.5V15h-21z" fill="#e11d48" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
    <text x="12" y="13.2" textAnchor="middle" fontSize="8" fontWeight="900" fill="#fff" fontFamily="system-ui, sans-serif">
      H
    </text>
  </svg>
);

export const Tile: React.FC<Props> = ({
  definition,
  state,
  isHighlighted,
  highlightColor,
  ownerColor,
  isCurrentPosition,
  onClick,
  orientation,
}) => {
  const [photoFailed, setPhotoFailed] = useState(false);
  const layout = LAYOUT[orientation];
  const hasBar = definition.type === 'property';
  const barColor = GROUP_COLORS[definition.group];
  const emblem = TILE_EMBLEMS[definition.index];
  const isBuyable = !!definition.price && definition.type !== 'tax';
  const photo = !!definition.image && !photoFailed;
  const vertical = orientation === 'left' || orientation === 'right';

  const ring = isHighlighted
    ? { boxShadow: `inset 0 0 0 2px ${highlightColor ?? '#FBBF24'}, 0 0 14px ${highlightColor ?? '#FBBF24'}aa`, zIndex: 20 }
    : isCurrentPosition
      ? { boxShadow: 'inset 0 0 0 2px #F59E0B, 0 0 14px rgba(245,158,11,0.6)', zIndex: 10 }
      : undefined;

  const label = `${definition.name}${definition.price ? `, ${formatINR(definition.price)}` : ''}${
    state.mortgaged ? ', mortgaged' : ''
  }`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={definition.name}
      className={`group relative flex h-full w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${layout.flex} ${
        photo
          ? 'bg-ink-800'
          : 'bg-gradient-to-b from-paper-50 to-paper-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-colors hover:from-white hover:to-paper-50'
      } ${isBuyable ? 'cursor-pointer' : 'cursor-default'}`}
      style={ring}
    >
      {/* Landmark photo across the whole tile */}
      {photo && (
        <>
          <img
            src={definition.image}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setPhotoFailed(true)}
            className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-110 ${
              state.mortgaged ? 'grayscale' : 'saturate-[1.15]'
            }`}
          />
          <div className={`pointer-events-none absolute inset-0 ${layout.shade}`} />
        </>
      )}

      {hasBar && (
        <div
          className={`relative z-10 shrink-0 shadow-[0_1px_4px_rgba(0,0,0,0.35)] ${layout.bar}`}
          style={{ backgroundColor: barColor, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.3), rgba(0,0,0,0.12))' }}
        
        />
      )}

      {/* Content */}
      <div
        className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col items-center gap-[5%] px-[3%] py-[6%] text-center ${
          photo ? layout.text : 'justify-center'
        }`}
      >
        {definition.type === 'chance' ? (
          <>
            <span className="tile-corner-icon font-display font-black text-pink-600" style={{ fontSize: 'clamp(10px, 3.2cqw, 26px)' }}>
              ?
            </span>
            <span className="tile-name font-bold uppercase tracking-wide text-pink-700">Kismat</span>
          </>
        ) : definition.type === 'chest' ? (
          <>
            <span className="tile-emblem">💰</span>
            <span className="tile-name font-bold uppercase tracking-wide text-amber-700">Khazana</span>
          </>
        ) : photo ? (
          <>
            <span className="tile-name line-clamp-2 max-w-full font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
              {definition.name}
            </span>
            {definition.price !== undefined && (
              <span className="tile-price rounded-full bg-black/55 px-[0.6em] py-[0.25em] font-bold text-amber-200 ring-1 ring-white/15 backdrop-blur-[2px]">
                {formatINR(definition.price)}
              </span>
            )}
          </>
        ) : (
          <>
            {emblem && <span className="tile-emblem opacity-90">{emblem}</span>}
            <span className="tile-name line-clamp-2 max-w-full font-semibold text-ink-900">{definition.name}</span>
            {definition.price !== undefined && (
              <span className={`tile-price font-bold ${definition.type === 'tax' ? 'text-rose-700' : 'text-ink-600'}`}>
                {definition.type === 'tax' ? 'Pay ' : ''}
                {formatINR(definition.price)}
              </span>
            )}
          </>
        )}
      </div>

      {/* Owner band on the outer edge: owner's colour, plus any houses / hotel */}
      {ownerColor && (
        <div
          className={`relative z-10 flex shrink-0 items-center justify-center ${vertical ? 'flex-col gap-[5%]' : 'flex-row gap-[6%]'} ${layout.band}`}
          style={{
            backgroundColor: ownerColor,
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.08) 45%, rgba(0,0,0,0.22) 100%)',
            boxShadow: `0 0 12px ${ownerColor}aa, inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(0,0,0,0.25)`,
          }}
          title={state.houses === 5 ? 'Hotel' : state.houses ? `${state.houses} house${state.houses > 1 ? 's' : ''}` : 'Owned'}
        >
          {state.houses === 5 ? (
            <HotelIcon vertical={vertical} />
          ) : (
            Array.from({ length: state.houses }).map((_, i) => <HouseIcon key={i} vertical={vertical} />)
          )}
        </div>
      )}

      {/* Mortgaged overlay */}
      {state.mortgaged && (
        <div className="mortgaged-stripes pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-ink-900/30">
          <span className="tile-price rounded-sm bg-rose-700 px-[3px] py-[1px] font-bold uppercase text-white shadow">Mortgaged</span>
        </div>
      )}


    </button>
  );
};
