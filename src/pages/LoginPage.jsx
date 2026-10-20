import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
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
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo className="mx-auto justify-center" inverted />
          <p className="mt-3 text-sm text-[#cfc7b8]">Pilotez vos chantiers, vos dépenses et vos encaissements.</p>
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

        <p className="mt-6 text-center text-sm text-[#cfc7b8]">
          Pas encore de compte ?{' '}
          <Link to="/inscription" className="font-bold text-[#eab956] hover:underline">
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
