import { Link } from 'react-router-dom';
import { Button } from '../components/ui.jsx';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 text-center">
      <p className="text-6xl font-extrabold text-amber-500">404</p>
      <h1 className="mt-4 text-xl font-bold text-slate-900">Page introuvable</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        Cette page n'existe pas ou a été déplacée.
      </p>
      <Link to="/" className="mt-6">
        <Button>Retour au tableau de bord</Button>
      </Link>
    </div>
  );
}
