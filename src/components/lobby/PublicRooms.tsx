import React, { useEffect, useState } from 'react';
import { Globe2, Users } from 'lucide-react';
import type { PublicRoom } from '../../net/protocol';
import { fetchPublicRooms } from '../../net/publicRooms';

const REFRESH_MS = 6000;

function waited(seconds: number) {
  if (seconds < 60) return 'just opened';
  const m = Math.round(seconds / 60);
  return `waiting ${m} min`;
}

/** Open public rooms anyone can join, refreshed every few seconds while the lobby is open. */
export const PublicRooms: React.FC<{ onJoin: (code: string) => void; disabled: boolean }> = ({ onJoin, disabled }) => {
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      fetchPublicRooms(20_000)
        .then((list) => alive && setRooms(list))
        .catch(() => alive && setRooms((r) => r ?? []));
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <Globe2 size={12} aria-hidden="true" /> Public rooms
      </div>
      {rooms === null ? (
        <p className="text-xs text-slate-500">Looking for open rooms…</p>
      ) : rooms.length === 0 ? (
        <p className="text-xs leading-snug text-slate-500">No open rooms right now. Tap Find a game to open one, and the next player will join you.</p>
      ) : (
        <ul className="space-y-1.5">
          {rooms.slice(0, 5).map((r) => (
            <li key={r.code} className="flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-2 ring-1 ring-white/5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-white">{r.host}&rsquo;s room</div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Users size={11} aria-hidden="true" />
                  {r.players}/{r.maxPlayers}
                  <span aria-hidden="true">·</span>
                  {r.mode === 'TEAMS' ? 'Teams' : 'Free for all'}
                  <span aria-hidden="true">·</span>
                  {r.roundLimit ? `${r.roundLimit} rounds` : 'Endless'}
                  <span aria-hidden="true">·</span>
                  {waited(r.waitingFor)}
                </div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm shrink-0" disabled={disabled} onClick={() => onJoin(r.code)}>
                Join
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
