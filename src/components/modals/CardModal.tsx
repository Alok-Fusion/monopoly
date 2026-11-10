import React from 'react';
import { CardEffect } from '../../types/game';
import { formatINR } from '../../lib/format';
import { Modal } from '../common/Modal';

interface Props {
  card: CardEffect;
  deck: 'kismat' | 'khazana';
  /** When false the card is shown read-only (another player drew it). */
  canDismiss: boolean;
  drawnBy?: string;
  onDismiss: () => void;
}

export const CardModal: React.FC<Props> = ({ card, deck, canDismiss, drawnBy, onDismiss }) => {
  const kismat = deck === 'kismat';
  const amount = card.type === 'CASH' ? card.amount ?? 0 : 0;

  return (
    <Modal size="sm" labelledBy="card-title">
      <div className="p-5">
        <div
          className={`relative overflow-hidden rounded-2xl p-5 text-center text-ink-900 shadow-inner ${
            kismat ? 'bg-gradient-to-br from-pink-100 to-rose-200' : 'bg-gradient-to-br from-amber-100 to-yellow-200'
          }`}
        >
          <div className="text-4xl">{kismat ? '❓' : '💰'}</div>
          <div className={`mt-2 text-[11px] font-bold uppercase tracking-[0.2em] ${kismat ? 'text-pink-700' : 'text-amber-700'}`}>
            {kismat ? 'Kismat' : 'Khazana'}
          </div>
          <h2 id="card-title" className="mt-1 font-display text-xl font-bold leading-tight">
            {card.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-700">{card.description}</p>
          {amount !== 0 && (
            <div
              className={`mt-4 inline-block rounded-full px-3 py-1 text-sm font-bold tabular-nums ${
                amount > 0 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
              }`}
            >
              {amount > 0 ? '+' : '−'}
              {formatINR(Math.abs(amount))}
            </div>
          )}
        </div>
        {canDismiss ? (
          <button type="button" className="btn btn-primary mt-4 w-full" onClick={onDismiss} autoFocus>
            Continue
          </button>
        ) : (
          <p className="mt-4 text-center text-sm text-slate-400">{drawnBy} drew this card…</p>
        )}
      </div>
    </Modal>
  );
};
