import { LocalStorage } from 'quasar';
import type { Router } from 'vue-router';
import { likhaClient } from 'src/services/likhaClient';
import { PlayerProfile } from 'src/services/playerProfile';
import { useNotify } from 'src/composables/useNotify';

const SESSION_KEY = 'dink-auth';
const LAST_ACTIVITY_KEY = 'session_last_activity';
const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours of inactivity

let intervalId: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let pageShowHandler: (() => void) | null = null;
let activityHandler: (() => void) | null = null;

const clearLocalSession = () => {
  LocalStorage.remove(SESSION_KEY);
  LocalStorage.remove('likha-data');
  LocalStorage.remove('current_user_id');
  LocalStorage.remove(LAST_ACTIVITY_KEY);
  PlayerProfile.clearProfile();
};

const touchActivity = () => {
  LocalStorage.set(LAST_ACTIVITY_KEY, Date.now());
};

const isSessionExpired = (): boolean => {
  const lastActivity = LocalStorage.getItem(LAST_ACTIVITY_KEY) as number | null;
  if (!lastActivity) return false;
  return Date.now() - lastActivity > IDLE_TIMEOUT_MS;
};

export function startSession() {
  touchActivity();
}

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

  const checkSession = async (router: Router): Promise<boolean> => {
    if (!LocalStorage.has(SESSION_KEY)) return false;
    if (isSessionExpired()) {
      await forceLogout(
        router,
        "You've been inactive for 4 hours. Please log in again.",
      );
      return true;
    }
    return false;
  };

  // Proactively refresh the token when the phone wakes up or tab regains focus.
  // If refresh succeeds, reset the idle timer so the user stays logged in.
  // If refresh fails, the session is invalid — force logout.
  const refreshOnWake = async (router: Router): Promise<boolean> => {
    if (!LocalStorage.has(SESSION_KEY)) return false;

    // If idle timeout already exceeded, don't bother refreshing — just logout
    if (isSessionExpired()) {
      await forceLogout(
        router,
        "You've been inactive for 4 hours. Please log in again.",
      );
      return true;
    }

    try {
      await likhaClient.refresh();
      // Refresh succeeded — token is valid, reset idle timer
      touchActivity();
      return false;
    } catch {
      // Refresh failed — refresh token expired or invalid
      await forceLogout(router, 'Session expired. Please log in again.');
      return true;
    }
  };

  const startSessionGuard = (router: Router) => {
    if (!LocalStorage.has(SESSION_KEY)) return;

    // If no activity timestamp (existing session from before this feature), start now
    if (!LocalStorage.getItem(LAST_ACTIVITY_KEY)) {
      touchActivity();
    }

    // Track user activity to extend the session (like Facebook)
    // Throttle to avoid excessive LocalStorage writes
    let lastTouch = 0;
    if (activityHandler) {
      document.removeEventListener('pointerdown', activityHandler);
      document.removeEventListener('keydown', activityHandler);
      document.removeEventListener('touchstart', activityHandler);
    }
    activityHandler = () => {
      const now = Date.now();
      if (now - lastTouch > 10 * 1000) {
        // At most once every 10 seconds
        lastTouch = now;
        touchActivity();
      }
    };
    document.addEventListener('pointerdown', activityHandler, {
      passive: true,
    });
    document.addEventListener('keydown', activityHandler, { passive: true });
    document.addEventListener('touchstart', activityHandler, { passive: true });

    // Check every minute
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      void checkSession(router);
    }, 60 * 1000);

    // Check on visibility change (phone screen unlock / tab switch back)
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
    }
    visibilityHandler = () => {
      if (!document.hidden) {
        // User came back — proactively refresh token and check idle timeout
        void refreshOnWake(router);
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    // Check on page show (BFCache restore / phone wake)
    if (pageShowHandler) {
      window.removeEventListener('pageshow', pageShowHandler);
    }
    pageShowHandler = () => {
      void refreshOnWake(router);
    };
    window.addEventListener('pageshow', pageShowHandler);
  };

  const stopSessionGuard = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    if (pageShowHandler) {
      window.removeEventListener('pageshow', pageShowHandler);
      pageShowHandler = null;
    }
    if (activityHandler) {
      document.removeEventListener('pointerdown', activityHandler);
      document.removeEventListener('keydown', activityHandler);
      document.removeEventListener('touchstart', activityHandler);
      activityHandler = null;
    }
  };

  return { startSessionGuard, stopSessionGuard, checkSession, forceLogout };
}
