import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, QrCode, Dice5, LogOut, X, Wifi, Play, Users, Swords, Bot, Sparkles } from 'lucide-react';
import { GameState, TokenId, TeamId, BotDifficulty, PlayerId, PlayerProfile, PlayerState } from '../../types/game';
import { TOKEN_EMOJIS, PlayerToken } from '../board/PlayerToken';
import { formatTeamName, getTeamColor } from '../../lib/format';
import { MAX_PLAYERS_CAP } from '../../engine/state';
import { Brand } from '../common/Brand';
import { RulesPanel } from '../modals/GameSettingsModal';
import { inviteLink, REACH_NOTE } from '../../lib/invite';
import { normalizeRoomCode } from '../../net/socket';
import { VoiceControl } from '../sidebar/VoiceControl';
import { nameTaken } from '../../engine/rules';

export type NetRole = 'offline' | 'host' | 'guest';

interface Props {
  state: GameState;
  localPlayerId: PlayerId;
  profile: PlayerProfile;
  role: NetRole;
  roomCode: string;
  connected: boolean;
  connecting: boolean;
  /** Room code we're joining (or failed to join, for "Try again"). */
  joiningCode: string | null;
  /** Who has the room's controls (online only). */
  hostId: PlayerId | null;
  /** The game server is waking up from sleep (free hosting). */
  serverWaking: boolean;
  netError: string | null;
  onUpdateProfile: (profile: PlayerProfile) => void;
  onAddBot: (difficulty: BotDifficulty) => void;
  onRemovePlayer: (playerId: PlayerId) => void;
  onSetPlayerTeam: (playerId: PlayerId, teamId?: TeamId) => void;
  onUpdateSettings: (settings: Partial<GameState['settings']>) => void;
  onOpenSettings: () => void;
  onStartGame: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  savedGame: { round: number; savedAt: number; players: PlayerState[] } | null;
  onResumeSaved: () => void;
  onDiscardSaved: () => void;
}

function timeAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const RANDOM_NAMES = ['Chai Baron', 'Rupee Rani', 'Metro Mogul', 'Masala Magnate', 'Startup Sultan', 'Bazaar Boss', 'Ghee Tycoon', 'Lassi Lord'];
const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const TEAMS: TeamId[] = ['team-1', 'team-2', 'team-3', 'team-4'];

/** What START_GAME will fix up automatically — shown as a friendly note, never a blocker. */
function startNote(state: GameState): string | null {
  if (state.playerOrder.length < 2) return "You're on your own — a bot will join so you have someone to beat.";
  if (state.settings.mode === 'TEAMS') {
    const ids = state.playerOrder.map((id) => state.players[id]?.teamId);
    if (ids.some((t) => !t) || new Set(ids).size < 2) return 'Teams will be balanced automatically when you start.';
  }
  return null;
}

const Card: React.FC<{ title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  action,
  children,
  className = '',
}) => (
  <section className={`panel p-4 sm:p-5 ${className}`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="panel-title flex items-center gap-1.5 whitespace-nowrap">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

export const Lobby: React.FC<Props> = ({
  state,
  localPlayerId,
  profile,
  role,
  roomCode,
  connected,
  connecting,
  joiningCode,
  hostId,
  serverWaking,
  netError,
  onUpdateProfile,
  onAddBot,
  onRemovePlayer,
  onSetPlayerTeam,
  onUpdateSettings,
  onStartGame,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  savedGame,
  onResumeSaved,
  onDiscardSaved,
}) => {
  const [nameDraft, setNameDraft] = useState(profile.name);
  const [roomInput, setRoomInput] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setNameDraft(profile.name), [profile.name]);

  const isHost = role !== 'guest';
  const teamMode = state.settings.mode === 'TEAMS';
  const cap = Math.min(state.settings.maxPlayers, MAX_PLAYERS_CAP);
  const full = state.playerOrder.length >= cap;
  const note = startNote(state);
  const invite = inviteLink(roomCode);
  const inviteUrl = invite.url;
  const takenColors = new Set(
    state.playerOrder.filter((id) => id !== localPlayerId).map((id) => state.players[id]?.color.toLowerCase())
  );
  const nameClash = !!nameDraft.trim() && nameTaken(state, nameDraft, localPlayerId);

  const commitName = (value: string) => {
    setNameDraft(value);
    const trimmed = value.trim();
    // Two players can never share a name, so a taken one isn't sent
    if (trimmed && !nameTaken(state, trimmed, localPlayerId)) onUpdateProfile({ ...profile, name: trimmed });
  };
  const randomName = () => {
    const free = RANDOM_NAMES.filter((n) => !nameTaken(state, n, localPlayerId));
    const pool = free.length ? free : RANDOM_NAMES;
    commitName(pool[Math.floor(Math.random() * pool.length)]!);
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const startButton = (
    <button type="button" className="btn btn-primary btn-lg w-full" onClick={onStartGame}>
      <Play size={18} className="fill-current" /> Start game
    </button>
  );

  return (
    <div className="relative min-h-[100dvh] px-4 pb-28 pt-6 sm:pt-10 lg:pb-12">
      {/* Floating tokens behind the hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 overflow-hidden" aria-hidden="true">
        {['🛺', '🏏', '☕', '🪁', '🐘', '🦚'].map((e, i) => (
          <span
            key={e}
            className="animate-drift absolute text-3xl opacity-[0.14] sm:text-4xl"
            style={{ left: `${8 + i * 16}%`, top: `${20 + ((i * 37) % 50)}%`, animationDelay: `${i * -2.3}s` }}
          >
            {e}
          </span>
        ))}
      </div>

      <div className="relative mx-auto w-full max-w-6xl space-y-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <Brand size="lg" />
          <p className="max-w-md text-balance text-sm text-slate-300 sm:text-base">
            Buy up India's cities, throw festivals, cut deals — and bankrupt your friends. <span className="text-slate-500">No sign-up.</span>
          </p>
        </header>

        {savedGame && (
          <section className="panel flex flex-col gap-3 border-amber-300/40 bg-gradient-to-r from-amber-400/[0.12] to-transparent p-4 sm:flex-row sm:items-center">
            <div className="flex -space-x-2">
              {savedGame.players.slice(0, 5).map((p) => (
                <PlayerToken key={p.id} tokenId={p.tokenId} color={p.color} name={p.name} size="sm" dimmed={p.bankrupt} />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white">You have an unfinished game</div>
              <div className="text-xs text-slate-400">
                Round {savedGame.round} · {savedGame.players.filter((p) => !p.bankrupt).length} players left · saved {timeAgo(savedGame.savedAt)}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onDiscardSaved}>
                Discard
              </button>
              <button type="button" className="btn btn-primary" onClick={onResumeSaved}>
                Resume game
              </button>
            </div>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-12">
          {/* ---------------- Left: you + online ---------------- */}
          <div className="space-y-4 lg:col-span-4">
            <Card title="Your player">
              <div className="mb-4 flex items-center gap-3">
                <PlayerToken tokenId={profile.tokenId} color={profile.color} name={profile.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <label htmlFor="nickname" className="sr-only">
                    Nickname
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="nickname"
                      type="text"
                      maxLength={18}
                      value={nameDraft}
                      onChange={(e) => commitName(e.target.value)}
                      onBlur={() => (!nameDraft.trim() || nameClash) && setNameDraft(profile.name)}
                      className={`input font-semibold ${nameClash ? 'border-rose-400/70 ring-1 ring-rose-400/50' : ''}`}
                      placeholder="Your name"
                      aria-invalid={nameClash}
                      aria-describedby={nameClash ? 'nickname-taken' : undefined}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary shrink-0 px-3"
                      onClick={randomName}
                      title="Random name"
                      aria-label="Random name"
                    >
                      <Dice5 size={16} />
                    </button>
                  </div>
                  {nameClash && (
                    <p id="nickname-taken" className="mt-1.5 text-xs font-medium text-rose-300">
                      Someone here is already called {nameDraft.trim()}. Pick another name.
                    </p>
                  )}
                </div>
              </div>

              <div className="mb-1.5 text-xs text-slate-400">Token</div>
              <div className="mb-4 grid grid-cols-8 gap-1.5 lg:grid-cols-4">
                {(Object.keys(TOKEN_EMOJIS) as TokenId[]).map((tid) => {
                  const on = profile.tokenId === tid;
                  return (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => onUpdateProfile({ ...profile, tokenId: tid })}
                      title={TOKEN_EMOJIS[tid].label}
                      aria-pressed={on}
                      className={`flex aspect-square items-center justify-center rounded-xl text-xl transition lg:aspect-auto lg:h-11 ${
                        on ? 'bg-amber-400/15 ring-2 ring-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.25)]' : 'bg-white/[0.04] hover:bg-white/[0.09]'
                      }`}
                    >
                      {TOKEN_EMOJIS[tid].emoji}
                    </button>
                  );
                })}
              </div>

              <div className="mb-1.5 text-xs text-slate-400">Colour</div>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => {
                  const taken = takenColors.has(c.toLowerCase());
                  const on = profile.color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={taken}
                      onClick={() => onUpdateProfile({ ...profile, color: c })}
                      aria-label={`Colour ${c}${taken ? ' (taken)' : ''}`}
                      aria-pressed={on}
                      className={`h-8 w-8 rounded-full transition disabled:cursor-not-allowed disabled:opacity-20 ${
                        on ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-850' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c, boxShadow: on ? `0 0 16px ${c}` : undefined }}
                    />
                  );
                })}
              </div>
            </Card>

            <Card title={<><Wifi size={13} /> Play with friends</>}>
              {role === 'offline' ? (
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-slate-400">
                    Create a room and share the link. Friends can join from anywhere, and the game keeps going even if someone's connection drops.
                  </p>
                  <button type="button" className="btn btn-secondary w-full" onClick={onCreateRoom} disabled={connecting}>
                    {connecting && !joiningCode ? 'Creating room…' : 'Create online room'}
                  </button>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (roomInput) onJoinRoom(roomInput);
                    }}
                  >
                    <input
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Room code or invite link"
                      value={roomInput}
                      onChange={(e) => setRoomInput(normalizeRoomCode(e.target.value))}
                      className="input font-mono uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal"
                      aria-label="Room code or invite link"
                    />
                    <button type="submit" className="btn btn-secondary shrink-0" disabled={!roomInput || connecting}>
                      Join
                    </button>
                  </form>
                  {connecting && serverWaking && (
                    <p className="flex items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-300/30" role="status">
                      <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-200/30 border-t-amber-300" aria-hidden="true" />
                      Starting the game server. After a quiet spell this can take up to a minute.
                    </p>
                  )}
                  {connecting && joiningCode && (
                    <p className="flex items-center gap-2 rounded-lg bg-black/25 px-3 py-2 text-xs text-slate-300 ring-1 ring-white/5" role="status">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-amber-300" aria-hidden="true" />
                      Joining room <span className="font-mono font-bold tracking-widest text-amber-300">{joiningCode}</span>…
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-black/25 px-3 py-2.5 ring-1 ring-white/5">
                    <div>
                      <div className="text-[11px] text-slate-500">Room code</div>
                      <div className="font-mono text-2xl font-bold tracking-[0.2em] text-amber-300">{roomCode}</div>
                    </div>
                    <span className={`chip ${connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                      {connected ? (role === 'host' ? 'Hosting' : 'Connected') : 'Connecting…'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-secondary flex-1" onClick={copyInvite}>
                      {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Link copied' : 'Copy invite'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowQR(!showQR)} aria-label="Show QR code">
                      <QrCode size={16} />
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={onLeaveRoom} title="Leave room" aria-label="Leave room">
                      <LogOut size={16} />
                    </button>
                  </div>
                  <div className="rounded-lg bg-black/25 px-2.5 py-1.5 font-mono text-[11px] text-slate-400 ring-1 ring-white/5 break-all">{inviteUrl}</div>
                  {role === 'host' && (
                    <p className={`text-[11px] leading-snug ${invite.reach === 'internet' ? 'text-slate-500' : 'text-amber-200/80'}`}>
                      {REACH_NOTE[invite.reach]}
                    </p>
                  )}
                  {showQR && (
                    <div className="flex justify-center">
                      <div className="rounded-xl bg-white p-3">
                        <QRCodeSVG value={inviteUrl} size={148} />
                      </div>
                    </div>
                  )}
                  <VoiceControl state={state} localPlayerId={localPlayerId} variant="inline" />
                </div>
              )}
              {netError && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">
                  <span className="min-w-0 flex-1">{netError}</span>
                  {role === 'offline' && joiningCode && !connecting && (
                    <button type="button" className="btn btn-sm bg-white/10 text-white hover:bg-white/20" onClick={() => onJoinRoom(joiningCode)}>
                      Try again
                    </button>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* ---------------- Right: players + rules ---------------- */}
          <div className="space-y-4 lg:col-span-8">
            <Card
              title={
                <>
                  <Users size={13} /> Players · {state.playerOrder.length}/{cap}
                </>
              }
              action={
                isHost && (
                  <div className="flex items-center gap-1">
                    <Bot size={14} className="mr-0.5 text-slate-500" />
                    {(
                      [
                        ['easy', 'Easy'],
                        ['normal', 'Normal'],
                        ['hard', 'Tough'],
                      ] as const
                    ).map(([d, label]) => (
                      <button key={d} type="button" className="btn btn-sm btn-secondary whitespace-nowrap px-2.5" disabled={full} onClick={() => onAddBot(d)}>
                        + {label}
                      </button>
                    ))}
                  </div>
                )
              }
            >
              <ul className="grid gap-2 sm:grid-cols-2">
                {state.playerOrder.map((pid, i) => {
                  const p = state.players[pid];
                  if (!p) return null;
                  const isMe = pid === localPlayerId;
                  const canEditTeam = isHost || isMe;
                  return (
                    <li
                      key={pid}
                      className="relative flex items-center gap-3 overflow-hidden rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/[0.06]"
                    >
                      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: p.color }} aria-hidden="true" />
                      <PlayerToken tokenId={p.tokenId} color={p.color} name={p.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-white">{p.name}</span>
                          {isMe && <span className="chip bg-amber-400/15 text-amber-300">You</span>}
                          {pid === hostId && role !== 'offline' && <span className="chip bg-white/10 text-slate-300">Host</span>}
                          {p.isBot && (
                            <span className="chip bg-white/10 text-slate-300">Bot · {p.botDifficulty === 'hard' ? 'tough' : p.botDifficulty}</span>
                          )}
                          {!p.connected && <span className="chip bg-white/10 text-slate-500">Offline</span>}
                        </div>
                        {teamMode && (
                          <div className="mt-1.5 flex gap-1">
                            {TEAMS.map((t) => {
                              const on = p.teamId === t;
                              const size = state.playerOrder.filter((id) => state.players[id]?.teamId === t).length;
                              const blocked = !on && size >= 2;
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  disabled={!canEditTeam || blocked}
                                  onClick={() => onSetPlayerTeam(pid, t)}
                                  title={blocked ? `${formatTeamName(t)} is full` : formatTeamName(t)}
                                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold text-white transition disabled:cursor-not-allowed ${
                                    on ? 'ring-2 ring-white/80' : blocked ? 'opacity-20' : 'opacity-45 hover:opacity-90'
                                  }`}
                                  style={{ backgroundColor: getTeamColor(t) }}
                                >
                                  {formatTeamName(t).replace('Team ', '')}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {isHost && !isMe && (
                        <button type="button" className="icon-btn" onClick={() => onRemovePlayer(pid)} aria-label={`Remove ${p.name}`} title="Remove">
                          <X size={16} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 hidden space-y-2 lg:block">
                {isHost ? (
                  <>
                    {startButton}
                    {note && (
                      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
                        <Sparkles size={12} className="text-amber-300" /> {note}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="rounded-xl bg-black/25 px-3 py-3 text-center text-sm text-slate-300">Waiting for the host to start the game…</p>
                )}
              </div>
            </Card>

            <Card
              title={isHost ? 'Room rules' : 'Room rules (set by the host)'}
              action={!isHost && <span className="text-[11px] text-slate-500">View only</span>}
            >
              <div className="mb-4 grid grid-cols-2 gap-2">
                {(
                  [
                    ['SOLO', 'Free for all', 'Every tycoon for themselves', <Swords key="s" size={18} />],
                    ['TEAMS', 'Teams of two', 'Shared sets, no rent between partners', <Users key="t" size={18} />],
                  ] as const
                ).map(([mode, title, desc, icon]) => {
                  const on = state.settings.mode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={!isHost}
                      onClick={() => onUpdateSettings({ mode })}
                      aria-pressed={on}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-default ${
                        on
                          ? 'border-amber-300/70 bg-gradient-to-br from-amber-400/20 to-amber-400/5'
                          : 'border-white/[0.07] bg-white/[0.03] hover:border-white/20'
                      }`}
                    >
                      <span className={`mt-0.5 ${on ? 'text-amber-300' : 'text-slate-400'}`}>{icon}</span>
                      <span>
                        <span className={`block text-sm font-semibold ${on ? 'text-amber-100' : 'text-white'}`}>{title}</span>
                        <span className="block text-xs leading-snug text-slate-400">{desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <RulesPanel settings={state.settings} readOnly={!isHost} onUpdateSettings={onUpdateSettings} wide showPresets={isHost} />
            </Card>
          </div>
        </div>
      </div>

      {/* Sticky start bar on phones and tablets */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/85 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto max-w-xl">
          {isHost ? (
            <>
              {startButton}
              {note && <p className="mt-1.5 text-center text-[11px] text-slate-400">{note}</p>}
            </>
          ) : (
            <p className="py-2 text-center text-sm text-slate-300">Waiting for the host to start…</p>
          )}
        </div>
      </div>
    </div>
  );
};
