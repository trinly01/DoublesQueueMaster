import { LocalStorage } from 'quasar';
import type { Router } from 'vue-router';
import { likhaClient, clearAuthSession } from 'src/services/likhaClient';
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

// ---------------------------------------------------------------------------
// Pre-logout flush hooks (RESET_DECISION #16)
// ---------------------------------------------------------------------------
//
// logout() wipes credentials BEFORE router.push unmounts the club page, so
// any sync flush that only fires on unmount/pagehide runs with dead tokens →
// 401 → the pending push (e.g. a just-issued reset) is lost. Composables
// holding pending async work register a hook here; logout() drains the hooks
// while the access token is still valid — i.e. BEFORE likhaClient.logout()
// (the SDK logout itself clears stored credentials) and before
// clearLocalSession().
//
// Registration is module-level so useCloudSync can register performCloudSync
// without a useAuth() instance; the returned unregister keeps it cleanup-safe.
export type BeforeLogoutHook = () => void | Promise<void>;

const beforeLogoutHooks = new Set<BeforeLogoutHook>();

/**
 * Register a hook run before credentials are cleared on logout.
 * Returns an unregister function (call on composable teardown).
 */
export function registerBeforeLogoutHook(
  hook: BeforeLogoutHook,
): () => void {
  beforeLogoutHooks.add(hook);
  return () => {
    beforeLogoutHooks.delete(hook);
  };
}

// Upper bound on the pre-logout flush so a hung network call can't trap the
// user on the logout path. performCloudSync does up to ~3 sequential requests
// (read → verify → PATCH); 5s covers slow mobile links while still feeling
// bounded. A timed-out hook keeps running in the background — its requests
// may 401 after the wipe, which the sync layer already tolerates.
const BEFORE_LOGOUT_FLUSH_TIMEOUT_MS = 5000;

const flushBeforeLogout = async (): Promise<void> => {
  if (beforeLogoutHooks.size === 0) return;
  const run = (async () => {
    // Sequential: hooks may share the same in-flight sync mutex, and order is
    // deterministic for tests.
    for (const hook of [...beforeLogoutHooks]) {
      try {
        await hook();
      } catch (err) {
        console.warn('[useAuth] pre-logout hook failed:', err);
      }
    }
  })();
  await Promise.race([
    run,
    new Promise<void>((resolve) =>
      setTimeout(resolve, BEFORE_LOGOUT_FLUSH_TIMEOUT_MS),
    ),
  ]);
};

export function useAuth() {
  const { notify } = useNotify();

  // Clear all locally-persisted auth/session state.
  const clearLocalSession = () => {
    clearAuthSession();
    LocalStorage.remove('recent_clubs_cache');
    PlayerProfile.clearProfile();
  };

  // Full logout: flush pending work, invalidate server session, clear local
  // state, redirect.
  const logout = async (
    router: Router,
    opts: { message?: string; redirect?: string } = {},
  ) => {
    if (_isLoggingOut) return;
    _isLoggingOut = true;
    const { message = 'Logged out successfully', redirect = '/login' } = opts;
    try {
      // 1. Drain pending sync/hooks FIRST — the flush needs the still-valid
      //    access token. likhaClient.logout() clears stored credentials, so
      //    anything flushed after it (or after clearLocalSession, or on
      //    page unmount post-navigation) would 401 and drop the push.
      await flushBeforeLogout();
      // 2. Server-side logout (best-effort — local teardown continues anyway).
      try {
        await likhaClient.logout();
      } catch (error) {
        console.error('Logout API call error:', error);
      }
    } finally {
      // 3. Local teardown — clearAuthSession also wipes club_meta_* and
      //    per-club matchmaking caches so the next user on this browser
      //    can't inherit stale roles/session state.
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

  return {
    logout,
    handleAuthError,
    clearLocalSession,
    registerBeforeLogoutHook,
  };
}
