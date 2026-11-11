import type { GameSettings, TeamId, TokenId } from '../types/game';

/**
 * Checks on anything a player types or sends. The game server runs these through the
 * rules, so a modified browser can't get round them.
 */

export const TOKEN_IDS: readonly TokenId[] = ['auto-rickshaw', 'cricket-bat', 'chai-cup', 'bullet-bike', 'royal-tiger', 'peacock', 'kite', 'elephant'];
export const TEAM_IDS: readonly TeamId[] = ['team-1', 'team-2', 'team-3', 'team-4'];

export const MAX_NAME_LENGTH = 18;
export const MAX_CHAT_LENGTH = 200;

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const isTokenId = (v: unknown): v is TokenId => TOKEN_IDS.includes(v as TokenId);
export const isTeamId = (v: unknown): v is TeamId => TEAM_IDS.includes(v as TeamId);
export const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/**
 * Text with invisible tricks removed: control characters, and the direction overrides
 * that can make a name or message read differently from what it says. Emoji joiners stay.
 */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .slice(0, max * 4)
    // Fancy look-alike letters (full-width, script, ligatures) become plain ones, so names can't imitate each other
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f­؜᠎​‎‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

/*
 * A light swear filter for chat and names (English and common Hindi/Hinglish). It can't
 * catch everything, which is why players can also mute each other.
 */
const BAD_WORDS = [
  'fuck\\w*', 'f+u+c+k+', 'fck\\w*', 'motherfuck\\w*', 'shit\\w*', 'bullshit', 'bitch\\w*', 'bastard\\w*', 'asshole\\w*',
  'arsehole\\w*', 'dick', 'dickhead\\w*', 'cunt\\w*', 'pussy', 'porn\\w*', 'slut\\w*', 'whore\\w*', 'wank\\w*',
  'nigg\\w*', 'fag', 'faggot\\w*', 'retard\\w*', 'rape\\w*', 'rapist\\w*', 'cock', 'cocks', 'boobs?', 'tits?',
  'chut\\w*', 'chutiy\\w*', 'madarchod\\w*', 'maderchod\\w*', 'behenchod\\w*', 'bhenchod\\w*', 'benchod\\w*',
  'bhosd\\w*', 'bhosr\\w*', 'gand', 'gaand\\w*', 'gandu\\w*', 'lund\\w*', 'lauda\\w*', 'lavda\\w*', 'lawda\\w*',
  'randi\\w*', 'harami\\w*', 'haramkhor\\w*', 'kutt[ei]', 'kamina\\w*', 'kamine', 'bsdk', 'mc', 'bc', 'mkc', 'tmkc',
];
const BAD_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${BAD_WORDS.join('|')})(?![\\p{L}\\p{N}])`, 'giu');

export const hasBadWords = (text: string) => {
  BAD_RE.lastIndex = 0;
  return BAD_RE.test(text);
};

/** Replaces swear words with asterisks. */
export function maskBadWords(text: string): string {
  BAD_RE.lastIndex = 0;
  return text.replace(BAD_RE, (w) => '*'.repeat(w.length));
}

/*
 * Contact details: links, emails, phone numbers and @handles are hidden in chat, so
 * nobody can lure another player (often a child) somewhere private, or post scam links.
 */
const HIDDEN = '[hidden]';
const CONTACT_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // email
  /\b(?:https?:\/\/|www\.)\S+/gi, // link
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\s?(?:\.|\bdot\b)\s?(?:com|in|net|org|io|me|gg|co|app|xyz|info|ly|link|tv|to|be|us|uk|online|site|club|live|fun|shop|store)\b(?:\/\S*)?/gi, // bare domain
  /\+?\(?\d(?:[\s\-.()]{0,3}\d){6,}/g, // phone number (7+ digits)
  /(?<![\w@])@[a-z0-9_.]{3,}/gi, // social handle
];

/** Replaces contact details with "[hidden]". */
export function hideContactInfo(text: string): string {
  return CONTACT_PATTERNS.reduce((t, re) => t.replace(re, HIDDEN), text);
}

/** Everything a chat message goes through before anyone sees it. */
export function cleanChat(raw: unknown): string {
  return maskBadWords(hideContactInfo(cleanText(raw, MAX_CHAT_LENGTH)));
}

/** A display name that is safe to show everyone (empty if nothing usable is left). */
export function cleanName(raw: unknown): string {
  const name = cleanText(raw, MAX_NAME_LENGTH);
  return hasBadWords(name) || hideContactInfo(name) !== name ? '' : name;
}

/** Limits for each number setting: [lowest, highest]. */
const NUMBER_LIMITS: Partial<Record<keyof GameSettings, [number, number]>> = {
  maxPlayers: [2, 8],
  startingCash: [100, 100_000],
  turnTimeoutSeconds: [0, 600],
  roundLimit: [0, 500],
};

/** Applies only the setting changes that have the right type and a sensible value. */
export function cleanSettings(current: GameSettings, patch: unknown): GameSettings {
  const next = { ...current };
  if (!patch || typeof patch !== 'object') return next;
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
    const k = key as keyof GameSettings;
    const before = current[k];
    if (typeof before === 'boolean' && typeof value === 'boolean') (next as Record<string, unknown>)[k] = value;
    else if (typeof before === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      const [lo, hi] = NUMBER_LIMITS[k] ?? [0, 1_000_000];
      (next as Record<string, unknown>)[k] = Math.min(hi, Math.max(lo, Math.round(value)));
    } else if (k === 'mode' && (value === 'SOLO' || value === 'TEAMS')) next.mode = value;
    else if (k === 'boardMap' && typeof value === 'string') next.boardMap = cleanText(value, 40) || current.boardMap;
  }
  return next;
}
