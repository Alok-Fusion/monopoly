import React, { useMemo, useState } from 'react';
import { GameState, PlayerId, TradeOffer } from '../../types/game';
import { getTile } from '../../engine/board';
import { isTradeable, MAX_COUNTER_OFFERS, openTradeBetween, ownedTiles, proposalProblem, validateTrade } from '../../engine/rules';
import { formatINR } from '../../lib/format';
import { GROUP_COLORS } from '../../lib/tiles';
import { PlayerToken } from '../board/PlayerToken';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../common/Modal';

type Offer = Omit<TradeOffer, 'id' | 'status' | 'counterCount' | 'createdAt'>;

interface ComposeProps {
  state: GameState;
  localPlayerId: PlayerId;
  defaultPartnerId?: PlayerId | null;
  /** When set, the dialog edits a counter-offer to this deal instead of starting a new one. */
  counterTo?: TradeOffer | null;
  onClose: () => void;
  onPropose: (offer: Offer) => void;
}

const PropertyPicker: React.FC<{
  state: GameState;
  ownerId: PlayerId;
  selected: number[];
  onToggle: (idx: number) => void;
}> = ({ state, ownerId, selected, onToggle }) => {
  const tiles = ownedTiles(state, ownerId);
  if (tiles.length === 0) return <p className="py-2 text-xs text-slate-500">No properties.</p>;
  return (
    <div className="max-h-48 space-y-1 overflow-y-auto pr-0.5">
      {tiles.map((idx) => {
        const tile = getTile(idx);
        const ok = isTradeable(state, ownerId, idx);
        const on = selected.includes(idx);
        return (
          <button
            key={idx}
            type="button"
            disabled={!ok}
            onClick={() => onToggle(idx)}
            title={ok ? undefined : 'Sell the buildings in this set before trading it'}
            aria-pressed={on}
            className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
              on ? 'border-amber-400/70 bg-amber-400/10 text-white' : 'border-ink-700 bg-ink-900 text-slate-300 hover:border-ink-600'
            }`}
          >
            <span className="h-3 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: GROUP_COLORS[tile.group] }} />
            <span className="min-w-0 flex-1 truncate">{tile.name}</span>
            {state.tiles[idx]?.mortgaged && <span className="text-[10px] uppercase text-rose-300">mortgaged</span>}
            <span className="text-[11px] tabular-nums text-slate-500">{formatINR(tile.price ?? 0)}</span>
          </button>
        );
      })}
    </div>
  );
};

const CashInput: React.FC<{ value: number; max: number; onChange: (v: number) => void; label: string }> = ({ value, max, onChange, label }) => (
  <label className="block">
    <span className="mb-1 flex justify-between text-[11px] text-slate-400">
      <span>{label}</span>
      <span>max {formatINR(max)}</span>
    </span>
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">₹</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value || ''}
        placeholder="0"
        onChange={(e) => onChange(Math.min(max, Math.max(0, parseInt(e.target.value, 10) || 0)))}
        className="input pl-7 tabular-nums"
      />
    </div>
  </label>
);

const JailCardStepper: React.FC<{ value: number; max: number; onChange: (v: number) => void }> = ({ value, max, onChange }) =>
  max > 0 ? (
    <div className="flex items-center justify-between rounded-lg bg-ink-900 px-2 py-1.5 text-[13px] text-slate-300">
      <span>🎟 Jail cards</span>
      <span className="flex items-center gap-1">
        <button type="button" className="icon-btn h-6 w-6" disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label="Fewer">
          −
        </button>
        <span className="w-4 text-center tabular-nums">{value}</span>
        <button type="button" className="icon-btn h-6 w-6" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="More">
          +
        </button>
      </span>
    </div>
  ) : null;

export const TradeModal: React.FC<ComposeProps> = ({ state, localPlayerId, defaultPartnerId, counterTo, onClose, onPropose }) => {
  const me = state.players[localPlayerId];
  const others = state.playerOrder
    .map((id) => state.players[id])
    .filter((p): p is NonNullable<typeof p> => !!p && p.id !== localPlayerId && !p.bankrupt);
  const isCounter = !!counterTo;

  // A counter-offer starts from the deal on the table, seen from our side
  const free = others.filter((p) => !openTradeBetween(state, localPlayerId, p.id));
  const [partnerId, setPartnerId] = useState<PlayerId>(
    counterTo
      ? counterTo.proposerId
      : defaultPartnerId && others.some((p) => p.id === defaultPartnerId)
        ? defaultPartnerId
        : (free[0] ?? others[0])?.id ?? ''
  );
  const [offerCash, setOfferCash] = useState(counterTo?.requestCash ?? 0);
  const [requestCash, setRequestCash] = useState(counterTo?.offerCash ?? 0);
  const [offerProps, setOfferProps] = useState<number[]>(counterTo?.requestProperties ?? []);
  const [requestProps, setRequestProps] = useState<number[]>(counterTo?.offerProperties ?? []);
  const [offerJail, setOfferJail] = useState(counterTo?.requestJailCards ?? 0);
  const [requestJail, setRequestJail] = useState(counterTo?.offerJailCards ?? 0);
  const partner = state.players[partnerId];

  const choosePartner = (id: PlayerId) => {
    setPartnerId(id);
    setRequestProps([]);
    setRequestCash(0);
    setRequestJail(0);
  };
  const toggle = (list: number[], set: (v: number[]) => void, idx: number) =>
    set(list.includes(idx) ? list.filter((i) => i !== idx) : [...list, idx]);

  const offer: Offer = {
    proposerId: localPlayerId,
    targetId: partnerId,
    offerCash,
    offerProperties: offerProps,
    offerJailCards: offerJail,
    requestCash,
    requestProperties: requestProps,
    requestJailCards: requestJail,
  };
  const problem = useMemo(
    () => (!partnerId ? 'No one to trade with.' : isCounter ? validateTrade(state, offer) : proposalProblem(state, offer)),
    [state, JSON.stringify(offer)] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const unchanged =
    !!counterTo &&
    counterTo.requestCash === offerCash &&
    counterTo.offerCash === requestCash &&
    counterTo.requestJailCards === offerJail &&
    counterTo.offerJailCards === requestJail &&
    [...counterTo.requestProperties].sort().join() === [...offerProps].sort().join() &&
    [...counterTo.offerProperties].sort().join() === [...requestProps].sort().join();

  if (!me) return null;

  return (
    <Modal size="xl" onClose={onClose} labelledBy="trade-title">
      <ModalHeader
        id="trade-title"
        eyebrow={isCounter ? `Counter-offer to ${partner?.name ?? 'them'}` : 'New trade'}
        title={isCounter ? 'Change the terms' : 'Make an offer'}
        icon="🤝"
        onClose={onClose}
      />
      <ModalBody className="space-y-4">
        {others.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">There's no one left to trade with.</p>
        ) : (
          <>
            {isCounter && (
              <p className="rounded-xl bg-sky-500/10 px-3 py-2 text-[13px] leading-snug text-sky-100 ring-1 ring-sky-400/20">
                Adjust anything — cash, properties or jail cards — and send it back. {partner?.name} can accept, decline or counter again, whenever they like.
              </p>
            )}
            <div className={isCounter ? 'hidden' : ''}>
              <div className="panel-title mb-1.5">Trade with</div>
              <div className="flex flex-wrap gap-1.5">
                {others.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choosePartner(p.id)}
                    aria-pressed={p.id === partnerId}
                    className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition ${
                      p.id === partnerId ? 'border-amber-400/70 bg-amber-400/10 text-white' : 'border-ink-600 text-slate-300 hover:border-ink-500'
                    }`}
                  >
                    <PlayerToken tokenId={p.tokenId} color={p.color} name={p.name} size="xs" />
                    {p.name}
                    <span className="text-[11px] text-slate-500">{formatINR(p.cash)}</span>
                    {openTradeBetween(state, localPlayerId, p.id) && <span className="chip bg-sky-500/15 text-sky-200">deal open</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <section className="space-y-2.5 rounded-xl border border-ink-700 p-3">
                <h3 className="text-sm font-semibold text-rose-200">You give</h3>
                <CashInput label="Cash" value={offerCash} max={me.cash} onChange={setOfferCash} />
                <JailCardStepper value={offerJail} max={me.jailCardsCount} onChange={setOfferJail} />
                <PropertyPicker state={state} ownerId={localPlayerId} selected={offerProps} onToggle={(i) => toggle(offerProps, setOfferProps, i)} />
              </section>
              <section className="space-y-2.5 rounded-xl border border-ink-700 p-3">
                <h3 className="text-sm font-semibold text-emerald-200">You get from {partner?.name}</h3>
                <CashInput label="Cash" value={requestCash} max={partner?.cash ?? 0} onChange={setRequestCash} />
                <JailCardStepper value={requestJail} max={partner?.jailCardsCount ?? 0} onChange={setRequestJail} />
                {partner && (
                  <PropertyPicker state={state} ownerId={partner.id} selected={requestProps} onToggle={(i) => toggle(requestProps, setRequestProps, i)} />
                )}
              </section>
            </div>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {problem && others.length > 0 && (
          <span className="mr-auto text-xs text-slate-400">{problem === 'The trade is empty.' ? 'Pick something to trade.' : problem}</span>
        )}
        {!problem && unchanged && <span className="mr-auto text-xs text-slate-400">Change something to make a counter-offer.</span>}
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {isCounter ? 'Back' : 'Cancel'}
        </button>
        <button type="button" className="btn btn-primary" disabled={!!problem || unchanged} onClick={() => onPropose(offer)}>
          {isCounter ? 'Send counter-offer' : 'Send offer'}
        </button>
      </ModalFooter>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */

const OfferSide: React.FC<{ state: GameState; title: string; cash: number; props: number[]; jail: number; tone: string }> = ({
  state,
  title,
  cash,
  props,
  jail,
  tone,
}) => (
  <section className="rounded-xl border border-ink-700 p-3">
    <h3 className={`mb-2 text-sm font-semibold ${tone}`}>{title}</h3>
    <ul className="space-y-1 text-[13px] text-slate-200">
      {cash > 0 && <li className="font-semibold tabular-nums">💵 {formatINR(cash)}</li>}
      {jail > 0 && <li>🎟 {jail} Get Out of Jail Free card{jail > 1 ? 's' : ''}</li>}
      {props.map((idx) => {
        const tile = getTile(idx);
        return (
          <li key={idx} className="flex items-center gap-2">
            <span className="h-3 w-1.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[tile.group] }} />
            {tile.name}
            {state.tiles[idx]?.mortgaged && <span className="text-[10px] uppercase text-rose-300">mortgaged</span>}
            <span className="ml-auto text-[11px] text-slate-500">{formatINR(tile.price ?? 0)}</span>
          </li>
        );
      })}
      {cash === 0 && jail === 0 && props.length === 0 && <li className="text-slate-500">Nothing</li>}
    </ul>
  </section>
);

export const TradeOfferModal: React.FC<{
  state: GameState;
  trade: TradeOffer;
  viewerId: PlayerId;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCounter: () => void;
  onWithdraw: () => void;
}> = ({ state, trade, viewerId, onClose, onAccept, onReject, onCounter, onWithdraw }) => {
  const from = state.players[trade.proposerId];
  const to = state.players[trade.targetId];
  const problem = validateTrade(state, trade);
  const round = trade.counterCount ?? 0;
  const forMe = trade.targetId === viewerId;
  const mine = trade.proposerId === viewerId;
  const canCounter = forMe && round < MAX_COUNTER_OFFERS && !problem;
  const first = (name?: string) => (name ?? 'them').split(' ')[0];

  const title = forMe
    ? round > 0
      ? `${from?.name ?? 'Someone'} came back with new terms`
      : `${from?.name ?? 'Someone'} wants to trade`
    : mine
      ? `Your offer to ${to?.name ?? 'them'}`
      : `${from?.name} ↔ ${to?.name}`;

  return (
    <Modal size="lg" onClose={onClose} labelledBy="offer-title">
      <ModalHeader
        id="offer-title"
        eyebrow={round > 0 ? `Counter-offer · round ${round + 1} of negotiation` : forMe || mine ? 'Trade offer' : 'Open deal on the trade board'}
        title={title}
        icon="🤝"
        onClose={onClose}
      />
      <ModalBody>
        <div className="grid gap-3 sm:grid-cols-2">
          <OfferSide
            state={state}
            title={forMe ? 'You get' : mine ? 'You give' : `${first(from?.name)} gives`}
            tone={forMe ? 'text-emerald-200' : 'text-rose-200'}
            cash={trade.offerCash}
            props={trade.offerProperties}
            jail={trade.offerJailCards}
          />
          <OfferSide
            state={state}
            title={forMe ? 'You give' : mine ? 'You get' : `${first(to?.name)} gives`}
            tone={forMe ? 'text-rose-200' : 'text-emerald-200'}
            cash={trade.requestCash}
            props={trade.requestProperties}
            jail={trade.requestJailCards}
          />
        </div>
        {problem && <p className="mt-3 text-xs text-rose-300">Can't go through right now: {problem}</p>}
        <p className="mt-3 text-xs text-slate-500">
          {forMe
            ? 'No rush — the offer stays on the trade board until you decide. Close this and keep playing if you like.'
            : mine
              ? `${to?.name ?? 'They'} can answer whenever they like. You can withdraw it any time.`
              : 'Everyone can see open deals. Only the two players involved can act on this one.'}
        </p>
      </ModalBody>
      <ModalFooter>
        {forMe ? (
          <>
            {round >= MAX_COUNTER_OFFERS && <span className="mr-auto text-xs text-slate-400">Final offer — accept or decline.</span>}
            <button type="button" className="btn btn-ghost" onClick={onReject}>
              Decline
            </button>
            <button type="button" className="btn btn-secondary" disabled={!canCounter} onClick={onCounter}>
              ↩ Counter-offer
            </button>
            <button type="button" className="btn btn-success" disabled={!!problem} onClick={onAccept}>
              Accept trade
            </button>
          </>
        ) : mine ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={onWithdraw}>
              Withdraw offer
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
};
