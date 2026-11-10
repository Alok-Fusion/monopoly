import React from 'react';
import { Users, Coins, Coffee, Gavel, Lock, Landmark, Home, Banknote, Shuffle, Flag, Hourglass, Timer, PartyPopper } from 'lucide-react';
import { GameSettings } from '../../types/game';
import { formatINR } from '../../lib/format';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../common/Modal';

/* ------------------------------------------------------------------ */
/* Presets                                                            */
/* ------------------------------------------------------------------ */

export interface RulePreset {
  id: string;
  title: string;
  blurb: string;
  icon: string;
  settings: Partial<GameSettings>;
}

export const RULE_PRESETS: RulePreset[] = [
  {
    id: 'bazaar',
    title: 'Bazaar',
    blurb: '30 rounds, festivals, Chai Break pool',
    icon: '🪔',
    settings: {
      roundLimit: 30,
      festivalEvents: true,
      startingCash: 1500,
      vacationCash: true,
      chaiBreakRest: true,
      auctionOnDecline: true,
      doubleRentOnSet: true,
      noRentInJail: true,
      mortgageEnabled: true,
      evenBuild: true,
      doubleSalaryOnGo: false,
      turnTimeoutSeconds: 0,
    },
  },
  {
    id: 'quick',
    title: 'Quick',
    blurb: '20 rounds, extra cash, 30s turns',
    icon: '⚡',
    settings: {
      roundLimit: 20,
      festivalEvents: true,
      startingCash: 2000,
      vacationCash: true,
      chaiBreakRest: false,
      auctionOnDecline: true,
      doubleRentOnSet: true,
      noRentInJail: false,
      mortgageEnabled: true,
      evenBuild: false,
      doubleSalaryOnGo: true,
      turnTimeoutSeconds: 30,
    },
  },
  {
    id: 'classic',
    title: 'Classic',
    blurb: 'Last one standing, no surprises',
    icon: '🎩',
    settings: {
      roundLimit: 0,
      festivalEvents: false,
      startingCash: 1500,
      vacationCash: false,
      chaiBreakRest: false,
      auctionOnDecline: true,
      doubleRentOnSet: true,
      noRentInJail: false,
      mortgageEnabled: true,
      evenBuild: true,
      doubleSalaryOnGo: false,
      turnTimeoutSeconds: 0,
    },
  },
  {
    id: 'cutthroat',
    title: 'Cutthroat',
    blurb: 'Tight money, no mercy, endless',
    icon: '🗡️',
    settings: {
      roundLimit: 0,
      festivalEvents: true,
      startingCash: 1000,
      vacationCash: false,
      chaiBreakRest: true,
      auctionOnDecline: true,
      doubleRentOnSet: true,
      noRentInJail: false,
      mortgageEnabled: true,
      evenBuild: true,
      doubleSalaryOnGo: false,
      turnTimeoutSeconds: 45,
    },
  },
];

export function matchingPreset(settings: GameSettings): string | null {
  const hit = RULE_PRESETS.find((p) =>
    Object.entries(p.settings).every(([k, v]) => settings[k as keyof GameSettings] === v)
  );
  return hit?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Controls                                                           */
/* ------------------------------------------------------------------ */

const Toggle: React.FC<{ checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }> = ({
  checked,
  disabled,
  onChange,
  label,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 disabled:cursor-not-allowed disabled:opacity-60 ${
      checked ? 'bg-gradient-to-r from-amber-300 to-amber-500 shadow-[0_0_12px_rgba(251,191,36,0.35)]' : 'bg-ink-600'
    }`}
  >
    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
  </button>
);

const Row: React.FC<{ icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }> = ({ icon, title, desc, children }) => (
  <div className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.03]">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-slate-300">{icon}</div>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-slate-100">{title}</div>
      <div className="text-xs leading-snug text-slate-500">{desc}</div>
    </div>
    {children}
  </div>
);

const Select: React.FC<{
  value: number;
  disabled: boolean;
  label: string;
  options: [number, string][];
  onChange: (v: number) => void;
}> = ({ value, disabled, label, options, onChange }) => (
  <select
    value={value}
    disabled={disabled}
    onChange={(e) => onChange(parseInt(e.target.value, 10))}
    className="input w-auto shrink-0 py-1.5 pr-7 text-sm disabled:opacity-70"
    aria-label={label}
  >
    {options.map(([v, text]) => (
      <option key={v} value={v}>
        {text}
      </option>
    ))}
  </select>
);

/* ------------------------------------------------------------------ */
/* Rules panel (inline in the lobby, and inside the settings modal)   */
/* ------------------------------------------------------------------ */

interface PanelProps {
  settings: GameSettings;
  readOnly: boolean;
  onUpdateSettings: (settings: Partial<GameSettings>) => void;
  /** Two-column layout for wide containers */
  wide?: boolean;
  showPresets?: boolean;
}

export const RulesPanel: React.FC<PanelProps> = ({ settings, readOnly, onUpdateSettings, wide, showPresets = true }) => {
  const toggle = (key: keyof GameSettings, title: string, desc: string, icon: React.ReactNode) => (
    <Row key={key} icon={icon} title={title} desc={desc}>
      <Toggle
        label={title}
        checked={!!settings[key]}
        disabled={readOnly}
        onChange={(v) => onUpdateSettings({ [key]: v } as Partial<GameSettings>)}
      />
    </Row>
  );
  const active = matchingPreset(settings);
  const grid = wide ? 'grid gap-x-4 md:grid-cols-2' : 'grid';

  return (
    <div className="space-y-4">
      {showPresets && (
        <section>
          <h3 className="panel-title mb-2 px-1">Quick presets</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RULE_PRESETS.map((p) => {
              const on = active === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={readOnly}
                  aria-pressed={on}
                  onClick={() => onUpdateSettings(p.settings)}
                  className={`group rounded-xl border p-2.5 text-left transition disabled:cursor-default ${
                    on
                      ? 'border-amber-300/70 bg-gradient-to-br from-amber-400/20 to-amber-400/5 shadow-[0_0_20px_rgba(251,191,36,0.12)]'
                      : 'border-white/[0.07] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{p.icon}</span>
                    <span className={`text-sm font-semibold ${on ? 'text-amber-200' : 'text-white'}`}>{p.title}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{p.blurb}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h3 className="panel-title mb-1 px-1">Players, money &amp; pace</h3>
        <div className={grid}>
          <Row icon={<Users size={16} />} title="Max players" desc="People and bots in the room">
            <Select
              value={settings.maxPlayers}
              disabled={readOnly}
              label="Max players"
              options={[2, 3, 4, 5, 6, 7, 8].map((n) => [n, String(n)])}
              onChange={(v) => onUpdateSettings({ maxPlayers: v })}
            />
          </Row>
          <Row icon={<Banknote size={16} />} title="Starting cash" desc="Money each player begins with">
            <Select
              value={settings.startingCash}
              disabled={readOnly}
              label="Starting cash"
              options={[1000, 1500, 2000, 2500, 3000].map((n) => [n, formatINR(n)])}
              onChange={(v) => onUpdateSettings({ startingCash: v })}
            />
          </Row>
          <Row icon={<Hourglass size={16} />} title="Game length" desc="Richest player after the last round wins">
            <Select
              value={settings.roundLimit}
              disabled={readOnly}
              label="Game length"
              options={[...[15, 20, 30, 45, 60].map((n) => [n, `${n} rounds`] as [number, string]), [0, 'Endless']]}
              onChange={(v) => onUpdateSettings({ roundLimit: v })}
            />
          </Row>
          <Row icon={<Timer size={16} />} title="Turn timer" desc="Out of time? A safe move is made for you">
            <Select
              value={settings.turnTimeoutSeconds}
              disabled={readOnly}
              label="Turn timer"
              options={[[0, 'Off'], ...[20, 30, 45, 60, 90].map((n) => [n, `${n} s`] as [number, string])]}
              onChange={(v) => onUpdateSettings({ turnTimeoutSeconds: v })}
            />
          </Row>
        </div>
      </section>

      <section>
        <h3 className="panel-title mb-1 px-1">House rules</h3>
        <div className={grid}>
          {toggle('festivalEvents', 'Festivals', 'Every 3rd round, one rule bends for a round', <PartyPopper size={16} />)}
          {toggle('auctionOnDecline', 'Auctions', 'Unbought properties go under the hammer', <Gavel size={16} />)}
          {toggle('mortgageEnabled', 'Mortgages', 'Borrow half a property’s price; no rent until repaid', <Landmark size={16} />)}
          {toggle('doubleRentOnSet', 'Double rent on full sets', 'Unbuilt sets earn twice the base rent', <Coins size={16} />)}
          {toggle('vacationCash', 'Chai Break pool', 'Taxes and fines pile up for whoever lands there', <Coffee size={16} />)}
          {toggle('chaiBreakRest', 'Chai Break rest', 'Stop for chai and miss your next turn', <Coffee size={16} />)}
          {toggle('noRentInJail', 'No rent from jail', 'Owners behind bars collect nothing', <Lock size={16} />)}
          {toggle('evenBuild', 'Build evenly', 'Spread houses evenly across a set', <Home size={16} />)}
          {toggle('doubleSalaryOnGo', 'Double salary on Shuru', 'Land exactly on Shuru for twice the pay', <Flag size={16} />)}
          {toggle('randomizePlayerOrder', 'Random turn order', 'Shuffle who goes first', <Shuffle size={16} />)}
        </div>
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Modal                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  settings: GameSettings;
  readOnly: boolean;
  onUpdateSettings: (settings: Partial<GameSettings>) => void;
  onClose: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
}

export const GameSettingsModal: React.FC<Props> = ({ settings, readOnly, onUpdateSettings, onClose, soundOn, onToggleSound }) => (
  <Modal size="lg" onClose={onClose} labelledBy="settings-title">
    <ModalHeader
      id="settings-title"
      eyebrow={readOnly ? 'Only the host can change rules, before the game starts' : 'Room rules'}
      title="Game settings"
      icon="⚙️"
      onClose={onClose}
    />
    <ModalBody className="space-y-4">
      <RulesPanel settings={settings} readOnly={readOnly} onUpdateSettings={onUpdateSettings} wide showPresets={!readOnly} />
      <section>
        <h3 className="panel-title mb-1 px-1">This device</h3>
        <Row icon={<span className="text-sm">🔊</span>} title="Sound effects" desc="Saved on this device">
          <Toggle label="Sound effects" checked={soundOn} onChange={onToggleSound} />
        </Row>
      </section>
    </ModalBody>
    <ModalFooter>
      <button type="button" className="btn btn-primary" onClick={onClose}>
        Done
      </button>
    </ModalFooter>
  </Modal>
);
