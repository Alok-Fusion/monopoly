import React from 'react';

export const AUTHOR_NAME = 'Alok Kushwaha';
export const AUTHOR_URL = 'https://github.com/Alok-Fusion';

const POLICIES: [string, string][] = [
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms'],
  ['/safety', 'Safety'],
];

const linkClass = 'underline-offset-4 hover:underline focus-visible:underline';

/** "Made by …" line linking to the author's GitHub, plus the policy pages. */
export const Credit: React.FC<{ className?: string }> = ({ className = '' }) => (
  <p className={className}>
    Made by{' '}
    <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" className={`font-semibold ${linkClass}`}>
      {AUTHOR_NAME}
    </a>
    {POLICIES.map(([href, label]) => (
      <React.Fragment key={href}>
        <span aria-hidden="true"> · </span>
        <a href={href} target="_blank" rel="noopener" className={`credit-policy ${linkClass}`}>
          {label}
        </a>
      </React.Fragment>
    ))}
  </p>
);
