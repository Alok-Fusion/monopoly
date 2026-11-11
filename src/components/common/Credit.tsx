import React from 'react';

export const AUTHOR_NAME = 'Alok Kushwaha';
export const AUTHOR_URL = 'https://github.com/Alok-Fusion';

/** "Made by …" line linking to the author's GitHub. */
export const Credit: React.FC<{ className?: string }> = ({ className = '' }) => (
  <p className={className}>
    Made by{' '}
    <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-4 hover:underline focus-visible:underline">
      {AUTHOR_NAME}
    </a>
  </p>
);
