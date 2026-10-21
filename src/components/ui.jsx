import { useEffect, useId, useRef, useState } from 'react';

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Button({ variant = 'primary', loading = false, children, className = '', ...props }) {
  const styles = {
    primary: 'bg-[#e5a93b] text-[#141210] hover:bg-[#f0b84c] disabled:bg-[#ecd29b] disabled:text-[#6b6257] shadow-sm ring-1 ring-[#141210]/10 font-bold',
    charcoal: 'bg-[#141210] text-[#fbf8f1] hover:bg-[#221e1a] ring-1 ring-[#eab956]/35 disabled:opacity-50 font-semibold',
    secondary: 'bg-white text-[#141210] ring-1 ring-[#cfc7b8] hover:bg-[#faf7f0] hover:ring-[#b8ad99] disabled:text-[#9c9488] font-semibold',
    danger: 'bg-rose-700 text-white hover:bg-rose-800 disabled:bg-rose-300 font-semibold',
    ghost: 'text-[#3f3932] hover:bg-[#eae4d7] disabled:text-[#9c9488] font-semibold',
  }[variant] || 'bg-[#e5a93b] text-[#141210] font-bold';
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition disabled:cursor-not-allowed ${styles} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Field({ label, error, hint, required, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-[#1c1916]">
        {label}
        {required && <span className="ml-0.5 text-rose-700" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs leading-5 text-[#574f45]">{hint}</p>}
      {error && <p className="mt-1 text-xs font-semibold text-rose-700" role="alert">{error}</p>}
    </div>
  );
}

const inputClass = (error) =>
  `block min-h-11 w-full rounded-xl border bg-white px-3.5 py-2 text-sm text-[#141210] placeholder:text-[#8a8072] ` +
  (error ? 'border-rose-500 focus:border-rose-600' : 'border-[#c7beae] focus:border-[#b7791f]') +
  ' focus:outline-none focus:ring-2 focus:ring-[#e5a93b]/35';

export function Input({ error, className = '', ...props }) {
  return <input className={`${inputClass(error)} ${className}`} {...props} />;
}

/** Champ mot de passe avec œil afficher/masquer (accessible : aria-pressed). */
export function PasswordInput({ error, className = '', ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={`${inputClass(error)} pr-12 ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#574f45] transition hover:bg-[#f5f2eb] hover:text-[#141210]"
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        aria-pressed={visible}
        title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        tabIndex={0}
      >
        {visible ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </button>
    </div>
  );
}

export function Select({ error, children, className = '', ...props }) {
  return (
    <select className={`${inputClass(error)} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ error, className = '', ...props }) {
  return <textarea className={`${inputClass(error)} min-h-[82px] ${className}`} {...props} />;
}

export function Card({ children, className = '', pad = true }) {
  return (
    <div className={`cp-card-surface rounded-2xl ${pad ? 'p-4 sm:p-6' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, tone = 'slate', featured = false }) {
  if (featured) {
    return (
      <div className="cp-charcoal-panel rounded-2xl p-4 shadow-md">
        <p className="text-xs font-bold uppercase tracking-wider text-[#eab956]">{label}</p>
        <p className="mt-1.5 text-lg font-extrabold tabular text-[#fbf8f1] sm:text-xl">{value}</p>
        {sub && <p className="mt-1 text-xs text-[#cfc7b8]">{sub}</p>}
      </div>
    );
  }
  const tones = {
    slate: 'border-[#dfd8c8] border-t-2 border-t-[#141210]',
    default: 'border-[#dfd8c8] border-t-2 border-t-[#141210]',
    green: 'border-emerald-300 border-t-2 border-t-emerald-600 bg-emerald-50/25',
    red: 'border-rose-300 border-t-2 border-t-rose-600 bg-rose-50/25',
    amber: 'border-[#e6ce96] border-t-2 border-t-[#e5a93b] bg-[#fdf8ec]/45',
    gold: 'border-[#e6ce96] border-t-2 border-t-[#e5a93b] bg-[#fdf8ec]/45',
    blue: 'border-sky-300 border-t-2 border-t-sky-600',
  }[tone] || 'border-[#dfd8c8] border-t-2 border-t-[#141210]';
  return (
    <div className={`cp-card-surface rounded-2xl ${tones} p-4`}>
      <p className="text-xs font-bold uppercase tracking-wide text-[#574f45]">{label}</p>
      <p className="mt-1.5 text-lg font-extrabold tabular text-[#141210] sm:text-xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-[#574f45]">{sub}</p>}
    </div>
  );
}

export function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

export function Alert({ type = 'error', children, onClose }) {
  const styles = {
    error: 'border-rose-300 bg-rose-50 text-rose-900',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    info: 'border-[#e6ce96] bg-[#fdf8ec] text-[#141210]',
    warning: 'border-amber-300 bg-amber-50 text-amber-950',
  }[type] || 'border-[#e6ce96] bg-[#fdf8ec] text-[#141210]';
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm leading-6 ${styles}`} role="alert">
      <div>{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 font-bold opacity-70 hover:opacity-100" aria-label="Fermer">
          ×
        </button>
      )}
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide = false, size }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    document.body.style.overflow = 'hidden';

    const focusable = () => [...dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((el) => el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0);

    requestAnimationFrame(() => (focusable()[0] || dialog).focus());
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;
  const maxWidth = wide || size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0c0b09]/70 p-0 backdrop-blur-[1px] sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`animate-fade-in flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[#eab956]/30 bg-white shadow-2xl outline-none sm:rounded-2xl ${maxWidth}`}
      >
        <div className="flex items-center justify-between border-b border-[#eab956]/25 bg-[#141210] px-5 py-4">
          <h2 id={titleId} className="text-base font-extrabold text-[#fbf8f1] sm:text-lg">{title}</h2>
          <button
            type="button"
            onClick={() => closeRef.current?.()}
            className="rounded-lg p-1.5 text-[#cfc7b8] transition hover:bg-white/10 hover:text-white"
            aria-label="Fermer"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#c7beae] bg-white px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#141210] text-[#eab956] ring-1 ring-[#eab956]/40">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      </span>
      <h3 className="text-base font-bold text-[#141210]">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-[#574f45]">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Pagination({ pagination, onPageChange }) {
  if (!pagination || (pagination.total <= pagination.limit && pagination.offset === 0)) return null;
  const pages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const requestedPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const currentPage = Math.min(requestedPage, pages);
  const firstItem = pagination.total ? Math.min(pagination.offset + 1, pagination.total) : 0;
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-xs font-medium text-[#574f45]" aria-live="polite">
        {firstItem}–{Math.min(pagination.offset + pagination.limit, pagination.total)} sur {pagination.total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" disabled={pagination.offset === 0}
          onClick={() => onPageChange(requestedPage - 1)} aria-label="Page précédente">Précédent</Button>
        <span className="min-w-20 text-center text-xs font-semibold text-[#3f3932]">Page {currentPage} / {pages}</span>
        <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" disabled={!pagination.hasMore}
          onClick={() => onPageChange(currentPage + 1)} aria-label="Page suivante">Suivant</Button>
      </div>
    </nav>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <section className="cp-charcoal-panel mb-6 flex flex-col gap-4 rounded-3xl p-5 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0 border-l-4 border-[#eab956] pl-4">
        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#eab956]">
          {eyebrow || 'ChantierPilot · Gestion BTP'}
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#fbf8f1] sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm leading-6 text-[#dfd9ce]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </section>
  );
}

export function LoadingPage({ label = 'Chargement…' }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-[#574f45]">
      <Spinner className="h-8 w-8 text-[#b7791f]" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

/** Pied de page commun — présent sur TOUTES les pages (marque Shopin30). */
export function Footer({ dark = false }) {
  return (
    <footer
      className={`mt-10 border-t px-4 py-6 text-center text-sm ${
        dark ? 'border-white/10 text-[#b9b0a1]' : 'border-[#dfd8c8] text-[#574f45]'
      }`}
    >
      <p>
        <span className={`font-extrabold tracking-wide ${dark ? 'text-[#eab956]' : 'text-[#141210]'}`}>
          Conçu par SHOPIN30
        </span>
        <span className="mx-2 opacity-50" aria-hidden="true">·</span>
        <span>ChantierPilot © {new Date().getFullYear()}</span>
      </p>
      <p className="mt-1 text-xs opacity-85">Gestion de chantiers BTP — Côte d&apos;Ivoire</p>
      <p className="mt-1.5 text-xs">
        <a
          className={`font-semibold underline underline-offset-2 ${dark ? 'text-[#fbf8f1] hover:text-[#eab956]' : 'text-[#141210] hover:text-[#854d0e]'}`}
          href="tel:+2250501303343"
        >
          +225 05 01 30 33 43
        </a>
        <span className="mx-2 opacity-50" aria-hidden="true">·</span>
        <a
          className={`font-semibold underline underline-offset-2 ${dark ? 'text-[#fbf8f1] hover:text-[#eab956]' : 'text-[#141210] hover:text-[#854d0e]'}`}
          href="/cgu"
        >
          Conditions générales d’utilisation
        </a>
      </p>
    </footer>
  );
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 lg:bottom-6">
      <div className={`animate-fade-in rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl ${
        toast.type === 'error'
          ? 'border-rose-400/40 bg-rose-700 text-white'
          : 'border-[#eab956]/40 bg-[#141210] text-[#fbf8f1]'
      }`}>
        {toast.message}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmer', onConfirm, onCancel, loading }) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="text-sm leading-6 text-[#3f3932]">{message}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
