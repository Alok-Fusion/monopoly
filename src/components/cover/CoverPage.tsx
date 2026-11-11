import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { TILES } from '../../engine/board';
import { GROUP_COLORS, TILE_EMBLEMS } from '../../lib/tiles';
import { sounds } from '../../lib/sound';
import { Credit } from '../common/Credit';
import './cover.css';

interface Props {
  /** Called when the player is ready to go in */
  onEnter: () => void;
  /** Shown on the button when arriving from an invite link */
  joiningRoom?: string | null;
}

/* ------------------------------ mini board ------------------------------ */

/** Grid position (1-based) of each of the 40 tiles on an 11×11 board. */
function cellOf(i: number): { col: number; row: number; side: 'bottom' | 'left' | 'top' | 'right' | 'corner' } {
  if (i === 0) return { col: 11, row: 11, side: 'corner' };
  if (i < 10) return { col: 11 - i, row: 11, side: 'bottom' };
  if (i === 10) return { col: 1, row: 11, side: 'corner' };
  if (i < 20) return { col: 1, row: 11 - (i - 10), side: 'left' };
  if (i === 20) return { col: 1, row: 1, side: 'corner' };
  if (i < 30) return { col: i - 19, row: 1, side: 'top' };
  if (i === 30) return { col: 11, row: 1, side: 'corner' };
  return { col: 11, row: i - 29, side: 'right' };
}

const BAR: Record<string, React.CSSProperties> = {
  bottom: { left: 0, right: 0, top: 0, height: '24%' },
  top: { left: 0, right: 0, bottom: 0, height: '24%' },
  left: { top: 0, bottom: 0, right: 0, width: '24%' },
  right: { top: 0, bottom: 0, left: 0, width: '24%' },
};
const CORNER_ICON: Record<number, string> = { 0: '🏁', 10: '⛓️', 20: '☕', 30: '🚓' };

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
const FACES: [number, string][] = [
  [1, 'rotateY(0deg)'],
  [6, 'rotateY(180deg)'],
  [3, 'rotateY(90deg)'],
  [4, 'rotateY(-90deg)'],
  [2, 'rotateX(90deg)'],
  [5, 'rotateX(-90deg)'],
];

const CoverDie: React.FC = () => (
  <div className="cover-die">
    <div className="die-cube">
      {FACES.map(([v, place]) => (
        <div key={v} className="die-face" style={{ transform: `${place} translateZ(calc(var(--die) / 2))` }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="flex items-center justify-center">
              {PIPS[v]!.includes(i) && <span className={`die-pip ${v === 1 || v === 4 ? 'die-pip-red' : ''}`} />}
            </span>
          ))}
        </div>
      ))}
    </div>
  </div>
);

const TOKENS: [string, string][] = [
  ['🛺', '#3B82F6'],
  ['🐘', '#EF4444'],
  ['🦚', '#10B981'],
  ['☕', '#F59E0B'],
];

/* ------------------------------ night scene ------------------------------ */

const COINS: { left: string; top: string; size: number; delay: number; speed: number; blur?: number }[] = [
  { left: '9%', top: '30%', size: 46, delay: 0, speed: 3.2 },
  { left: '86%', top: '26%', size: 36, delay: -2, speed: 2.6, blur: 1.5 },
  { left: '88%', top: '68%', size: 52, delay: -1, speed: 3.6 },
  { left: '13%', top: '70%', size: 30, delay: -4, speed: 2.9, blur: 2.5 },
  { left: '24%', top: '46%', size: 20, delay: -3, speed: 2.2, blur: 3.5 },
  { left: '76%', top: '48%', size: 22, delay: -5, speed: 2.4, blur: 3 },
];

/** Soft out-of-focus lights: [left %, top %, size px, colour, blur px, delay s] */
const BOKEH: [number, number, number, string, number, number][] = [
  [8, 18, 160, 'rgba(245,158,11,0.18)', 22, 0],
  [82, 12, 120, 'rgba(244,114,182,0.14)', 18, -6],
  [70, 78, 190, 'rgba(245,158,11,0.12)', 28, -12],
  [18, 82, 130, 'rgba(45,212,191,0.10)', 22, -3],
  [48, 6, 90, 'rgba(253,230,138,0.14)', 14, -9],
  [92, 46, 80, 'rgba(251,146,60,0.16)', 12, -15],
  [4, 52, 70, 'rgba(253,230,138,0.12)', 10, -18],
  [36, 90, 110, 'rgba(244,114,182,0.10)', 20, -21],
];

const BULB_COLORS = ['#fde68a', '#fbbf24', '#fb7185', '#fef3c7', '#f59e0b', '#fdba74'];

/** Fairy lights strung across the top, sagging in a gentle curve. */
const StringLights: React.FC<{ count: number; sag: number; offset?: number; dim?: boolean }> = ({ count, sag, offset = 0, dim }) => {
  const bulbs = Array.from({ length: count }, (_, i) => {
    const x = i / (count - 1);
    return { x: x * 100, y: offset + 4 * sag * x * (1 - x), color: BULB_COLORS[i % BULB_COLORS.length]! };
  });
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={`M0 ${offset} Q 50 ${offset + 2 * sag} 100 ${offset}`}
          fill="none"
          stroke="rgba(30,27,50,0.95)"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {bulbs.map((b, i) => (
        <span
          key={i}
          className="cover-bulb"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            background: b.color,
            boxShadow: `0 0 8px 2px ${b.color}, 0 0 22px 4px ${b.color}66`,
            opacity: dim ? 0.55 : 1,
            animationDelay: `${(i * 0.37) % 2.8}s`,
          }}
        />
      ))}
    </>
  );
};

/** A clay diya with a living flame. */
const Diya: React.FC<{ style: React.CSSProperties; size: number; blur?: number; delay?: number }> = ({ style, size, blur = 0, delay = 0 }) => {
  const id = useId().replace(/:/g, '');
  return (
  <div
    className="cover-diya"
    style={{ ...style, width: size, height: size, filter: blur ? `blur(${blur}px)` : undefined, animationDelay: `${delay}s` }}
    aria-hidden="true"
  >
    <svg viewBox="0 0 100 100">
      <defs>
        <radialGradient id={`glow${id}`} cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="rgba(255,190,90,0.75)" />
          <stop offset="100%" stopColor="rgba(255,150,40,0)" />
        </radialGradient>
        <linearGradient id={`clay${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d9783a" />
          <stop offset="100%" stopColor="#7a3412" />
        </linearGradient>
        <radialGradient id={`flame${id}`} cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#fff8dc" />
          <stop offset="45%" stopColor="#ffd56b" />
          <stop offset="100%" stopColor="#ff7a1a" />
        </radialGradient>
      </defs>
      <circle className="cover-diya-glow" cx="50" cy="40" r="46" fill={`url(#glow${id})`} style={{ animationDelay: `${delay}s` }} />
      <path className="cover-diya-flame" d="M50 14 C 58 30, 60 40, 50 50 C 40 40, 42 30, 50 14 Z" fill={`url(#flame${id})`} />
      <path d="M14 56 Q 50 52 86 56 Q 80 82 50 84 Q 20 82 14 56 Z" fill={`url(#clay${id})`} />
      <path d="M14 56 Q 50 62 86 56" fill="none" stroke="#f0a060" strokeWidth="2" opacity="0.8" />
      <path d="M86 56 Q 94 54 96 50" fill="none" stroke="#b5561f" strokeWidth="4" strokeLinecap="round" />
      <circle cx="34" cy="70" r="2.2" fill="#fcd34d" opacity="0.8" />
      <circle cx="50" cy="73" r="2.2" fill="#fcd34d" opacity="0.8" />
      <circle cx="66" cy="70" r="2.2" fill="#fcd34d" opacity="0.8" />
    </svg>
  </div>
  );
};

/* ------------------------------ preloading ------------------------------ */

/** Warm up the browser cache with the board photos and fonts so the game appears complete. */
function usePreload(): number {
  const urls = useMemo(() => TILES.map((t) => t.image).filter((u): u is string => !!u), []);
  const [done, setDone] = useState(0);
  const total = urls.length + 1;
  useEffect(() => {
    let alive = true;
    const tick = () => alive && setDone((d) => d + 1);
    urls.forEach((src) => {
      const img = new Image();
      img.onload = tick;
      img.onerror = tick; // a missing photo just falls back to the emblem tile
      img.src = src;
    });
    (document.fonts?.ready ?? Promise.resolve()).then(tick, tick);
    // Never keep anyone waiting on a slow network
    const cap = setTimeout(() => alive && setDone(total), 6000);
    return () => {
      alive = false;
      clearTimeout(cap);
    };
  }, [urls, total]);
  return Math.min(1, done / total);
}

/* ------------------------------ page ------------------------------ */

export const CoverPage: React.FC<Props> = ({ onEnter, joiningRoom }) => {
  const progress = usePreload();
  const ready = progress >= 1;
  const [leaving, setLeaving] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const dust = useMemo(
    () => Array.from({ length: 22 }, (_, i) => ({ left: (i * 37) % 100, delay: -((i * 1.7) % 12), dur: 9 + (i % 5) * 1.6, size: 2 + (i % 3) })),
    []
  );

  // Gentle parallax: the whole scene tilts toward the mouse (desktop only)
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: fine)').matches) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = stageRef.current;
        if (!el) return;
        const x = e.clientX / window.innerWidth - 0.5;
        const y = e.clientY / window.innerHeight - 0.5;
        el.style.setProperty('--ry', `${(x * 16).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  const enter = () => {
    if (leaving) return;
    sounds.playChime();
    setLeaving(true);
    setTimeout(onEnter, 650);
  };

  // Enter starts the game once everything is ready
  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') enter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, leaving]);

  return (
    <main className={`cover-root ${leaving ? 'cover-exit' : ''}`} aria-label="Bazaar — welcome">
      {/* Background lights */}
      <div className="cover-bokeh" aria-hidden="true">
        {BOKEH.map(([left, top, size, color, blur, delay], i) => (
          <span
            key={i}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              background: `radial-gradient(circle, ${color}, transparent 70%)`,
              filter: `blur(${blur}px)`,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>
      <div className="cover-lights" aria-hidden="true">
        <StringLights count={24} sag={22} offset={12} />
        <StringLights count={14} sag={18} offset={44} dim />
      </div>

      <Diya style={{ left: '6%', top: '58%' }} size={78} delay={-1} />
      <Diya style={{ right: '7%', top: '64%' }} size={92} delay={-3} />
      <Diya style={{ left: '20%', top: '22%' }} size={40} blur={2.5} delay={-2} />
      <Diya style={{ right: '22%', top: '30%' }} size={34} blur={3} delay={-4} />

      <div className="cover-coins" aria-hidden="true">
        {COINS.map((c, i) => (
          <div
            key={i}
            className="cover-coin-float"
            style={{ left: c.left, top: c.top, animationDelay: `${c.delay}s`, filter: c.blur ? `blur(${c.blur}px)` : undefined }}
          >
            <div
              className="cover-coin"
              style={{ width: c.size, height: c.size, fontSize: c.size * 0.52, animationDuration: `${c.speed}s`, animationDelay: `${c.delay}s` }}
            >
              ₹
            </div>
          </div>
        ))}
      </div>

      <div className="cover-dust" aria-hidden="true">
        {dust.map((d, i) => (
          <span key={i} style={{ left: `${d.left}%`, width: d.size, height: d.size, animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s` }} />
        ))}
      </div>

      {/* Title */}
      <div className="cover-title cover-rise">
        <span className="cover-kicker">Let&rsquo;s play</span>
        <h1 className="cover-bazaar">
          <span className="cover-bazaar-depth">Bazaar</span>
          <span className="cover-bazaar-face" aria-hidden="true">
            Bazaar
          </span>
        </h1>
        <div className="cover-subtitle">The Indian property-trading game</div>
      </div>

      {/* 3D board */}
      <div className="cover-stage cover-rise" ref={stageRef} style={{ animationDelay: '0.15s' }} aria-hidden="true">
        <div className="cover-spotlight" />
        <div className="cover-scene">
          <div className="cover-board-tilt">
            <div className="cover-board-shadow" />
            <div className="cover-board">
              <div className="cover-board-grid">
                {TILES.map((t, i) => {
                  const { col, row, side } = cellOf(i);
                  const color = t.type === 'property' ? GROUP_COLORS[t.group] : null;
                  return (
                    <div key={i} className="cover-cell" style={{ gridColumn: col, gridRow: row }}>
                      {side === 'corner' ? (
                        <span style={{ fontSize: '170%' }}>{CORNER_ICON[i]}</span>
                      ) : (
                        <>
                          {color && <span className="cover-cell-bar" style={{ ...BAR[side], backgroundColor: color }} />}
                          <span style={{ opacity: 0.9 }}>{t.type === 'chance' ? '❓' : t.type === 'chest' ? '💰' : TILE_EMBLEMS[i] ?? ''}</span>
                        </>
                      )}
                    </div>
                  );
                })}
                <div className="cover-center" style={{ gridColumn: '2 / 11', gridRow: '2 / 11' }}>
                  <span className="cover-center-logo">Bazaar</span>
                </div>
              </div>
              <div className="cover-token-track">
                {TOKENS.map(([emoji, color], i) => (
                  <div key={emoji} className="cover-token" style={{ animationDelay: `${i * -4}s` }}>
                    <div className="cover-token-stand">
                      <div
                        className="cover-token-puck"
                        style={{
                          backgroundColor: color,
                          backgroundImage: 'radial-gradient(circle at 32% 26%, rgba(255,255,255,0.55), rgba(255,255,255,0) 46%)',
                          animationDelay: `${i * -0.12}s`,
                        }}
                      >
                        {emoji}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="cover-side cover-side-front" />
            <div className="cover-side cover-side-back" />
            <div className="cover-side cover-side-left" />
            <div className="cover-side cover-side-right" />
          </div>
          <div className="cover-dice">
            <CoverDie />
            <CoverDie />
          </div>
        </div>
      </div>

      {/* Call to action */}
      <div className="cover-cta cover-rise" style={{ animationDelay: '0.3s' }}>
        {ready ? (
          <>
            <button type="button" className="cover-play" onClick={enter} autoFocus>
              {joiningRoom ? `Join room ${joiningRoom}` : "Let's play"} <span aria-hidden="true">→</span>
            </button>
            <span className="cover-hint">or press Enter</span>
          </>
        ) : (
          <>
            <div
              className="cover-progress"
              role="progressbar"
              aria-label="Loading the game"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div style={{ width: `${Math.max(6, progress * 100)}%` }} />
            </div>
            <span className="cover-hint">Lighting the diyas… {Math.round(progress * 100)}%</span>
          </>
        )}
      </div>

      <div className="cover-vignette" aria-hidden="true" />
      <Credit className="cover-credit" />
    </main>
  );
};
