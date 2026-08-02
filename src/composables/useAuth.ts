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
    LocalStorage.remove('session_last_activity');
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

  // Inspect an error: if it's a 401, attempt a token refresh first.
  // Only if refresh also fails do we perform a full logout.
  // Callers should `if (await handleAuthError(err, router)) return;`.
  const handleAuthError = async (
    err: unknown,
    router: Router,
  ): Promise<boolean> => {
    const error = err as { response?: { status?: number } };
    if (error?.response?.status !== 401) return false;

    // Attempt a manual refresh before giving up.
    // This catches the case where autoRefresh's timer didn't fire in time
    // (e.g., phone was idle, JS throttled) but the refresh token is still valid.
    try {
      await likhaClient.refresh();
      // Refresh succeeded — the caller should retry their request.
      // Return false so the caller knows it wasn't a fatal auth error.
      // Note: the original request already failed, but subsequent requests will work.
      return false;
    } catch {
      // Refresh also failed — session is truly invalid. Logout.
      await logout(router, {
        message: 'Session expired. Please log in again.',
      });
      return true;
    }
  };

  return { logout, handleAuthError, clearLocalSession };
}
