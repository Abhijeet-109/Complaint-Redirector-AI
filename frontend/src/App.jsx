import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { MyComplaints } from './pages/MyComplaints';
import { HandlerDashboardPage } from './pages/HandlerDashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { SuperAdminDashboardPage } from './pages/SuperAdminDashboardPage';
import { resolveAuthorizedPage } from './utils/roleAccess';

function AppContent() {
  const { user, isAuthenticated, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState(() => {
    const path = window.location.pathname.toLowerCase();
    if (path === '/login') return 'login';
    if (path === '/register') return 'register';
    if (path === '/my-complaints') return 'my-complaints';
    if (path === '/handler-dashboard') return 'handler-dashboard';
    if (path === '/admin-dashboard') return 'admin-dashboard';
    if (path === '/admin') return 'super-admin-dashboard';
    if (path === '/super-admin-dashboard') return 'super-admin-dashboard';
    return 'home';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      if (path === '/login') setCurrentPage('login');
      else if (path === '/register') setCurrentPage('register');
      else if (path === '/my-complaints') setCurrentPage('my-complaints');
      else if (path === '/handler-dashboard') setCurrentPage('handler-dashboard');
      else if (path === '/admin-dashboard') setCurrentPage('admin-dashboard');
      else if (path === '/admin') setCurrentPage('super-admin-dashboard');
      else if (path === '/super-admin-dashboard') setCurrentPage('super-admin-dashboard');
      else setCurrentPage('home');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (page) => {
    let targetPath = '/';
    if (page === 'login') targetPath = '/login';
    if (page === 'register') targetPath = '/register';
    if (page === 'my-complaints') targetPath = '/my-complaints';
    if (page === 'handler-dashboard') targetPath = '/handler-dashboard';
    if (page === 'admin-dashboard') targetPath = '/admin-dashboard';
    if (page === 'super-admin-dashboard') targetPath = '/super-admin-dashboard';

    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const authorizedPage = resolveAuthorizedPage(currentPage, user?.role, isAuthenticated);

  // Keep the address bar in sync with the page allowed by the authenticated role.
  useEffect(() => {
    if (!loading && authorizedPage !== currentPage) navigateTo(authorizedPage);
  }, [loading, authorizedPage, currentPage, navigateTo]);

  // Do not render role-specific pages while the server is validating saved auth state.
  if (loading) {
    return (
      <main className="fk-app-loading" role="status" aria-live="polite">
        Loading your Flatkart account…
      </main>
    );
  }

  if (authorizedPage === 'login') {
    return <Login onNavigate={navigateTo} />;
  }

  if (authorizedPage === 'register') {
    return <Register onNavigate={navigateTo} />;
  }

  if (authorizedPage === 'my-complaints') {
    return <MyComplaints onNavigate={navigateTo} />;
  }

  if (authorizedPage === 'handler-dashboard') {
    return <HandlerDashboardPage onNavigate={navigateTo} />;
  }

  if (authorizedPage === 'admin-dashboard') {
    return <AdminDashboardPage onNavigate={navigateTo} />;
  }

  if (authorizedPage === 'super-admin-dashboard') {
    return <SuperAdminDashboardPage onNavigate={navigateTo} />;
  }

  return <Home onNavigate={navigateTo} />;
}

export function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <AppContent />
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
