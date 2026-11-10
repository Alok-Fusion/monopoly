import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  children: React.ReactNode;
  /** When provided, clicking the backdrop or pressing Escape closes the modal. */
  onClose?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  labelledBy?: string;
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
};

export const Modal: React.FC<ModalProps> = ({ children, onClose, size = 'md', className = '', labelledBy }) => {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-2 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        className={`panel flex max-h-[92vh] w-full flex-col overflow-hidden shadow-2xl shadow-black/50 animate-pop-in ${SIZES[size]} ${className}`}
      >
        {children}
      </div>
    </div>
  );
};

interface HeaderProps {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
  onClose?: () => void;
  id?: string;
  accent?: string;
}

export const ModalHeader: React.FC<HeaderProps> = ({ title, eyebrow, icon, onClose, id, accent }) => (
  <div className="flex items-start gap-3 border-b border-ink-700 px-5 py-4">
    {icon && (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
        style={{ backgroundColor: accent ? `${accent}22` : 'rgba(251,191,36,0.12)', color: accent ?? '#FCD34D' }}
      >
        {icon}
      </div>
    )}
    <div className="min-w-0 flex-1">
      {eyebrow && <div className="panel-title mb-0.5">{eyebrow}</div>}
      <h2 id={id} className="font-display text-lg font-bold leading-tight text-white">
        {title}
      </h2>
    </div>
    {onClose && (
      <button type="button" onClick={onClose} className="icon-btn -mr-2 -mt-1" aria-label="Close">
        <X size={18} />
      </button>
    )}
  </div>
);

export const ModalBody: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`min-h-0 flex-1 overflow-y-auto px-5 py-4 ${className}`}>{children}</div>
);

export const ModalFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex flex-wrap items-center justify-end gap-2 border-t border-ink-700 bg-ink-900/60 px-5 py-3 ${className}`}>
    {children}
  </div>
);

interface ConfirmProps {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmProps> = ({ title, message, confirmLabel, danger, onConfirm, onCancel }) => (
  <Modal onClose={onCancel} size="sm">
    <ModalHeader title={title} onClose={onCancel} />
    <ModalBody>
      <div className="text-sm leading-relaxed text-slate-300">{message}</div>
    </ModalBody>
    <ModalFooter>
      <button type="button" className="btn btn-secondary" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
        {confirmLabel}
      </button>
    </ModalFooter>
  </Modal>
);
