import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
import BtpVisual from '../components/BtpVisual.jsx';
import { Alert, Button, Card, Field, Footer, Input, PasswordInput } from '../components/ui.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFields({});
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setFields(err.fields || {});
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#141210] px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="mb-8 text-center lg:hidden">
          <Logo className="mx-auto justify-center" inverted />
          <p className="mt-3 text-sm text-[#cfc7b8]">Pilotez vos chantiers, vos dépenses et vos encaissements.</p>
        </div>

        <div className="grid items-stretch gap-8 lg:grid-cols-12">
          <div className="overflow-hidden rounded-3xl border border-[#eab956]/35 bg-[#1b1815] shadow-2xl lg:col-span-6">
            <BtpVisual
              kind="terrain"
              eager
              alt="Supervision d’équipe BTP et suivi terrain à Abidjan"
              className="h-44 w-full object-cover object-center sm:h-60 lg:h-64"
            />
            <div className="p-6 text-[#fbf8f1]">
              <div className="hidden lg:block">
                <Logo inverted />
              </div>
              <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.16em] text-[#eab956]">
                Espace entreprise isolé · FCFA
              </p>
              <h1 className="mt-1.5 text-xl font-extrabold text-[#fbf8f1] sm:text-2xl">
                Pilotez vos chantiers, vos dépenses et vos encaissements.
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#cfc7b8]">
                Accédez à vos devis, factures, présences d’ouvriers, plans annotés et stocks multi-dépôts depuis le bureau comme sur le chantier.
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-center lg:col-span-6">
            <Card>
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <h2 className="text-lg font-bold text-slate-900">Connexion</h2>
                {error && <Alert type="error">{error}</Alert>}
                <Field label="Adresse e-mail" htmlFor="email" error={fields.email} required>
                  <Input
                    id="email" type="email" name="email" autoComplete="email" required
                    placeholder="vous@entreprise.ci" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    error={fields.email}
                  />
                </Field>
                <Field label="Mot de passe" htmlFor="password" error={fields.password} required>
                  <PasswordInput
                    id="password" name="password" autoComplete="current-password" required
                    placeholder="••••••••••" value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    error={fields.password}
                  />
                </Field>
                <Button type="submit" loading={loading} className="w-full">
                  {loading ? 'Connexion en cours…' : 'Se connecter'}
                </Button>
              </form>
            </Card>

            <p className="mt-6 text-center text-sm text-[#cfc7b8]">
              Pas encore de compte ?{' '}
              <Link to="/inscription" className="font-bold text-[#eab956] hover:underline">
                Créer mon entreprise
              </Link>
            </p>
            <p className="mt-3 text-center text-xs text-[#a89f91]">
              Vos données sont cloisonnées par entreprise et protégées par des politiques de sécurité au niveau de la base de données.
            </p>
          </div>
        </div>

        <Footer dark />
      </div>
    </div>
  );
}
