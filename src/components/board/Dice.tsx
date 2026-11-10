import React, { useEffect, useRef, useState } from 'react';

/** Pip positions on a 3×3 grid for each face value. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * Where each face sits on the cube (opposite faces add up to 7), and the cube
 * rotation that brings that face to the front.
 */
const FACES: { value: number; place: string; show: [number, number] }[] = [
  { value: 1, place: 'rotateY(0deg)', show: [0, 0] },
  { value: 6, place: 'rotateY(180deg)', show: [0, 180] },
  { value: 3, place: 'rotateY(90deg)', show: [0, -90] },
  { value: 4, place: 'rotateY(-90deg)', show: [0, 90] },
  { value: 2, place: 'rotateX(90deg)', show: [-90, 0] },
  { value: 5, place: 'rotateX(-90deg)', show: [90, 0] },
];

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Next angle ≥ current + extra full spins that ends on `target` (mod 360). */
function spinTo(current: number, target: number, spins: number): number {
  const base = Math.ceil(current / 360) * 360;
  return base + spins * 360 + target;
}

const Die: React.FC<{ value: number; rolling: boolean; rollKey: number; delay: number }> = ({ value, rolling, rollKey, delay }) => {
  const face = FACES.find((f) => f.value === value) ?? FACES[0]!;
  const [rot, setRot] = useState({ x: face.show[0], y: face.show[1], z: 0, animate: false });
  const lastKey = useRef(rollKey);
  const [landing, setLanding] = useState(false);

  useEffect(() => {
    if (rolling) return;
    const isNewRoll = rollKey !== lastKey.current;
    lastKey.current = rollKey;
    const target = FACES.find((f) => f.value === value) ?? FACES[0]!;
    if (!isNewRoll || reducedMotion()) {
      setRot({ x: target.show[0], y: target.show[1], z: 0, animate: false });
      return;
    }
    setRot((r) => ({
      x: spinTo(r.x, target.show[0], 1 + Math.floor(Math.random() * 2)),
      y: spinTo(r.y, target.show[1], 2 + Math.floor(Math.random() * 2)),
      z: Math.round((Math.random() - 0.5) * 24),
      animate: true,
    }));
    setLanding(true);
    const t = setTimeout(() => setLanding(false), 950 + delay);
    return () => clearTimeout(t);
  }, [rollKey, value, rolling, delay]);

  return (
    <div className="die-stage">
      <div className={`die-bounce ${rolling ? 'die-tumbling' : ''} ${landing ? 'die-landing' : ''}`} style={{ animationDelay: `${delay}ms` }}>
        <div className="die-tilt">
        <div
          className="die-cube"
          style={{
            transform: `rotateZ(${rot.z}deg) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
            transition: rot.animate ? `transform 0.95s cubic-bezier(0.18, 0.9, 0.25, 1.08) ${delay}ms` : 'none',
          }}
        >
          {FACES.map((f) => (
            <div key={f.value} className="die-face" style={{ transform: `${f.place} translateZ(calc(var(--die) / 2))` }}>
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="flex items-center justify-center">
                  {PIPS[f.value]!.includes(i) && <span className={`die-pip ${f.value === 1 || f.value === 4 ? 'die-pip-red' : ''}`} />}
                </span>
              ))}
            </div>
          ))}
        </div>
        </div>
      </div>
      <div className={`die-shadow ${rolling ? 'die-shadow-rolling' : ''}`} />
    </div>
  );
};

interface Props {
  dice: [number, number];
  isRolling: boolean;
  rollKey: number;
  canRoll?: boolean;
  onRoll?: () => void;
}

export const Dice: React.FC<Props> = ({ dice, isRolling, rollKey, canRoll, onRoll }) => {
  const content = (
    <>
      <Die value={dice[0]} rolling={isRolling} rollKey={rollKey} delay={0} />
      <Die value={dice[1]} rolling={isRolling} rollKey={rollKey} delay={90} />
    </>
  );
  const label = `Dice showing ${dice[0]} and ${dice[1]}`;
  if (canRoll && onRoll) {
    return (
      <button
        type="button"
        onClick={onRoll}
        className="group flex items-center gap-[clamp(10px,2.6cqw,22px)] rounded-2xl p-1 transition hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
        aria-label={`${label}. Tap to roll`}
        title="Tap to roll"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-[clamp(10px,2.6cqw,22px)] p-1" role="img" aria-label={label}>
      {content}
    </div>
  );
};
