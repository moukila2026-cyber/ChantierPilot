import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { LoadingPage } from './components/ui.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ProjectDetailPage from './pages/ProjectDetailPage.jsx';
import ExpensesPage from './pages/ExpensesPage.jsx';
import PaymentsPage from './pages/PaymentsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import PricingPage from './pages/PricingPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingPage label="Vérification de votre session…" />;
  if (status === 'anon') return <Navigate to="/connexion" state={{ from: location.pathname }} replace />;
  return <Layout>{children}</Layout>;
}

function PublicOnly({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingPage />;
  if (status === 'auth') return <Navigate to="/" replace />;
  return children;
}

function PricingRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingPage />;
  if (status === 'auth') return <RequireAuth><PricingPage /></RequireAuth>;
  return <PricingPage standalone />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/inscription" element={<PublicOnly><RegisterPage /></PublicOnly>} />
      <Route path="/offres" element={<PricingRoute />} />
      <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/chantiers" element={<RequireAuth><ProjectsPage /></RequireAuth>} />
      <Route path="/chantiers/:id" element={<RequireAuth><ProjectDetailPage /></RequireAuth>} />
      <Route path="/depenses" element={<RequireAuth><ExpensesPage /></RequireAuth>} />
      <Route path="/encaissements" element={<RequireAuth><PaymentsPage /></RequireAuth>} />
      <Route path="/parametres" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
