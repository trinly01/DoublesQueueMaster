import { LocalStorage } from 'quasar';
import type { Router } from 'vue-router';
import { likhaClient } from 'src/services/likhaClient';
import { PlayerProfile } from 'src/services/playerProfile';
import { useNotify } from 'src/composables/useNotify';

// Shared authentication helpers for all authenticated pages.
// Provides a single source of truth for logging out and for handling
// expired/invalid sessions (401 responses) consistently across the app.

// Module-level guard: when several parallel API calls fail with 401 at the
// same time, each caller invokes handleAuthError → logout. Without this
// guard the user would see multiple "Session expired" toasts and duplicate
// redirects/server logout calls.
let _isLoggingOut = false;

export function useAuth() {
  const { notify } = useNotify();

  // Clear all locally-persisted auth/session state.
  const clearLocalSession = () => {
    LocalStorage.remove('dink-auth');
    LocalStorage.remove('likha-data');
    LocalStorage.remove('current_user_id');
    LocalStorage.remove('recent_clubs_cache');
    PlayerProfile.clearProfile();
  };

  // Full logout: invalidate server session, clear local state, redirect.
  const logout = async (
    router: Router,
    opts: { message?: string; redirect?: string } = {},
  ) => {
    if (_isLoggingOut) return;
    _isLoggingOut = true;
    const { message = 'Logged out successfully', redirect = '/login' } = opts;
    try {
      await likhaClient.logout();
    } catch (error) {
      console.error('Logout API call error:', error);
    } finally {
      clearLocalSession();
      notify({ color: 'info', message });
      void router.push(redirect);
      _isLoggingOut = false;
    }
  };

  // Inspect an error: if it's a 401, the session is truly invalid.
  // The 401 interceptor in likhaClient.ts already attempted a refresh and failed,
  // so the refresh token is expired — no need to try again here.
  // Callers should `if (await handleAuthError(err, router)) return;`.
  const handleAuthError = async (
    err: unknown,
    router: Router,
  ): Promise<boolean> => {
    const error = err as { response?: { status?: number } };
    if (error?.response?.status !== 401) return false;

    // Refresh token is expired — session is truly invalid. Logout.
    await logout(router, {
      message: 'Session expired. Please log in again.',
    });
    return true;
  };

  return { logout, handleAuthError, clearLocalSession };
}
