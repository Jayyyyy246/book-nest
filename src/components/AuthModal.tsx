/* ==========================================================================
   BOOKNEST AUTHENTICATION MODAL
   Features:
   - Cinematic "Pull the Lamp to Reveal Login" interaction
   - Midnight reading room initial screen with lamp switched OFF
   - Pull-switch reveals illuminated login panel with smooth upward motion
   - Full keyboard accessibility, modal focus trapping, and Escape dismissal
   - Preserves all authentic JWT backend authentication, Google SSO, and demo users
   ========================================================================== */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { api, setStoredToken, getApiUrl } from '../api';
import { UserSession } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';
import { AnimatedLampLogin } from './AnimatedLampLogin';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserSession, token: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  // Lamp state: starts switched OFF per Phase 4 redesign requirements
  const [isLampOn, setIsLampOn] = useState(false);
  const [isFormRevealed, setIsFormRevealed] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const stringHandleRef = useRef<HTMLDivElement | null>(null);
  const accessibleToggleRef = useRef<HTMLButtonElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  // Reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, []);

  // Modal accessibility hook
  const { modalRef } = useModalA11y({
    isOpen,
    onClose,
    autoFocusSelector: isLampOn ? '#auth-email' : '.booknest-string-handle, .booknest-lamp-toggle-btn',
  });

  // Reset lamp and form state when modal closes or opens
  useEffect(() => {
    if (!isOpen) {
      setIsLampOn(false);
      setIsFormRevealed(false);
      setIsTransitioning(false);
      setShowPassword(false);
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    }
  }, [isOpen]);

  // Clean up any pending transition timers on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  // Coordinated Lamp Toggle with timed reveal and accessibility focus management
  const handleToggleLamp = useCallback((targetOn: boolean) => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    if (prefersReducedMotion) {
      setIsLampOn(targetOn);
      setIsFormRevealed(targetOn);
      setIsTransitioning(false);
      if (targetOn) {
        setTimeout(() => {
          emailInputRef.current?.focus();
        }, 30);
      } else {
        setTimeout(() => {
          stringHandleRef.current?.focus();
        }, 30);
      }
      return;
    }

    setIsTransitioning(true);

    if (targetOn) {
      // TURNING ON: Lamp turns on immediately, light beam expands, form rises into light
      setIsLampOn(true);

      // Start form reveal transition
      setTimeout(() => {
        setIsFormRevealed(true);
      }, 50);

      // Focus email input once the ~550ms reveal transition is complete (<700ms total)
      transitionTimerRef.current = window.setTimeout(() => {
        setIsTransitioning(false);
        emailInputRef.current?.focus();
      }, 620);
    } else {
      // TURNING OFF: Return focus immediately to string handle so keyboard focus is never lost
      stringHandleRef.current?.focus();
      setIsFormRevealed(false);

      // Fade out form first, then contract beam and darken scene
      transitionTimerRef.current = window.setTimeout(() => {
        setIsLampOn(false);
        setIsTransitioning(false);
      }, 260);
    }
  }, [prefersReducedMotion]);

  if (!isOpen) return null;

  const handleGoogleSignIn = () => {
    setError(null);
    setGoogleLoading(true);
    window.location.href = getApiUrl('/api/auth/google');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLampOn) return; // Prevent submission when lamp is OFF

    setError(null);
    setLoading(true);

    try {
      if (tab === 'login') {
        const res = await api.login(email, password);
        setStoredToken(res.token);
        onAuthSuccess(res.user, res.token);
        onClose();
      } else {
        const res = await api.register(name, email, password, phone);
        setStoredToken(res.token);
        onAuthSuccess(res.user, res.token);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (role: 'student' | 'admin') => {
    if (!isLampOn) return; // Prevent demo login when lamp is OFF

    setError(null);
    setLoading(true);
    try {
      const creds = role === 'admin' 
        ? { email: 'admin@booknest.com', pass: 'Admin@123' }
        : { email: 'user@booknest.com', pass: 'User@123' };

      const res = await api.login(creds.email, creds.pass);
      setStoredToken(res.token);
      onAuthSuccess(res.user, res.token);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 animate-in fade-in duration-150"
    >
      <div
        className={`relative w-full booknest-auth-dialog ${isLampOn ? 'lamp-on' : 'lamp-off'} animate-in zoom-in-95 duration-200`}
      >
        {/* Modal Close Button: Accessible in both lamp ON and OFF states */}
        <button
          onClick={onClose}
          aria-label="Close authentication modal"
          className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer shadow-sm border border-slate-700/60"
        >
          <i className="fa-solid fa-xmark text-sm" aria-hidden="true"></i>
        </button>

        {/* Central Reading Lamp Stage & Interactive Pull Switch */}
        <AnimatedLampLogin
          isOn={isLampOn}
          onToggleLamp={handleToggleLamp}
          stringHandleRef={stringHandleRef}
          accessibleToggleRef={accessibleToggleRef}
        />

        {/* Revealed Authentication Card: Hidden & Inert When Lamp is OFF */}
        <div
          className={`booknest-auth-card-side ${isFormRevealed ? 'revealed' : 'hidden-state'}`}
          aria-hidden={!isFormRevealed}
          inert={!isFormRevealed}
          style={{
            display: isFormRevealed || isTransitioning ? 'flex' : 'none',
            visibility: isFormRevealed ? 'visible' : 'hidden',
          }}
        >
          {/* Header */}
          <div className="text-center mb-4">
            <div className="booknest-auth-badge" aria-hidden="true">
              <i className="fa-solid fa-book-bookmark text-base"></i>
            </div>
            <h2 id="auth-modal-title" className="booknest-auth-title">
              {tab === 'login' ? 'Welcome Back to BookNest' : 'Create Campus Account'}
            </h2>
            <p className="booknest-auth-subtitle">
              {tab === 'login' ? 'Sign in to access your orders, saved wishlist, and cart' : 'Join scholars and professors across university departments'}
            </p>
          </div>

          {/* Continue with Google Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            tabIndex={isFormRevealed ? 0 : -1}
            className="booknest-auth-google-btn"
          >
            {googleLoading ? (
              <i className="fa-solid fa-circle-notch fa-spin text-amber-500 text-sm" aria-hidden="true"></i>
            ) : (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.28 21.43 7.33 24 12 24z" />
                <path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.13z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.28 2.57 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z" />
              </svg>
            )}
            <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
          </button>

          {/* Divider */}
          <div className="booknest-auth-divider">
            <div className="booknest-auth-divider-line" aria-hidden="true">
              <div></div>
            </div>
            <div className="booknest-auth-divider-pill">
              <span>Or continue with campus email</span>
            </div>
          </div>

          {/* Form Switcher Tabs */}
          <div className="booknest-auth-tab-bar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'login'}
              tabIndex={isFormRevealed ? 0 : -1}
              onClick={() => { setTab('login'); setError(null); }}
              className={`booknest-auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'register'}
              tabIndex={isFormRevealed ? 0 : -1}
              onClick={() => { setTab('register'); setError(null); }}
              className={`booknest-auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
            >
              Create Account
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div role="alert" className="booknest-auth-error-alert">
              <i className="fa-solid fa-circle-exclamation shrink-0" aria-hidden="true"></i>
              <span>{error}</span>
            </div>
          )}

          {/* Main Credentials Form */}
          <form onSubmit={handleSubmit} className="text-xs">
            {tab === 'register' && (
              <div className="booknest-auth-field">
                <label htmlFor="auth-name" className="booknest-auth-label">Full Name</label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  tabIndex={isFormRevealed ? 0 : -1}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Aditya Chauhan"
                  className="booknest-auth-input"
                />
              </div>
            )}

            <div className="booknest-auth-field">
              <label htmlFor="auth-email" className="booknest-auth-label">Campus Email</label>
              <input
                ref={emailInputRef}
                id="auth-email"
                type="email"
                required
                tabIndex={isFormRevealed ? 0 : -1}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. student@booknest.com"
                className="booknest-auth-input"
              />
            </div>

            <div className="booknest-auth-field">
              <label htmlFor="auth-password" className="booknest-auth-label">Password</label>
              <div className="booknest-auth-input-wrapper">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  tabIndex={isFormRevealed ? 0 : -1}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="booknest-auth-input"
                  style={{ paddingRight: '36px' }}
                />
                <button
                  type="button"
                  tabIndex={isFormRevealed ? 0 : -1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="booknest-auth-eye-btn"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i>
                </button>
              </div>
            </div>

            {tab === 'register' && (
              <div className="booknest-auth-field">
                <label htmlFor="auth-phone" className="booknest-auth-label">Phone Number (Optional)</label>
                <input
                  id="auth-phone"
                  type="tel"
                  tabIndex={isFormRevealed ? 0 : -1}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="booknest-auth-input"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isLampOn}
              tabIndex={isFormRevealed ? 0 : -1}
              className="booknest-auth-submit-btn"
            >
              {loading ? (
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
              ) : (
                <span>{tab === 'login' ? 'Sign In to Account' : 'Register & Start Reading'}</span>
              )}
            </button>
          </form>

          {/* Quick Demo Switcher with Real Credentials */}
          <div className="booknest-auth-demo-section">
            <div className="booknest-auth-demo-title">
              Instant Test Credentials
            </div>
            <div className="booknest-auth-demo-grid">
              <button
                type="button"
                data-testid="demo-student-btn"
                disabled={loading}
                tabIndex={isFormRevealed ? 0 : -1}
                onClick={() => handleDemoLogin('student')}
                className="booknest-auth-demo-student-btn"
                title="Log in as demo student (Aditya Chauhan)"
              >
                <i className="fa-solid fa-user-graduate" aria-hidden="true"></i>
                <span>Demo Student</span>
                <span className="text-[10px] opacity-75 font-normal hidden sm:inline">(Aditya)</span>
              </button>
              <button
                type="button"
                data-testid="demo-admin-btn"
                disabled={loading}
                tabIndex={isFormRevealed ? 0 : -1}
                onClick={() => handleDemoLogin('admin')}
                className="booknest-auth-demo-admin-btn"
                title="Log in as campus administrator"
              >
                <i className="fa-solid fa-shield-halved" aria-hidden="true"></i>
                <span>Demo Admin</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
