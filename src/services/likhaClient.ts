import {
  createLikha,
  authentication,
  rest,
  realtime,
  type AuthenticationData,
} from '@likha-erp/likha-sdk';
import { LocalStorage } from 'quasar';

const LIKHA_URL = 'https://api.dinkmatch.club';

// Custom Storage adapter for Likha SDK utilizing Quasar's LocalStorage.
// Token mode (not cookies) so auth works on iOS Safari, which blocks
// cross-site cookies between the frontend and the Directus backend domain.
class QuasarStorage {
  get(): AuthenticationData | null {
    const data = LocalStorage.getItem('likha-data');
    return data ? (data as AuthenticationData) : null;
  }
  set(data: AuthenticationData | null) {
    if (data === null) {
      LocalStorage.remove('likha-data');
    } else {
      LocalStorage.set('likha-data', data);
    }
  }
}

const storage = new QuasarStorage();

const _client = createLikha(LIKHA_URL)
  .with(
    authentication('json', {
      storage,
      credentials: 'include',
      autoRefresh: true,
      msRefreshBeforeExpires: 5 * 60 * 1000,
    }),
  )
  .with(rest())
  .with(
    realtime({
      authMode: 'handshake',
      reconnect: { delay: 1000, retries: 10 },
    }),
  );

// Override refresh to use the correct mode based on how the user logged in.
// Password login (JSON mode) stores refresh_token in LocalStorage.
// Google SSO (cookie mode) does NOT — the refresh token is only in an
// httpOnly cookie. If we use JSON mode for SSO users, it sends null → 400.
const _originalRefresh = _client.refresh.bind(_client);
_client.refresh = (async (options?: Record<string, unknown>) => {
  const authData = storage.get();
  const hasRefreshToken = !!authData?.refresh_token;
  const mode = hasRefreshToken ? 'json' : 'cookie';
  return _originalRefresh({ mode, ...options });
}) as typeof _client.refresh;

// Global 401 interceptor: if a request fails with 401, refresh the token
// and retry once. This handles the race condition where the access token
// expired (e.g., phone screen was locked) but the refresh token is still
// valid. Without this, users see random error toasts on wake.
let _refreshing: Promise<unknown> | null = null;
const originalRequest = _client.request.bind(_client);
_client.request = async function (fn: never) {
  try {
    return await originalRequest(fn);
  } catch (err: unknown) {
    const error = err as { response?: { status?: number } };
    if (error?.response?.status !== 401) throw err;
    // Token expired — refresh and retry once
    if (!_refreshing) {
      _refreshing = _client.refresh().finally(() => {
        _refreshing = null;
      });
    }
    try {
      await _refreshing;
    } catch {
      throw err; // refresh failed — throw original 401
    }
    return await originalRequest(fn);
  }
} as typeof _client.request;

const likhaClient = _client;

export { likhaClient, LIKHA_URL };
