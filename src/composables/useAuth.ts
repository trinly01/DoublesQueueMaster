import { LocalStorage } from 'quasar';
import type { Router } from 'vue-router';
import { likhaClient } from 'src/services/likhaClient';
import { PlayerProfile } from 'src/services/playerProfile';
import { useNotify } from 'src/composables/useNotify';

// Shared authentication helpers for all authenticated pages.
// Provides a single source of truth for logging out and for handling
// expired/invalid sessions (401 responses) consistently across the app.
export function useAuth() {
  const { notify } = useNotify();

  // Clear all locally-persisted auth/session state.
  const clearLocalSession = () => {
    LocalStorage.remove('dink-auth');
    LocalStorage.remove('likha-data');
    LocalStorage.remove('current_user_id');
    PlayerProfile.clearProfile();
  };

  // Full logout: invalidate server session, clear local state, redirect.
  const logout = async (
    router: Router,
    opts: { message?: string; redirect?: string } = {},
  ) => {
    const { message = 'Logged out successfully', redirect = '/login' } = opts;
    try {
      await likhaClient.logout();
    } catch (error) {
      console.error('Logout API call error:', error);
    } finally {
      clearLocalSession();
      notify({ color: 'info', message });
      void router.push(redirect);
    }
  };

  // Inspect an error: if it's a 401, perform a full logout and return true.
  // Callers should `if (await handleAuthError(err, router)) return;`.
  const handleAuthError = async (
    err: unknown,
    router: Router,
  ): Promise<boolean> => {
    const error = err as { response?: { status?: number } };
    if (error?.response?.status === 401) {
      await logout(router, {
        message: 'Session expired. Please log in again.',
      });
      return true;
    }
    return false;
  };

  return { logout, handleAuthError, clearLocalSession };
}
