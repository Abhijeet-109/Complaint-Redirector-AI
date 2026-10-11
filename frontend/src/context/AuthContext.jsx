import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Clean up any legacy dummy/demo user state from localStorage
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('flatkart_user');
    const token = authService.getToken();
    if (saved && token) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.isDemo || parsed?.email === 'arjun@flatkart.com') {
          localStorage.removeItem('flatkart_user');
          return null;
        }
        return parsed;
      } catch {
        localStorage.removeItem('flatkart_user');
        return null;
      }
    }
    // Clean up if there's no token or demo data
    if (saved) {
      localStorage.removeItem('flatkart_user');
    }
    return null;
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = authService.getToken();
    if (token) {
      authService.getMe()
        .then((userData) => {
          if (userData && !userData.isDemo && userData.email !== 'arjun@flatkart.com') {
            setUser(userData);
            localStorage.setItem('flatkart_user', JSON.stringify(userData));
          } else {
            authService.logout();
            setUser(null);
          }
        })
        .catch(() => {
          // Token expired or invalid
          authService.logout();
          setUser(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      // Ensure no leftover user object without token
      setUser(null);
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    await authService.login(email, password);
    const me = await authService.getMe();
    setUser(me);
    localStorage.setItem('flatkart_user', JSON.stringify(me));
    return me;
  };

  const register = async (name, email, password) => {
    await authService.register(name, email, password);
    return await login(email, password);
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        login,
        register,
        logout,
        loading,
        isAuthenticated: !!user && !!authService.getToken(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
