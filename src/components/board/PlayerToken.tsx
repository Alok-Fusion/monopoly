import React from 'react';
import { TokenId } from '../../types/game';

interface Props {
  tokenId: TokenId;
  color: string;
  name: string;
  size?: 'board' | 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  dimmed?: boolean;
}

export const TOKEN_EMOJIS: Record<TokenId, { emoji: string; label: string }> = {
  'auto-rickshaw': { emoji: '🛺', label: 'Auto Rickshaw' },
  'cricket-bat': { emoji: '🏏', label: 'Cricket Bat' },
  'chai-cup': { emoji: '☕', label: 'Cutting Chai' },
  'bullet-bike': { emoji: '🏍️', label: 'Motorbike' },
  'royal-tiger': { emoji: '🐅', label: 'Bengal Tiger' },
  peacock: { emoji: '🦚', label: 'Peacock' },
  kite: { emoji: '🪁', label: 'Patang Kite' },
  elephant: { emoji: '🐘', label: 'Elephant' },
};

const SIZES: Record<NonNullable<Props['size']>, string> = {
  board: 'board-token border-[1.5px]',
  xs: 'w-5 h-5 text-[11px] border',
  sm: 'w-7 h-7 text-sm border-2',
  md: 'w-9 h-9 text-lg border-2',
  lg: 'w-12 h-12 text-2xl border-[3px]',
};

export const PlayerToken: React.FC<Props> = ({ tokenId, color, name, size = 'md', className = '', dimmed }) => {
  const token = TOKEN_EMOJIS[tokenId] ?? { emoji: '♟️', label: 'Token' };
  return (
    <span
      title={`${name} (${token.label})`}
      className={`relative inline-flex shrink-0 select-none items-center justify-center rounded-full border-white/90 leading-none shadow-md ${SIZES[size]} ${dimmed ? 'opacity-40 grayscale' : ''} ${className}`}
      style={{
        backgroundColor: color,
        backgroundImage: 'radial-gradient(circle at 32% 26%, rgba(255,255,255,0.55), rgba(255,255,255,0) 46%), linear-gradient(180deg, rgba(255,255,255,0) 50%, rgba(0,0,0,0.22))',
        boxShadow: `0 2px 6px rgba(0,0,0,0.5), 0 0 0 1px ${color}66, 0 0 12px -2px ${color}`,
      }}
    >
      <span className="pointer-events-none drop-shadow-sm">{token.emoji}</span>
    </span>
  );
};
