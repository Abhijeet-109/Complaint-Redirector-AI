import { apiRequest } from './api';

export const authService = {
  async login(email, password) {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.access_token) {
      localStorage.setItem('flatkart_token', data.access_token);
    }
    return data;
  },

  async register(name, email, password) {
    return await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  },

  async getMe() {
    try {
      return await apiRequest('/api/auth/me', {
        method: 'GET',
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        return await apiRequest('/api/v1/test/me', {
          method: 'GET',
        });
      }
      throw error;
    }
  },

  logout() {
    localStorage.removeItem('flatkart_token');
    localStorage.removeItem('flatkart_user');
  },

  getToken() {
    return localStorage.getItem('flatkart_token');
  },
};
