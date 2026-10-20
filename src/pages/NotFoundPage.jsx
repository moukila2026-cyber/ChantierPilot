import { Link } from 'react-router-dom';
import { Button, Footer } from '../components/ui.jsx';
import Logo from '../components/Logo.jsx';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f2eb] px-4 text-center">
      <Logo className="mb-8" to="/" />
      <p className="text-6xl font-extrabold text-[#d4941e]">404</p>
      <h1 className="mt-4 text-xl font-extrabold text-[#141210]">Page introuvable</h1>
      <p className="mt-2 max-w-sm text-sm text-[#574f45]">
        Cette page n'existe pas ou a été déplacée.
      </p>
      <Link to="/" className="mt-6">
        <Button>Retour au tableau de bord</Button>
      </Link>
      <Footer />
    </div>
  );
}
