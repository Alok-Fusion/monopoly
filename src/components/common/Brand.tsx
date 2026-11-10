import React from 'react';

export const GAME_NAME = 'Bazaar';

export const Brand: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const box = { sm: 'h-7 w-7 text-base rounded-lg', md: 'h-9 w-9 text-xl rounded-xl', lg: 'h-12 w-12 text-2xl rounded-2xl' }[size];
  const text = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl sm:text-4xl' }[size];
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex shrink-0 items-center justify-center bg-amber-400 font-black text-ink-950 shadow-lg shadow-amber-500/20 ${box}`}
        aria-hidden="true"
      >
        ₹
      </span>
      <span className={`font-display font-extrabold tracking-tight text-white ${text}`}>
        {GAME_NAME}
      </span>
    </div>
  );
};
