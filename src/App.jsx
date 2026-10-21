import AdvancedPage from './pages/AdvancedPage.jsx';
import OperationsPage from './pages/OperationsPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import PhotosPage from './pages/PhotosPage.jsx';
import OperatorPage from './pages/OperatorPage.jsx';
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
import TermsPage from './pages/TermsPage.jsx';
import LandingPage from './pages/LandingPage.jsx';

function HomeRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingPage label="Vérification de votre session…" />;
  if (status === 'anon') return <LandingPage />;
  return <RequireAuth><DashboardPage /></RequireAuth>;
}

function RequireAuth({ children }) {
  const { status, offlineAccess } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingPage label="Vérification de votre session…" />;
  if (status === 'anon') return <Navigate to="/connexion" state={{ from: location.pathname }} replace />;
  if (offlineAccess && location.pathname !== '/terrain') return <Navigate to="/terrain" replace />;
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
      <Route path="/gestion" element={<RequireAuth><AdvancedPage /></RequireAuth>} />
      <Route path="/terrain" element={<RequireAuth><OperationsPage /></RequireAuth>} />
      <Route path="/photos" element={<RequireAuth><PhotosPage /></RequireAuth>} />
      <Route path="/documents" element={<RequireAuth><DocumentsPage /></RequireAuth>} />
      <Route path="/shopin30" element={<RequireAuth><OperatorPage /></RequireAuth>} />
      <Route path="/connexion" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/inscription" element={<PublicOnly><RegisterPage /></PublicOnly>} />
      <Route path="/offres" element={<PricingRoute />} />
      <Route path="/cgu" element={<TermsPage />} />
      <Route path="/" element={<HomeRoute />} />
      <Route path="/chantiers" element={<RequireAuth><ProjectsPage /></RequireAuth>} />
      <Route path="/chantiers/:id" element={<RequireAuth><ProjectDetailPage /></RequireAuth>} />
      <Route path="/depenses" element={<RequireAuth><ExpensesPage /></RequireAuth>} />
      <Route path="/encaissements" element={<RequireAuth><PaymentsPage /></RequireAuth>} />
      <Route path="/parametres" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
