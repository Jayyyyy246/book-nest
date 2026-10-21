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
import { api, setStoredToken } from '../api';
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
    window.location.href = '/api/auth/google';
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
          className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer shadow-sm border border-slate-700/60"
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
          <div className="text-center mb-5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center mx-auto mb-2.5 text-lg font-bold shadow-md shadow-amber-500/20">
              <i className="fa-solid fa-book-bookmark" aria-hidden="true"></i>
            </div>
            <h2 id="auth-modal-title" className="font-serif font-black text-2xl text-slate-950">
              {tab === 'login' ? 'Welcome Back to BookNest' : 'Create Campus Account'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {tab === 'login' ? 'Sign in to access your orders, saved wishlist, and cart' : 'Join scholars and professors across university departments'}
            </p>
          </div>

          {/* Continue with Google Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            tabIndex={isFormRevealed ? 0 : -1}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs font-semibold shadow-2xs hover:shadow-xs transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
          >
            {googleLoading ? (
              <i className="fa-solid fa-circle-notch fa-spin text-amber-500 text-sm" aria-hidden="true"></i>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.28 21.43 7.33 24 12 24z" />
                <path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.13z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.28 2.57 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z" />
              </svg>
            )}
            <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
          </button>

          {/* Divider */}
          <div className="relative my-3.5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
              <span className="bg-white px-2 text-slate-400 font-semibold">Or continue with campus email</span>
            </div>
          </div>

          {/* Form Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl mb-3.5 text-xs font-semibold">
            <button
              type="button"
              tabIndex={isFormRevealed ? 0 : -1}
              onClick={() => { setTab('login'); setError(null); }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${tab === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Sign In
            </button>
            <button
              type="button"
              tabIndex={isFormRevealed ? 0 : -1}
              onClick={() => { setTab('register'); setError(null); }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${tab === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Create Account
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div role="alert" className="mb-3.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation text-rose-600 shrink-0" aria-hidden="true"></i>
              <span>{error}</span>
            </div>
          )}

          {/* Main Credentials Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {tab === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-slate-700 font-semibold mb-1">Full Name</label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  tabIndex={isFormRevealed ? 0 : -1}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Aditya Chauhan"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-slate-700 font-semibold mb-1">Campus Email</label>
              <input
                ref={emailInputRef}
                id="auth-email"
                type="email"
                required
                tabIndex={isFormRevealed ? 0 : -1}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. student@booknest.com"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-slate-700 font-semibold mb-1">Password</label>
              <input
                id="auth-password"
                type="password"
                required
                tabIndex={isFormRevealed ? 0 : -1}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {tab === 'register' && (
              <div>
                <label htmlFor="auth-phone" className="block text-slate-700 font-semibold mb-1">Phone Number (Optional)</label>
                <input
                  id="auth-phone"
                  type="tel"
                  tabIndex={isFormRevealed ? 0 : -1}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isLampOn}
              tabIndex={isFormRevealed ? 0 : -1}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-amber-600 text-amber-50 hover:text-slate-950 font-bold shadow-md transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
              ) : (
                <span>{tab === 'login' ? 'Sign In to Account' : 'Register & Start Reading'}</span>
              )}
            </button>
          </form>

          {/* Quick Demo Switcher with Real Credentials */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center mb-2">
              Instant Test Credentials
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                tabIndex={isFormRevealed ? 0 : -1}
                onClick={() => handleDemoLogin('student')}
                className="px-2.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Log in as demo student (Aditya Chauhan)"
              >
                <i className="fa-solid fa-user-graduate text-amber-600" aria-hidden="true"></i>
                <span>Demo Student</span>
                <span className="text-[10px] text-amber-700/80 font-normal hidden sm:inline">(Aditya)</span>
              </button>
              <button
                type="button"
                tabIndex={isFormRevealed ? 0 : -1}
                onClick={() => handleDemoLogin('admin')}
                className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Log in as campus administrator"
              >
                <i className="fa-solid fa-shield-halved text-emerald-600" aria-hidden="true"></i>
                <span>Demo Admin</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
