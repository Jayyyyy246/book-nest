import { useState, useEffect, useCallback } from 'react';
import { UserSession } from '../types';
import { api, getStoredToken, setStoredToken } from '../services/api';

interface UseAuthOptions {
  onAuthSuccessExtra?: (user: UserSession) => Promise<void> | void;
  onLogoutExtra?: () => void;
  showToast?: (message: string, type: 'success' | 'info' | 'error') => void;
}

export function useAuth({ onAuthSuccessExtra, onLogoutExtra, showToast }: UseAuthOptions = {}) {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Restore session from token or handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthToken = urlParams.get('token');
    const authError = urlParams.get('auth_error');

    if (oauthToken) {
      setStoredToken(oauthToken);
      api.getMe()
        .then(res => {
          setCurrentUser(res.user);
          showToast?.(`Welcome back, ${res.user.name}! Signed in with Google.`, 'success');
          if (onAuthSuccessExtra) onAuthSuccessExtra(res.user);
        })
        .catch(() => {
          setStoredToken(null);
          setCurrentUser(null);
          showToast?.('Failed to verify Google session.', 'error');
        })
        .finally(() => {
          setAuthLoading(false);
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    } else if (authError) {
      const errorMsg = authError === 'google_oauth_unconfigured'
        ? 'Google OAuth credentials are not configured in backend .env. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
        : `Google sign-in error: ${authError.replace(/_/g, ' ')}`;
      showToast?.(errorMsg, 'error');
      setAuthLoading(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const token = getStoredToken();
      if (token) {
        api.getMe()
          .then(res => {
            setCurrentUser(res.user);
            if (onAuthSuccessExtra) onAuthSuccessExtra(res.user);
          })
          .catch(() => {
            setStoredToken(null);
            setCurrentUser(null);
          })
          .finally(() => setAuthLoading(false));
      } else {
        setAuthLoading(false);
      }
    }
  }, []);

  const handleAuthSuccess = useCallback(async (user: UserSession, token: string) => {
    setStoredToken(token);
    setCurrentUser(user);
    showToast?.(`Welcome back, ${user.name}!`, 'success');
    if (onAuthSuccessExtra) {
      await onAuthSuccessExtra(user);
    }
  }, [onAuthSuccessExtra, showToast]);

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    setStoredToken(null);
    setCurrentUser(null);
    showToast?.('Signed out of campus account', 'info');
    if (onLogoutExtra) {
      onLogoutExtra();
    }
  }, [onLogoutExtra, showToast]);

  return {
    currentUser,
    setCurrentUser,
    authLoading,
    handleAuthSuccess,
    handleLogout,
  };
}
