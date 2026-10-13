import React, { useEffect, useState } from 'react';
import { ShoppingCart, Eye, EyeOff, ArrowLeft, AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LOGIN_SLIDES } from '../data/loginSlides';

export function Login({ onNavigate }) {
  const { login } = useAuth();
  const [activeSlide, setActiveSlide] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isSliderPaused, setIsSliderPaused] = useState(false);
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(motionPreference.matches);
    updateMotionPreference();
    motionPreference.addEventListener?.('change', updateMotionPreference);
    return () => motionPreference.removeEventListener?.('change', updateMotionPreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || isSliderPaused) return undefined;
    const interval = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % LOGIN_SLIDES.length);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [isSliderPaused, prefersReducedMotion]);

  const moveSlide = (direction) => {
    setActiveSlide((current) => (current + direction + LOGIN_SLIDES.length) % LOGIN_SLIDES.length);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!emailOrPhone.trim()) {
      setError('Please enter your email or mobile number.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      const loggedUser = await login(emailOrPhone.trim(), password);
      if (onNavigate) {
        if (loggedUser?.role === 'super_admin') {
          onNavigate('super-admin-dashboard');
        } else if (loggedUser?.role === 'admin') {
          onNavigate('admin-dashboard');
        } else if (loggedUser?.role === 'department_handler') {
          onNavigate('handler-dashboard');
        } else {
          onNavigate('home');
        }
      }
    } catch (err) {
      setError(err.message || 'Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fk-auth-page-wrapper">
      {/* Shared Minimal Authentication Header */}
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

      {/* Main Login Screen: Balanced, centered composition */}
      <main className="fk-login-main-section">
        <div className="fk-login-card-container">
          {/* Left Column: High-Resolution Aesthetic Lifestyle Image */}
          <div
            className="fk-login-image-column"
            role="region"
            aria-roledescription="carousel"
            aria-label="Flatkart shopping highlights"
            onMouseEnter={() => setIsSliderPaused(true)}
            onMouseLeave={() => setIsSliderPaused(false)}
            onFocusCapture={() => setIsSliderPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setIsSliderPaused(false);
            }}
          >
            {LOGIN_SLIDES.map((slide, index) => (
              <img
                key={slide.src}
                src={slide.src}
                alt={index === activeSlide ? slide.alt : ''}
                aria-hidden={index !== activeSlide}
                className={`fk-login-lifestyle-img fk-login-slide${index === activeSlide ? ' is-active' : ''}`}
              />
            ))}
            <button type="button" className="fk-login-slide-arrow previous" onClick={() => moveSlide(-1)} aria-label="Show previous image">
              <ChevronLeft size={20} />
            </button>
            <button type="button" className="fk-login-slide-arrow next" onClick={() => moveSlide(1)} aria-label="Show next image">
              <ChevronRight size={20} />
            </button>
            <div className="fk-login-slide-dots" aria-label="Choose an image">
              {LOGIN_SLIDES.map((slide, index) => (
                <button
                  key={slide.src}
                  type="button"
                  className={`fk-login-slide-dot${index === activeSlide ? ' is-active' : ''}`}
                  onClick={() => setActiveSlide(index)}
                  aria-label={`Show image ${index + 1} of ${LOGIN_SLIDES.length}`}
                  aria-current={index === activeSlide ? 'true' : undefined}
                />
              ))}
            </div>
          </div>

          {/* Right Column: Balanced Form Box */}
          <div className="fk-login-form-column">
            <div className="fk-login-form-box">
              <h1 className="fk-login-title">Welcome back</h1>
              <p className="fk-login-subtitle">
                Log in to your Flatkart account<br />
                to continue shopping.
              </p>

              {error && (
                <div className="fk-auth-error-alert" role="alert">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="fk-auth-form" noValidate>
                <div className="fk-form-group">
                  <label htmlFor="login-email" className="fk-form-label">
                    Email or mobile number
                  </label>
                  <input
                    id="login-email"
                    type="text"
                    className="fk-form-input"
                    placeholder="Enter email or mobile number"
                    value={emailOrPhone}
                    onChange={(e) => setEmailOrPhone(e.target.value)}
                    disabled={isLoading}
                    autoComplete="username"
                    required
                  />
                </div>

                <div className="fk-form-group">
                  <label htmlFor="login-password" className="fk-form-label">
                    Password
                  </label>
                  <div className="fk-input-password-wrapper">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      className="fk-form-input"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      autoComplete="current-password"
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

                <div className="fk-forgot-password-row">
                  <button
                    type="button"
                    className="fk-forgot-password-link"
                    onClick={() => alert('Please contact support desk or reset password through your email.')}
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  className="fk-auth-submit-btn"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <Loader2 size={18} className="animate-spin" /> Logging in...
                    </span>
                  ) : (
                    'Log in'
                  )}
                </button>

                <div className="fk-auth-switch-text">
                  New to Flatkart?{' '}
                  <button
                    type="button"
                    className="fk-auth-switch-link"
                    onClick={() => onNavigate && onNavigate('register')}
                  >
                    Register
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Login;
