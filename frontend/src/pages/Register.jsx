import React, { useState } from 'react';
import { ShoppingCart, ArrowLeft, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Register({ onNavigate }) {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please check and try again.');
      return;
    }

    setIsLoading(true);
    try {
      await register(fullName.trim(), email.trim(), password);
      if (onNavigate) {
        onNavigate('home');
      }
    } catch (err) {
      setError(err.message || 'Registration failed. This email may already be registered.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fk-auth-page-wrapper">
      {/* Shared Minimal Authentication Header (Consistent with Login page) */}
      <header className="fk-auth-top-bar">
        <button
          className="fk-auth-back-btn"
          onClick={() => onNavigate && onNavigate('home')}
          aria-label="Back to store"
        >
          <ArrowLeft size={18} />
          <span>Back to Flatkart</span>
        </button>

        <div
          className="fk-auth-brand"
          onClick={() => onNavigate && onNavigate('home')}
          role="button"
          tabIndex={0}
          aria-label="Flatkart Home"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <ShoppingCart size={20} color="var(--fk-header)" />
          <span style={{ fontWeight: '800', letterSpacing: '0.05em', color: 'var(--fk-header)' }}>
            FLATKART
          </span>
        </div>
      </header>

      {/* Main Register Section */}
      <main className="fk-register-main-section">
        <div className="fk-register-card-container">
          {/* Left Dark Evergreen Card */}
          <div className="fk-register-left-card">
            <div className="fk-register-left-content">
              <h1 className="fk-register-left-title">
                Create your<br />Flatkart account
              </h1>
              <p className="fk-register-left-subtitle">
                Sign up for a faster checkout<br />
                and a more personalized experience
              </p>

              <div className="fk-register-benefits-list">
                <div className="fk-register-benefit-item">
                  <span className="fk-benefit-bullet">&bull;</span>
                  <span>Track orders and manage returns</span>
                </div>
                <div className="fk-register-benefit-item">
                  <span className="fk-benefit-bullet">&bull;</span>
                  <span>Save addresses for quick checkout</span>
                </div>
                <div className="fk-register-benefit-item">
                  <span className="fk-benefit-bullet">&bull;</span>
                  <span>Get recommendations you'll love</span>
                </div>
              </div>
            </div>

            {/* Bottom High-Resolution Lifestyle Imagery */}
            <div className="fk-register-left-image-wrapper">
              <img
                src="/assets/auth_register_bg.jpg"
                alt="Flatkart sustainable lifestyle"
                className="fk-register-lifestyle-img"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  display: 'block',
                }}
              />
            </div>
          </div>

          {/* Right White Form Card */}
          <div className="fk-register-right-card">
            <h2 className="fk-register-form-title">Create account</h2>
            <p className="fk-register-form-subtitle">
              Join Flatkart to enjoy a better shopping experience.
            </p>

            {error && (
              <div className="fk-auth-error-alert" role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="fk-auth-form" noValidate>
              <div className="fk-form-group">
                <label htmlFor="reg-name" className="fk-form-label">
                  Full name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  className="fk-form-input"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isLoading}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="fk-form-group">
                <label htmlFor="reg-email" className="fk-form-label">
                  Email address
                </label>
                <input
                  id="reg-email"
                  type="email"
                  className="fk-form-input"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="fk-form-group">
                <label htmlFor="reg-password" className="fk-form-label">
                  Password
                </label>
                <div className="fk-input-password-wrapper">
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    className="fk-form-input"
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="fk-password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="fk-form-group">
                <label htmlFor="reg-confirm-password" className="fk-form-label">
                  Confirm password
                </label>
                <div className="fk-input-password-wrapper">
                  <input
                    id="reg-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="fk-form-input"
                    placeholder="Re enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="fk-password-toggle-btn"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="fk-register-submit-btn"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Loader2 size={18} className="animate-spin" /> Creating account...
                  </span>
                ) : (
                  'Create account'
                )}
              </button>

              <div className="fk-auth-switch-text" style={{ marginTop: '18px' }}>
                Already have an account?{' '}
                <button
                  type="button"
                  className="fk-auth-switch-link"
                  onClick={() => onNavigate && onNavigate('login')}
                >
                  Log in
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Register;
