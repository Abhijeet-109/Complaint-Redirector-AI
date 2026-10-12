import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { MyComplaints } from './pages/MyComplaints';

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState(() => {
    const path = window.location.pathname.toLowerCase();
    if (path === '/login') return 'login';
    if (path === '/register') return 'register';
    if (path === '/my-complaints') return 'my-complaints';
    return 'home';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      if (path === '/login') setCurrentPage('login');
      else if (path === '/register') setCurrentPage('register');
      else if (path === '/my-complaints') setCurrentPage('my-complaints');
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

    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // If user tries to access /my-complaints while unauthenticated, redirect to login
  useEffect(() => {
    if (!loading && currentPage === 'my-complaints' && !isAuthenticated) {
      navigateTo('login');
    }
  }, [loading, currentPage, isAuthenticated]);

  if (currentPage === 'login') {
    return <Login onNavigate={navigateTo} />;
  }

  if (currentPage === 'register') {
    return <Register onNavigate={navigateTo} />;
  }

  if (currentPage === 'my-complaints') {
    return <MyComplaints onNavigate={navigateTo} />;
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
