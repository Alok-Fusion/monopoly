import React from 'react';
import { Headphones, Mic, MicOff, PhoneOff, VolumeX } from 'lucide-react';
import { GameState, PlayerId } from '../../types/game';
import { voice, useVoice } from '../../net/voice';
import { PlayerToken } from '../board/PlayerToken';

interface Props {
  state: GameState;
  localPlayerId: PlayerId;
  /** panel: its own card · inline: inside another card · compact: two icons for the phone header */
  variant?: 'panel' | 'inline' | 'compact';
}

export const VoiceControl: React.FC<Props> = ({ state, localPlayerId, variant = 'panel' }) => {
  const v = useVoice();
  if (!state.players[localPlayerId]) return null;

  const inCall = v.status === 'on';
  const joining = v.status === 'joining';
  const members = v.members.filter((m) => state.players[m.playerId]);
  const others = members.filter((m) => m.playerId !== localPlayerId).length;
  const join = () => void voice.join(localPlayerId);
  const micLabel = v.muted ? 'Unmute your microphone' : 'Mute your microphone';

  if (variant === 'compact') {
    if (!inCall) {
      return (
        <button
          type="button"
          className="icon-btn relative"
          onClick={join}
          disabled={joining}
          title="Join voice chat"
          aria-label={joining ? 'Joining voice chat' : `Join voice chat, ${members.length} in the call`}
        >
          <Headphones size={18} className={joining ? 'animate-pulse text-amber-300' : ''} />
          {members.length > 0 && (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white" aria-hidden="true">
              {members.length}
            </span>
          )}
        </button>
      );
    }
    return (
      <div className="flex items-center">
        <button
          type="button"
          className={`icon-btn ${v.muted ? 'bg-rose-500/20 text-rose-300' : 'text-emerald-300'}`}
          onClick={() => voice.toggleMute()}
          aria-pressed={v.muted}
          aria-label={micLabel}
          title={micLabel}
        >
          {v.muted ? <MicOff size={18} /> : <Mic size={18} className={v.speaking.has(localPlayerId) ? 'animate-pulse' : ''} />}
        </button>
        <button type="button" className="icon-btn text-rose-300" onClick={() => voice.leave()} aria-label="Leave voice chat" title="Leave voice chat">
          <PhoneOff size={17} />
        </button>
      </div>
    );
  }

  const status = inCall ? (others ? `${others + 1} in call` : 'Only you so far') : joining ? 'Allow your mic…' : members.length ? `${members.length} in call` : 'Nobody yet';

  return (
    <section className={variant === 'panel' ? 'panel space-y-2.5 p-3' : 'space-y-2.5 rounded-xl bg-black/25 p-3 ring-1 ring-white/5'} aria-label="Voice chat">
      <div className="flex items-center justify-between gap-2">
        <span className="panel-title flex items-center gap-1.5">
          <Headphones size={13} /> Voice chat
        </span>
        <span className={`chip ${inCall ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-slate-300'}`}>{status}</span>
      </div>

      {members.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {members.map((m) => {
            const p = state.players[m.playerId];
            if (!p) return null;
            const isMe = m.playerId === localPlayerId;
            const silenced = v.silenced.has(m.playerId);
            const waiting = inCall && !isMe && !v.linked.has(m.peerId);
            const body = (
              <>
                <span className={`inline-flex rounded-full transition ${v.speaking.has(m.playerId) ? 'ring-2 ring-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]' : ''}`}>
                  <PlayerToken tokenId={p.tokenId} color={p.color} name={p.name} size="xs" />
                </span>
                <span className="max-w-[76px] truncate">{isMe ? 'You' : p.name}</span>
                {m.muted && <MicOff size={11} className="shrink-0 text-rose-300" aria-label="muted" />}
                {silenced && <VolumeX size={11} className="shrink-0 text-amber-300" aria-label="muted for you" />}
              </>
            );
            const chip = `flex items-center gap-1 rounded-full bg-white/[0.06] py-0.5 pl-0.5 pr-2 text-[11px] font-medium text-slate-200 ${waiting ? 'opacity-50' : ''}`;
            return (
              <li key={m.playerId}>
                {inCall && !isMe ? (
                  <button
                    type="button"
                    className={`${chip} transition hover:bg-white/[0.12]`}
                    onClick={() => voice.toggleSilenced(m.playerId)}
                    aria-pressed={silenced}
                    title={waiting ? `Connecting to ${p.name}…` : silenced ? `Hear ${p.name} again` : `Mute ${p.name} just for you`}
                  >
                    {body}
                  </button>
                ) : (
                  <span className={chip}>{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {inCall ? (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              className={`btn btn-sm flex-1 ${v.muted ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30' : 'btn-secondary'}`}
              onClick={() => voice.toggleMute()}
              aria-pressed={v.muted}
            >
              {v.muted ? <MicOff size={14} /> : <Mic size={14} />} {v.muted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" className="btn btn-sm bg-rose-600 text-white hover:bg-rose-500" onClick={() => voice.leave()}>
              <PhoneOff size={14} /> Leave
            </button>
          </div>
          <p className="text-[11px] leading-snug text-slate-500">
            {others > 0 && 'Tap someone to mute them just for you. '}
            <span className="hidden lg:inline">
              Press <kbd className="rounded bg-white/10 px-1 font-sans text-slate-300">M</kbd> to mute.
            </span>
          </p>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-sm btn-secondary w-full" onClick={join} disabled={joining}>
            <Mic size={14} /> {joining ? 'Waiting for microphone…' : 'Join voice'}
          </button>
          <p className="text-[11px] leading-snug text-slate-500">Your mic stays off until you join. Only people in this room can hear you.</p>
        </>
      )}
    </section>
  );
};
