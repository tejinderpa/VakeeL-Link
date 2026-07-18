import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext.jsx';
import useAuth from './components/useAuth';
import LandingPage from './pages/LandingPage';
import LawyerDirectory from './pages/LawyerDirectory';
import LawyerProfile from './pages/LawyerProfile';
import Login from './pages/Login';
import Signup from './pages/Signup';
import MyCases from './pages/MyCases';
import LawyerDashboard from './pages/LawyerDashboard';
import UserDashboard from './pages/UserDashboard';
import CaseCurator from './pages/CaseCurator';
import AIAssistant from './pages/AIAssistant';
import CaseSearch from './pages/CaseSearch';
import Statutes from './pages/Statutes';
import Archive from './pages/Archive';
import Consultations from './pages/Consultations';
import Profile from './pages/Profile';
import ScrollToTop from './components/ScrollToTop.jsx';
import './App.css';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="flex min-h-screen bg-[#faf8ff] items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div>
    </div>
  );
  if (!user) return <Login />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="flex min-h-screen bg-[#faf8ff] items-center justify-center flex-col gap-4 text-[#0f2d5e]">
        <p className="text-sm font-semibold">Access denied</p>
        <Link to="/" className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
          Return home
        </Link>
      </div>
    );
  }

  return children;
};

function AppContent() {
  const location = useLocation();
  // Most pages now have internal sidebars and dark themes
  const isDashboardPage = [
    '/dashboard',
    '/my-cases',
    '/case-curator',
    '/case-search',
    '/assistant',
    '/lawyers',
    '/statutes',
    '/archive',
    '/consultations',
    '/profile',
  ].some((path) => location.pathname.startsWith(path));

  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';
  const isLandingPage = location.pathname === '/';

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#faf8ff] text-slate-900 font-inter selection:bg-blue-200/60">
      <main className="flex-grow flex flex-col w-full">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/lawyers" element={<LawyerDirectory />} />
          <Route path="/lawyers/:id" element={<LawyerProfile />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/dashboard/lawyer"
            element={
              <ProtectedRoute allowedRoles={['lawyer']}>
                <LawyerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/user"
            element={
              <ProtectedRoute allowedRoles={['user']}>
                <UserDashboard />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/my-cases" 
            element={
              <ProtectedRoute allowedRoles={['lawyer']}>
                <MyCases />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/case-curator" 
            element={
              <ProtectedRoute>
                <CaseCurator />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/assistant"
            element={
              <ProtectedRoute>
                <AIAssistant />
              </ProtectedRoute>
            }
          />
          <Route path="/assisstant" element={<Navigate to="/assistant" replace />} />
          <Route path="/case-search" element={<CaseSearch />} />
          <Route path="/statutes" element={<Statutes />} />
          <Route path="/archive" element={<Archive />} />
          
          <Route path="/consultations" element={
            <ProtectedRoute>
              <Consultations />
            </ProtectedRoute>
          } />
          
          <Route path="/profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />
          
          <Route path="/pricing" element={<div className="min-h-screen flex items-center justify-center text-slate-700">Pricing Page (Coming Soon)</div>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Global Footer only for Landing/Static pages */}
      {!isDashboardPage && !isAuthPage && !isLandingPage && (
        <footer className="w-full border-t border-slate-200 bg-white py-10 flex flex-col md:flex-row justify-between items-center px-8 gap-4">
          <span className="text-xs text-slate-400">
            © {new Date().getFullYear()} VakeelLink. All rights reserved.
          </span>
          <div className="flex gap-6">
            <a className="text-xs font-medium text-slate-500 hover:text-[#0f2d5e] transition-colors" href="#">Ethics</a>
            <a className="text-xs font-medium text-slate-500 hover:text-[#0f2d5e] transition-colors" href="#">Terms</a>
            <a className="text-xs font-medium text-slate-500 hover:text-[#0f2d5e] transition-colors" href="#">Support</a>
          </div>
        </footer>
      )}
    </div>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
