import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
import BtpVisual from '../components/BtpVisual.jsx';
import { Alert, Button, Card, Field, Footer, Input, PasswordInput } from '../components/ui.jsx';

const EMPTY = {
  company: { name: '', rccm: '', phone: '', email: '', address: '', city: 'Daloa' },
  user: { full_name: '', email: '', password: '' },
};

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [loading, setLoading] = useState(false);

  const setCompany = (k, v) => setForm((f) => ({ ...f, company: { ...f.company, [k]: v } }));
  const setUser = (k, v) => setForm((f) => ({ ...f, user: { ...f.user, [k]: v } }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFields({});
    setLoading(true);
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      setFields(err.fields || {});
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#141210] px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 overflow-hidden rounded-3xl border border-[#eab956]/35 bg-[#1b1815] shadow-2xl">
          <BtpVisual
            kind="hero"
            eager
            alt="Ingénieurs et responsables BTP préparant un chantier à Abidjan"
            className="h-44 w-full object-cover object-center sm:h-56"
          />
          <div className="p-6 text-center">
            <Logo className="mx-auto mb-4 justify-center" inverted />
            <h1 className="text-2xl font-extrabold text-[#fbf8f1]">Créer votre entreprise sur ChantierPilot</h1>
            <p className="mt-2 text-sm text-[#cfc7b8]">
              L'espace de chaque entreprise est isolé. Vous serez l'administrateur de cet espace.
            </p>
          </div>
        </div>

        <Card>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {error && <Alert type="error">{error}</Alert>}

            <fieldset className="space-y-4">
              <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-[#574f45]">Votre entreprise</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom de l'entreprise" htmlFor="c-name" error={fields['company.name']} required>
                  <Input id="c-name" value={form.company.name} onChange={(e) => setCompany('name', e.target.value)}
                    placeholder="Ex. BTP Daloa Construction" error={fields['company.name']} />
                </Field>
                <Field label="Ville" htmlFor="c-city" error={fields['company.city']} required>
                  <Input id="c-city" value={form.company.city} onChange={(e) => setCompany('city', e.target.value)}
                    placeholder="Daloa" error={fields['company.city']} />
                </Field>
                <Field label="Téléphone" htmlFor="c-phone" error={fields['company.phone']}>
                  <Input id="c-phone" type="tel" value={form.company.phone} onChange={(e) => setCompany('phone', e.target.value)}
                    placeholder="+225 07 00 00 00 00" error={fields['company.phone']} />
                </Field>
                <Field label="E-mail professionnel" htmlFor="c-email" error={fields['company.email']}>
                  <Input id="c-email" type="email" value={form.company.email} onChange={(e) => setCompany('email', e.target.value)}
                    placeholder="contact@entreprise.ci" error={fields['company.email']} />
                </Field>
              </div>
              <Field label="Adresse" htmlFor="c-address" error={fields['company.address']}>
                <Input id="c-address" value={form.company.address} onChange={(e) => setCompany('address', e.target.value)}
                  placeholder="Quartier, rue…" error={fields['company.address']} />
              </Field>
              <Field label="RCCM (optionnel)" htmlFor="c-rccm" error={fields['company.rccm']}
                hint="Affiché sur les rapports PDF.">
                <Input id="c-rccm" value={form.company.rccm} onChange={(e) => setCompany('rccm', e.target.value)}
                  placeholder="RC CI-DLO-2024-B-0000" error={fields['company.rccm']} />
              </Field>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-[#574f45]">Votre compte administrateur</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom complet" htmlFor="u-name" error={fields['user.full_name']} required>
                  <Input id="u-name" value={form.user.full_name} onChange={(e) => setUser('full_name', e.target.value)}
                    placeholder="Ex. Koffi Yao" error={fields['user.full_name']} />
                </Field>
                <Field label="Adresse e-mail" htmlFor="u-email" error={fields['user.email']} required>
                  <Input id="u-email" type="email" value={form.user.email} onChange={(e) => setUser('email', e.target.value)}
                    placeholder="vous@entreprise.ci" error={fields['user.email']} />
                </Field>
              </div>
              <Field label="Mot de passe" htmlFor="u-password" error={fields['user.password']} required
                hint="Au moins 10 caractères, avec une lettre et un chiffre.">
                <PasswordInput id="u-password" autoComplete="new-password" value={form.user.password}
                  onChange={(e) => setUser('password', e.target.value)} error={fields['user.password']} />
              </Field>
            </fieldset>

            <Button type="submit" loading={loading} className="w-full">
              {loading ? 'Création en cours…' : 'Créer mon entreprise'}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-sm text-[#cfc7b8]">
          Déjà un compte ?{' '}
          <Link to="/connexion" className="font-bold text-[#eab956] hover:underline">Se connecter</Link>
        </p>
        <Footer dark />
      </div>
    </div>
  );
}
