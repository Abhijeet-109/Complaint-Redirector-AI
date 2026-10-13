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

  // Auth guards & role-aware redirects
  useEffect(() => {
    if (!loading) {
      const protectedPages = [
        'my-complaints',
        'handler-dashboard',
        'admin-dashboard',
        'super-admin-dashboard',
      ];

      // If unauthenticated trying to access protected dashboards
      if (protectedPages.includes(currentPage) && !isAuthenticated) {
        navigateTo('login');
        return;
      }

      if (isAuthenticated && user?.role) {
        if (user.role === 'super_admin') {
          if (['my-complaints', 'handler-dashboard', 'admin-dashboard'].includes(currentPage)) {
            navigateTo('super-admin-dashboard');
          }
        } else if (user.role === 'admin') {
          if (['my-complaints', 'handler-dashboard', 'super-admin-dashboard'].includes(currentPage)) {
            navigateTo('admin-dashboard');
          }
        } else if (user.role === 'department_handler') {
          if (['my-complaints', 'admin-dashboard', 'super-admin-dashboard'].includes(currentPage)) {
            navigateTo('handler-dashboard');
          }
        } else if (user.role === 'user') {
          if (['handler-dashboard', 'admin-dashboard', 'super-admin-dashboard'].includes(currentPage)) {
            navigateTo('my-complaints');
          }
        }
      }
    }
  }, [loading, currentPage, isAuthenticated, user]);

  if (currentPage === 'login') {
    return <Login onNavigate={navigateTo} />;
  }

  if (currentPage === 'register') {
    return <Register onNavigate={navigateTo} />;
  }

  if (currentPage === 'my-complaints') {
    return <MyComplaints onNavigate={navigateTo} />;
  }

  if (currentPage === 'handler-dashboard') {
    return <HandlerDashboardPage onNavigate={navigateTo} />;
  }

  if (currentPage === 'admin-dashboard') {
    return <AdminDashboardPage onNavigate={navigateTo} />;
  }

  if (currentPage === 'super-admin-dashboard') {
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
