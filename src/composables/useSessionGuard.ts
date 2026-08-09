import { LocalStorage } from 'quasar';
import type { Router } from 'vue-router';
import { likhaClient } from 'src/services/likhaClient';
import { PlayerProfile } from 'src/services/playerProfile';
import { useNotify } from 'src/composables/useNotify';

const SESSION_KEY = 'dink-auth';

let visibilityHandler: (() => void) | null = null;
let pageShowHandler: (() => void) | null = null;

const clearLocalSession = () => {
  LocalStorage.remove(SESSION_KEY);
  LocalStorage.remove('likha-data');
  LocalStorage.remove('current_user_id');
  PlayerProfile.clearProfile();
};

export function useSessionGuard() {
  const { notify } = useNotify();

  const forceLogout = async (router: Router, reason: string) => {
    try {
      await likhaClient.logout();
    } catch {
      // ignore
    }
    clearLocalSession();
    stopSessionGuard();
    notify({ color: 'info', message: reason });
    void router.push('/login');
  };

  // Proactively refresh the token when the phone wakes up or tab regains focus.
  // Only refresh if the session might be stale (page was hidden).
  // If refresh fails, DON'T force logout — let the SDK's 401 handler deal with it
  // on the next API call. This avoids false logouts from transient refresh failures.
  let isRefreshing = false;
  let wasHidden = false;
  const refreshOnWake = async (): Promise<boolean> => {
    if (!LocalStorage.has(SESSION_KEY)) return false;

    // Only attempt refresh if the page was actually hidden (screen lock, tab switch)
    // Don't refresh on every visibility change (scroll, address bar, etc.)
    if (!wasHidden) return false;
    wasHidden = false;

    // Prevent concurrent refresh attempts
    if (isRefreshing) return false;
    isRefreshing = true;

    try {
      await likhaClient.refresh();
    } catch {
      // Refresh failed — but DON'T force logout. The SDK's reactive 401 handler
      // will attempt refresh on the next API call. If that also fails, handleAuthError
      // will log out. This avoids false logouts from transient network errors.
      console.warn(
        '[SessionGuard] Proactive refresh failed, will retry on next API call',
      );
    } finally {
      isRefreshing = false;
    }

    return false;
  };

  const startSessionGuard = () => {
    if (!LocalStorage.has(SESSION_KEY)) return;

    // Refresh on visibility change (phone screen unlock / tab switch back)
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
    }
    visibilityHandler = () => {
      if (document.hidden) {
        wasHidden = true;
        likhaClient.stopRefreshing();
      } else if (wasHidden) {
        void refreshOnWake();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    // Refresh on page show (BFCache restore / phone wake)
    if (pageShowHandler) {
      window.removeEventListener('pageshow', pageShowHandler);
    }
    pageShowHandler = () => {
      void refreshOnWake();
    };
    window.addEventListener('pageshow', pageShowHandler);
  };

  const stopSessionGuard = () => {
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    if (pageShowHandler) {
      window.removeEventListener('pageshow', pageShowHandler);
      pageShowHandler = null;
    }
  };

  return { startSessionGuard, stopSessionGuard, forceLogout };
}
