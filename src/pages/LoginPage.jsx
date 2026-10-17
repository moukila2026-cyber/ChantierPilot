import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
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
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <svg className="mx-auto h-14 w-14 rounded-2xl bg-slate-800 p-2.5" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M8 22 L16 8 L24 22 Z" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" />
            <rect x="12" y="18" width="8" height="4" fill="#f59e0b" />
          </svg>
          <h1 className="mt-4 text-2xl font-bold text-white">ChantierPilot</h1>
          <p className="mt-1 text-sm text-slate-400">Pilotez vos chantiers, vos dépenses et vos encaissements.</p>
        </div>

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

        <p className="mt-6 text-center text-sm text-slate-400">
          Pas encore de compte ?{' '}
          <Link to="/inscription" className="font-semibold text-amber-400 hover:text-amber-300">
            Créer mon entreprise
          </Link>
        </p>
        <p className="mt-4 text-center text-xs text-slate-500">
          Vos données sont cloisonnées par entreprise et protégées par des politiques de sécurité au niveau de la base de données.
        </p>
        <Footer dark />
      </div>
    </div>
  );
}
