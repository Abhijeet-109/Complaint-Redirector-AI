import React, { useState } from 'react';
import { X, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function AuthModal({ isOpen, onClose }) {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('user1@gmail.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isRegister) {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fk-modal-overlay" onClick={onClose}>
      <div className="fk-auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fk-auth-header">
          <h3 style={{ fontSize: '17px', fontWeight: '700' }}>
            {isRegister ? 'Join Flatkart' : 'Sign in to Flatkart'}
          </h3>
          <button style={{ color: '#FFFFFF', background: 'none', border: 'none', cursor: 'pointer' }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form className="fk-auth-body" onSubmit={handleSubmit}>
          {error && (
            <div style={{ padding: '8px 12px', background: '#FFEBEE', color: '#C62828', borderRadius: '6px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {isRegister && (
            <div className="fk-form-group">
              <label className="fk-form-label">Full Name</label>
              <input
                type="text"
                className="fk-form-input"
                placeholder="e.g. Arjun Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="fk-form-group">
            <label className="fk-form-label">Email Address</label>
            <input
              type="email"
              className="fk-form-input"
              placeholder="e.g. user1@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="fk-form-group">
            <label className="fk-form-label">Password</label>
            <input
              type="password"
              className="fk-form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="fk-auth-btn" disabled={submitting}>
            {submitting ? 'Authenticating...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>

          <div style={{ textAlign: 'center', fontSize: '13px', marginTop: '10px', color: 'var(--fk-text-muted)' }}>
            {isRegister ? (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  style={{ color: 'var(--fk-text-primary)', fontWeight: '700', textDecoration: 'underline' }}
                  onClick={() => setIsRegister(false)}
                >
                  Sign In
                </button>
              </span>
            ) : (
              <span>
                New to Flatkart?{' '}
                <button
                  type="button"
                  style={{ color: 'var(--fk-text-primary)', fontWeight: '700', textDecoration: 'underline' }}
                  onClick={() => setIsRegister(true)}
                >
                  Register here
                </button>
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
