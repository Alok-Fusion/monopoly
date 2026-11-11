import React, { useState } from 'react';
import { Copy, Check, Wifi, WifiOff, Monitor } from 'lucide-react';
import { inviteLink, REACH_NOTE } from '../../lib/invite';

interface RoomCardProps {
  roomCode: string;
  role: 'offline' | 'host' | 'guest';
  connected: boolean;
  connectedCount: number;
}

export const RoomCard: React.FC<RoomCardProps> = ({ roomCode, role, connected, connectedCount }) => {
  const [copied, setCopied] = useState(false);
  const invite = inviteLink(roomCode);
  const url = invite.url;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard can be blocked; the link is still visible */
    }
  };

  if (role === 'offline') {
    return (
      <div className="panel flex items-center gap-3 px-3 py-3">
        <Monitor size={18} className="shrink-0 text-slate-400" />
        <div className="text-[13px] leading-snug text-slate-300">
          <div className="font-semibold text-white">Local game</div>
          Playing on this device against bots.
        </div>
      </div>
    );
  }

  return (
    <div className="panel space-y-2.5 p-3">
      <div className="flex items-center justify-between">
        <span className="panel-title">Room {roomCode}</span>
        <span className={`chip ${connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
          {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {connected ? (role === 'host' ? `Hosting · ${connectedCount} online` : 'Connected') : 'Disconnected'}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1 truncate rounded-lg bg-ink-900 px-2.5 py-1.5 font-mono text-[11px] text-slate-400">{url}</div>
        <button type="button" onClick={copy} className="btn btn-sm btn-secondary shrink-0">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {role === 'host' && (
        <p className="text-[11px] leading-snug text-slate-500">
          The game runs on the Bazaar server, so it carries on if you refresh or step away. {invite.reach !== 'internet' && <span className="text-amber-200/80">{REACH_NOTE[invite.reach]}</span>}
        </p>
      )}
    </div>
  );
};
