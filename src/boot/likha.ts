import { boot } from 'quasar/wrappers';
import { LocalStorage } from 'quasar';
import { likhaClient } from 'src/services/likhaClient';

export default boot(async ({ app }) => {
  app.config.globalProperties.$likha = likhaClient;

  // Proactively refresh the token on app startup. The SDK's autoRefresh only
  // runs while the app is open — on page reload, the access token may have
  // expired (15min TTL) but the refresh token is still valid (7d). Without
  // this, the first API call gets 401, and if the 401 interceptor's refresh
  // also fails (e.g., transient network), the user gets logged out.
  //
  // Only refresh when the access token is actually expired or near expiry.
  // Directus refresh tokens are single-use (rotated on every refresh), so
  // refreshing unnecessarily on every reload widens the window for a
  // concurrent-refresh race (e.g., second tab, PWA reopen) that invalidates
  // the session and randomly logs users out.
  if (LocalStorage.has('dink-auth')) {
    const authData = LocalStorage.getItem('likha-data') as {
      expires_at?: number;
    } | null;
    const needsRefresh =
      !authData?.expires_at || authData.expires_at < Date.now() + 60_000;
    if (needsRefresh) {
      try {
        await likhaClient.refresh();
      } catch {
        // Refresh failed — the 401 interceptor will handle it on the next
        // API call. Don't force logout here; the session may still be valid.
        console.warn('[Boot] Proactive token refresh failed');
      }
    }
  }
});
