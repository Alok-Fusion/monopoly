import React, { useEffect, useRef, useState } from 'react';
import { Send, MessageSquare, ShieldCheck, VolumeX } from 'lucide-react';
import { ChatMessage, PlayerState } from '../../types/game';
import { EMOTES } from '../board/CenterBoard';
import { setMuted, unmuteAll, useMutedPlayers } from '../../lib/chatMute';

interface Props {
  messages: ChatMessage[];
  me: PlayerState | undefined;
  isTeamMode: boolean;
  onSendMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  className?: string;
}

export const ChatPanel: React.FC<Props> = ({ messages, me, isTeamMode, onSendMessage, className = '' }) => {
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'all' | 'team'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const teamId = me?.teamId;
  const showTeamTab = isTeamMode && !!teamId;
  const activeTab = showTeamTab ? tab : 'all';
  const muted = useMutedPlayers();

  const visible = messages.filter((m) => {
    if (muted.has(m.senderId)) return false;
    if (activeTab === 'team') return m.isTeamOnly && m.teamId === teamId;
    return !m.isTeamOnly || (isTeamMode && m.teamId === teamId);
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length, activeTab]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !me) return;
    onSendMessage({
      senderId: me.id,
      senderName: me.name,
      senderColor: me.color,
      teamId,
      isTeamOnly: activeTab === 'team',
      text: text.trim(),
    });
    setText('');
  };

  return (
    <div className={`panel flex min-h-0 flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
        <span className="panel-title">Chat</span>
        {showTeamTab && (
          <div className="flex rounded-lg bg-ink-900 p-0.5 text-xs font-semibold">
            {(['all', 'team'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md px-2.5 py-1 transition ${activeTab === t ? 'bg-ink-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t === 'all' ? 'Everyone' : 'Team'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2 text-[13px]">
        {visible.length === 0 ? (
          <div className="flex h-full min-h-[80px] flex-col items-center justify-center gap-1.5 px-2 text-center text-xs text-slate-500">
            <MessageSquare size={18} />
            <span>No messages yet — say hi!</span>
            <span className="flex items-start gap-1 text-[11px] leading-snug text-slate-500">
              <ShieldCheck size={12} className="mt-px shrink-0 text-emerald-400/80" aria-hidden="true" />
              Be kind, and never share personal details like your address, school or phone number. Tap a name to mute that player.
            </span>
          </div>
        ) : (
          visible.map((m) => {
            const isEmote = EMOTES.includes(m.text);
            const canMute = m.senderId !== me?.id && m.senderId !== 'system';
            return (
              <div key={m.id} className="break-words leading-snug">
                {canMute ? (
                  <button
                    type="button"
                    className="mr-1.5 font-semibold underline-offset-2 hover:underline focus-visible:underline"
                    style={{ color: m.senderColor }}
                    onClick={() => setMuted(m.senderId, true)}
                    title={`Mute ${m.senderName} (hides their chat and voice, just for you)`}
                  >
                    {m.senderName}
                  </button>
                ) : (
                  <span className="mr-1.5 font-semibold" style={{ color: m.senderColor }}>
                    {m.senderName}
                  </span>
                )}
                {m.isTeamOnly && <span className="mr-1.5 text-[10px] font-bold uppercase text-emerald-400">team</span>}
                <span className={isEmote ? 'text-lg leading-none' : 'text-slate-200'}>{m.text}</span>
              </div>
            );
          })
        )}
      </div>

      {muted.size > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-ink-700 px-3 py-1.5 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <VolumeX size={12} aria-hidden="true" /> {muted.size === 1 ? '1 player muted' : `${muted.size} players muted`}
          </span>
          <button type="button" className="font-semibold text-amber-300 hover:underline" onClick={unmuteAll}>
            Unmute
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex items-center gap-1.5 border-t border-ink-700 p-2">
        <input
          type="text"
          value={text}
          maxLength={200}
          disabled={!me}
          onChange={(e) => setText(e.target.value)}
          placeholder={activeTab === 'team' ? 'Message your teammate…' : 'Say something…'}
          className="input py-1.5 text-[13px]"
          aria-label="Chat message"
        />
        <button type="submit" disabled={!text.trim() || !me} className="btn btn-primary h-9 w-9 shrink-0 p-0" aria-label="Send">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
};
