import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider, useCart } from './context/CartContext';
import { AddressProvider } from './context/AddressContext';
import { CartDrawer } from './components/common/CartDrawer';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { MyComplaints } from './pages/MyComplaints';
import { MyConversations } from './pages/MyConversations';
import { HandlerDashboardPage } from './pages/HandlerDashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { SuperAdminDashboardPage } from './pages/SuperAdminDashboardPage';
import { ProductDetails } from './pages/ProductDetails';
import { Checkout } from './pages/Checkout';
import { MyAccount } from './pages/MyAccount';
import { resolveAuthorizedPage } from './utils/roleAccess';

function AppContent() {
  const { user, isAuthenticated, loading } = useAuth();
  const { setIsCartOpen } = useCart();
  const initialProductSlug = window.location.pathname.match(/^\/products\/([^/]+)\/?$/i)?.[1];
  const [productSlug, setProductSlug] = useState(() => initialProductSlug ? decodeURIComponent(initialProductSlug) : '');
  const [currentPage, setCurrentPage] = useState(() => {
    const path = window.location.pathname.toLowerCase();
    if (/^\/products\/[^/]+\/?$/.test(path)) return 'product';
    if (path === '/checkout') return 'checkout';
    if (path === '/cart') return 'home';
    if (path.startsWith('/account')) return 'account';
    if (path === '/login') return 'login';
    if (path === '/register') return 'register';
    if (path === '/my-complaints') return 'my-complaints';
    if (path === '/my-conversations') return 'my-conversations';
    if (path === '/handler-dashboard' || path.startsWith('/handler')) return 'handler-dashboard';
    if (path === '/admin-dashboard') return 'admin-dashboard';
    if (path === '/admin') return 'super-admin-dashboard';
    if (path === '/super-admin-dashboard') return 'super-admin-dashboard';
    return 'home';
  });
  const [routePath, setRoutePath] = useState(() => window.location.pathname);

  useEffect(() => {
    if (window.location.pathname.toLowerCase() === '/cart') {
      setIsCartOpen(true);
    }
  }, [setIsCartOpen]);

  useEffect(() => {
    const handlePopState = () => {
      setRoutePath(window.location.pathname);
      const path = window.location.pathname.toLowerCase();
      const productMatch = window.location.pathname.match(/^\/products\/([^/]+)\/?$/i);
      if (productMatch) { setProductSlug(decodeURIComponent(productMatch[1])); setCurrentPage('product'); }
      else if (path === '/checkout') setCurrentPage('checkout');
      else if (path === '/cart') { setIsCartOpen(true); setCurrentPage('home'); }
      else if (path.startsWith('/account')) setCurrentPage('account');
      else if (path === '/login') setCurrentPage('login');
      else if (path === '/register') setCurrentPage('register');
      else if (path === '/my-complaints') setCurrentPage('my-complaints');
      else if (path === '/my-conversations') setCurrentPage('my-conversations');
      else if (path === '/handler-dashboard' || path.startsWith('/handler')) setCurrentPage('handler-dashboard');
      else if (path === '/admin-dashboard') setCurrentPage('admin-dashboard');
      else if (path === '/admin') setCurrentPage('super-admin-dashboard');
      else if (path === '/super-admin-dashboard') setCurrentPage('super-admin-dashboard');
      else setCurrentPage('home');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = useCallback((page, value) => {
    let targetPath = '/';
    if (page === 'product' && value) {
      targetPath = `/products/${encodeURIComponent(value)}`;
      setProductSlug(value);
    }
    if (page === 'checkout') targetPath = '/checkout';
    if (page === 'cart') {
      setIsCartOpen(true);
      return;
    }
    if (page === 'account') targetPath = `/account/${value || 'profile'}`;
    if (page === 'login') targetPath = '/login';
    if (page === 'register') targetPath = '/register';
    if (page === 'my-complaints') targetPath = '/my-complaints';
    if (page === 'my-conversations') targetPath = '/my-conversations';
    if (page === 'handler-dashboard') targetPath = value || (window.location.pathname.startsWith('/handler/') ? window.location.pathname : '/handler/dashboard');
    if (page === 'admin-dashboard') targetPath = '/admin-dashboard';
    if (page === 'super-admin-dashboard') targetPath = '/super-admin-dashboard';

    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setRoutePath(targetPath);
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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

  if (authorizedPage === 'my-conversations') {
    return <MyConversations onNavigate={navigateTo} />;
  }

  if (authorizedPage === 'handler-dashboard') {
    return <HandlerDashboardPage routePath={routePath} onNavigate={navigateTo} />;
  }

  if (authorizedPage === 'admin-dashboard') {
    return <AdminDashboardPage onNavigate={navigateTo} />;
  }

  if (authorizedPage === 'super-admin-dashboard') {
    return <SuperAdminDashboardPage onNavigate={navigateTo} />;
  }

  if (authorizedPage === 'product') {
    return <ProductDetails slug={productSlug} onNavigate={navigateTo} />;
  }

  if (authorizedPage === 'checkout') {
    return <Checkout onNavigate={navigateTo} />;
  }

  if (authorizedPage === 'account') {
    const section = routePath.split('/')[2] || 'profile';
    return <MyAccount section={section} onNavigate={navigateTo} />;
  }

  return <Home onNavigate={navigateTo} />;
}

export function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <AddressProvider>
          <AppContent />
        </AddressProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
