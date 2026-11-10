/** Injected by vite.config.ts: this computer's LAN address, or '' if none was found. */
declare const __LAN_HOST__: string;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export type InviteReach = 'internet' | 'lan' | 'this-device';

export interface InviteLink {
  url: string;
  /** Who can actually open the link */
  reach: InviteReach;
}

/**
 * Builds the link to share for a room. When the game is opened via localhost,
 * a plain origin-based link would point at each friend's *own* device, so we swap
 * in this computer's network address instead.
 */
export function inviteLink(roomCode: string): InviteLink {
  const { protocol, hostname, port, pathname } = window.location;
  const query = `?room=${encodeURIComponent(roomCode)}`;

  if (LOCAL_HOSTS.has(hostname)) {
    const lan = typeof __LAN_HOST__ === 'string' ? __LAN_HOST__ : '';
    if (lan) return { url: `${protocol}//${lan}${port ? `:${port}` : ''}${pathname}${query}`, reach: 'lan' };
    return { url: `${window.location.origin}${pathname}${query}`, reach: 'this-device' };
  }
  const privateLan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname) || hostname.endsWith('.local');
  return { url: `${window.location.origin}${pathname}${query}`, reach: privateLan ? 'lan' : 'internet' };
}

export const REACH_NOTE: Record<InviteReach, string> = {
  internet: 'Anyone with this link can join.',
  lan: 'Works for friends on the same Wi-Fi. To play over the internet, put the built game online (npm run build → upload the dist folder).',
  'this-device': 'This link only works on this computer. Open the game using your network address, or put it online, so friends can join.',
};
