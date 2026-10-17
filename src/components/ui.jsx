import { useEffect } from 'react';

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
    primary: 'bg-amber-600 text-white hover:bg-amber-700 disabled:bg-amber-300 shadow-sm',
    secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
    ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-400',
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${styles} ${className}`}
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
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-600" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-rose-600" role="alert">{error}</p>}
    </div>
  );
}

const inputClass = (error) =>
  `block min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 ` +
  (error ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-amber-500') +
  ' focus:outline-none focus:ring-2 focus:ring-amber-500/30';

export function Input({ error, className = '', ...props }) {
  return <input className={`${inputClass(error)} ${className}`} {...props} />;
}

export function Select({ error, children, className = '', ...props }) {
  return (
    <select className={`${inputClass(error)} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ error, className = '', ...props }) {
  return <textarea className={`${inputClass(error)} min-h-[76px] ${className}`} {...props} />;
}

export function Card({ children, className = '', pad = true }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${pad ? 'p-4 sm:p-6' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200',
    green: 'border-emerald-300',
    red: 'border-rose-300',
    amber: 'border-amber-300',
    blue: 'border-sky-300',
  }[tone];
  return (
    <div className={`rounded-xl border ${tones} bg-white p-4 shadow-sm`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular text-slate-900 sm:text-xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

export function Alert({ type = 'error', children, onClose }) {
  const styles = {
    error: 'border-rose-200 bg-rose-50 text-rose-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  }[type];
  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`} role="alert">
      <div>{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 font-bold opacity-60 hover:opacity-100" aria-label="Fermer">
          ×
        </button>
      )}
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`animate-fade-in flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fermer">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <svg className="mb-3 h-10 w-10 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function LoadingPage({ label = 'Chargement…' }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner className="h-8 w-8 text-amber-600" />
      <p className="text-sm">{label}</p>
    </div>
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
    <div className="fixed bottom-20 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 sm:bottom-6">
      <div className={`animate-fade-in rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
        toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'
      }`}>
        {toast.message}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmer', onConfirm, onCancel, loading }) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
