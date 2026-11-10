import React from 'react';
import { PlayerState } from '../../types/game';
import { formatINR } from '../../lib/format';
import { JAIL_FINE } from '../../engine/board';
import { Modal, ModalHeader } from '../common/Modal';

interface Props {
  player: PlayerState;
  onPayFine: () => void;
  onUseCard: () => void;
  onRollDoubles: () => void;
}

export const JailModal: React.FC<Props> = ({ player, onPayFine, onUseCard, onRollDoubles }) => {
  const canPay = player.cash >= JAIL_FINE;

  return (
    <Modal size="sm" labelledBy="jail-title">
      <ModalHeader id="jail-title" eyebrow="One round behind bars" title="You're in Tihar Jail" icon="⛓️" accent="#FB923C" />
      <div className="space-y-2 p-5">
        <p className="pb-1 text-sm leading-relaxed text-slate-300">
          Pay the {formatINR(JAIL_FINE)} fine or roll doubles to get out now. Miss the doubles and you'll wait — you walk out free on your next turn.
        </p>
        <button type="button" className="btn btn-primary w-full justify-between" onClick={onRollDoubles} autoFocus>
          <span>🎲 Roll for doubles</span>
          <span className="text-xs font-medium opacity-70">free</span>
        </button>
        <button type="button" className="btn btn-secondary w-full justify-between" disabled={!canPay} onClick={onPayFine}>
          <span>Pay fine</span>
          <span className="tabular-nums text-amber-300">{formatINR(JAIL_FINE)}</span>
        </button>
        {player.jailCardsCount > 0 && (
          <button type="button" className="btn btn-secondary w-full justify-between" onClick={onUseCard}>
            <span>🎟 Use Get Out of Jail Free</span>
            <span className="text-xs text-slate-400">{player.jailCardsCount} left</span>
          </button>
        )}
      </div>
    </Modal>
  );
};
