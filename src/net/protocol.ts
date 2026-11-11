import type { GameAction, GameState, PlayerProfile } from '../types/game';

/**
 * Messages between the browser and the Bazaar game server. Shared by both sides so they
 * can't drift apart. Bump the version whenever the shape of a message changes: browsers
 * still running an older copy of the game are then asked to refresh.
 */
export const PROTOCOL_VERSION = 1;

/** Room codes: letters and digits only (the game makes 5-character ones). */
export const ROOM_CODE_RE = /^[A-Z0-9]{4,8}$/;

/** Someone in the voice call. */
export interface VoiceMember {
  playerId: string;
  /** Their address for direct audio calls. */
  peerId: string;
  muted: boolean;
}

export type ClientMessage =
  /** Sit down in the room. `create` makes the room if it doesn't exist yet. */
  | { type: 'JOIN'; version: number; player: PlayerProfile; seatHint?: string; create?: boolean }
  | { type: 'ACTION'; action: GameAction }
  | { type: 'VOICE'; inVoice: boolean; muted: boolean; peerId?: string }
  | { type: 'PING' };

export type ServerMessage =
  /** Which seat you're in (it can differ from the id you asked for when you come back from a new tab or device). */
  | { type: 'WELCOME'; playerId: string }
  /** The whole game, plus who may change the rules and the server's clock (for countdowns). */
  | { type: 'STATE'; state: GameState; hostId: string; serverNow: number }
  | { type: 'VOICE_ROSTER'; members: VoiceMember[] }
  /** You can't (or can no longer) be in this room. The connection closes after this. */
  | { type: 'REJECTED'; reason: string }
  | { type: 'PONG' };
