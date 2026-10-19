import { Link } from 'react-router-dom';

/** Identité ChantierPilot : toit, flèche de progression et coches de suivi. */
export function LogoMark({ compact = false, className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      role="img"
      aria-label={compact ? 'ChantierPilot' : undefined}
    >
      <rect x="1" y="1" width="46" height="46" rx="13" fill="#102a43" />
      <path d="M9 23 23.5 11 39 23" fill="none" stroke="#f4a340" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 23v13h8v-8h6v8h8V23" fill="none" stroke="#f4a340" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m17 29 2.1 2.1 3.8-4.2M28 29l2.1 2.1 3.8-4.2" fill="none" stroke="#f7f4ed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m25 18 4 3.3-4 3.2" fill="none" stroke="#f7f4ed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ compact = false, inverted = false, className = '', to = '/' }) {
  const titleColor = inverted ? 'text-white' : 'text-slate-900';
  const subtitleColor = inverted ? 'text-slate-300' : 'text-slate-500';
  return (
    <Link to={to} className={`inline-flex items-center gap-2.5 ${className}`} aria-label="ChantierPilot — accueil">
      <LogoMark className={compact ? 'h-9 w-9 shrink-0' : 'h-11 w-11 shrink-0'} compact={compact} />
      {!compact && (
        <span className="text-left">
          <span className={`block text-base font-extrabold leading-tight tracking-tight ${titleColor}`}>ChantierPilot</span>
          <span className={`mt-0.5 block text-[11px] leading-tight ${subtitleColor}`}>Le suivi clair de vos chantiers</span>
        </span>
      )}
    </Link>
  );
}
