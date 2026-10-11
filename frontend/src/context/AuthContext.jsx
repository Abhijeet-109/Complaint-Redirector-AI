import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Default to Arjun as shown in reference screenshot
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('flatkart_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return { name: 'Arjun', email: 'arjun@flatkart.com', role: 'user', isDemo: true };
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = authService.getToken();
    if (token) {
      authService.getMe()
        .then((userData) => {
          setUser(userData);
          localStorage.setItem('flatkart_user', JSON.stringify(userData));
        })
        .catch(() => {
          // Token expired or invalid
          authService.logout();
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
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
    return login(email, password);
  };

  const logout = () => {
    authService.logout();
    setUser({ name: 'Arjun', email: 'arjun@flatkart.com', role: 'user', isDemo: true });
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, isAuthenticated: !!authService.getToken() }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
