import { Link } from 'react-router-dom';
import { Button, Footer } from '../components/ui.jsx';
import Logo from '../components/Logo.jsx';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f2eb]">
      <header className="border-b border-[#eab956]/25 bg-[#141210] px-4 py-3.5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Logo inverted to="/" />
          <Link to="/connexion" className="text-sm font-bold text-[#eab956] hover:underline">Connexion</Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="cp-card w-full p-8 sm:p-10">
          <p className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#141210] text-2xl font-extrabold text-[#eab956] ring-1 ring-[#eab956]/40">
            404
          </p>
          <h1 className="mt-5 text-2xl font-extrabold text-[#141210]">Page introuvable</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#574f45]">
            Cette adresse n’existe pas ou a été déplacée. Retrouvez tous vos chantiers et documents depuis votre tableau de bord.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/">
              <Button>Retour au tableau de bord</Button>
            </Link>
            <Link to="/offres">
              <Button variant="secondary">Offres &amp; tarifs</Button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
