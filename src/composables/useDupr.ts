import { reactive } from 'vue';
import { LocalStorage } from 'quasar';
import { likhaClient } from 'src/services/likhaClient';
import { readItems, readSingleton } from '@likha-erp/likha-sdk';

export interface DuprConnection {
  id: string;
  dupr_id: string;
  environment: string;
  status: string;
  singles_rating: number | null;
  doubles_rating: number | null;
  rating_updated_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
}

export interface DuprSubmissionStatus {
  id: string;
  match_key: string;
  club: string;
  status: string;
  dupr_match_code: string | null;
  submitted_at: string | null;
  environment: string;
}

interface DuprSettings {
  id: string;
  api_base_url: string;
  environment: string;
  submit_flow_url: string | null;
  rating_flow_url: string | null;
  connect_flow_url: string | null;
  client_key: string;
  user_api_base_url?: string;
}

interface DuprState {
  connection: DuprConnection | null;
  settings: DuprSettings | null;
  submissions: DuprSubmissionStatus[];
  loading: boolean;
  connecting: boolean;
  submitting: boolean;
  error: string;
}

const DUPR_CACHE_KEY = 'dupr_connection_cache';
const SUBMISSIONS_CACHE_KEY = 'dupr_submissions_cache';

class DuprService {
  public state: DuprState;
  private ssoIframe: HTMLIFrameElement | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor() {
    const cachedConnection = LocalStorage.getItem(
      DUPR_CACHE_KEY,
    ) as DuprConnection | null;
    const cachedSubmissions = LocalStorage.getItem(
      SUBMISSIONS_CACHE_KEY,
    ) as DuprSubmissionStatus[];

    this.state = reactive({
      connection: cachedConnection,
      settings: null,
      submissions: cachedSubmissions || [],
      loading: false,
      connecting: false,
      submitting: false,
      error: '',
    }) as DuprState;
  }

  /**
   * Get auth headers from the Likha SDK storage for flow webhook calls.
   */
  private getAuthHeaders(): Record<string, string> {
    try {
      const data = LocalStorage.getItem('likha-data') as {
        access_token?: string;
      } | null;
      if (data?.access_token) {
        return { Authorization: `Bearer ${data.access_token}` };
      }
    } catch {
      // ignore
    }
    return {};
  }

  /**
   * Fetch DUPR settings (safe fields only — no client_secret).
   */
  async fetchSettings(): Promise<DuprSettings | null> {
    try {
      console.log('[DUPR] Fetching settings...');
      const result = await likhaClient.request(
        readSingleton('dupr_settings', {
          fields: [
            'id',
            'api_base_url',
            'environment',
            'submit_flow_url',
            'rating_flow_url',
            'connect_flow_url',
            'client_key',
            'user_api_base_url',
          ],
        }),
      );
      console.log('[DUPR] Settings loaded:', result);
      this.state.settings = result as DuprSettings;
      return this.state.settings;
    } catch (err) {
      console.error('[DUPR] Failed to fetch settings:', err);
      this.state.error = 'Failed to load DUPR settings';
      return null;
    }
  }

  /**
   * Fetch the current user's DUPR connection status.
   */
  async fetchConnection(): Promise<DuprConnection | null> {
    this.state.loading = true;
    try {
      const result = await likhaClient.request(
        readItems('dupr_connection', {
          fields: [
            'id',
            'dupr_id',
            'environment',
            'status',
            'singles_rating',
            'doubles_rating',
            'rating_updated_at',
            'connected_at',
            'disconnected_at',
          ],
          limit: 1,
        }),
      );
      const connections = result as DuprConnection[];
      if (connections && connections.length > 0) {
        this.state.connection = connections[0];
        LocalStorage.set(DUPR_CACHE_KEY, this.state.connection);
      } else {
        this.state.connection = null;
        LocalStorage.remove(DUPR_CACHE_KEY);
      }
      return this.state.connection;
    } catch (err) {
      console.warn('[DUPR] Failed to fetch connection:', err);
      return null;
    } finally {
      this.state.loading = false;
    }
  }

  /**
   * Fetch DUPR submission statuses for a club.
   */
  async fetchSubmissions(clubId: string): Promise<DuprSubmissionStatus[]> {
    try {
      const result = await likhaClient.request(
        readItems('dupr_submission', {
          filter: { club: { _eq: clubId } },
          fields: [
            'id',
            'match_key',
            'club',
            'status',
            'dupr_match_code',
            'submitted_at',
            'environment',
          ],
          limit: 500,
        }),
      );
      const submissions = (result as DuprSubmissionStatus[]) || [];
      this.state.submissions = submissions;
      LocalStorage.set(SUBMISSIONS_CACHE_KEY, submissions);
      return submissions;
    } catch (err) {
      console.warn('[DUPR] Failed to fetch submissions:', err);
      return this.state.submissions;
    }
  }

  /**
   * Get submission status for a single match key.
   */
  getSubmissionStatus(matchKey: string): DuprSubmissionStatus | null {
    return this.state.submissions.find((s) => s.match_key === matchKey) || null;
  }

  /**
   * Open the DUPR SSO login iframe.
   * The iframe sends a postMessage with user tokens after successful login.
   */
  openSsoIframe(
    onSuccess: (data: SsoMessageData) => void,
    onError: (err: string) => void,
  ): void {
    const settings = this.state.settings;
    if (!settings) {
      onError('DUPR settings not loaded');
      return;
    }

    const clientKey = settings.client_key;
    if (!clientKey) {
      onError('DUPR client key not configured');
      return;
    }

    // Base64 encode the client key for the iframe URL
    const encodedKey = btoa(clientKey);
    const env = settings.environment || 'uat';
    const baseUrl =
      env === 'production'
        ? 'https://dashboard.dupr.com/login-external-app/'
        : 'https://uat.dupr.gg/login-external-app/';

    // Clean up any existing handler
    this.closeSsoIframe();

    // Set up message listener
    this.messageHandler = (event: MessageEvent) => {
      // Validate origin — DUPR UAT uses uat.dupr.gg, production uses dashboard.dupr.com
      const allowedOrigins = [
        'https://uat.dupr.gg',
        'https://dashboard.dupr.com',
      ];
      if (!allowedOrigins.includes(event.origin)) return;

      console.log('[DUPR SSO] Received postMessage from:', event.origin);
      console.log('[DUPR SSO] Event data:', event.data);

      const data = event.data;
      if (!data) return;

      // Per DUPR docs: event.userToken, event.refreshToken, event.id, event.duprId, event.stats
      const userToken = data.userToken || data.accessToken;
      const refreshToken = data.refreshToken;
      const duprId = data.duprId;
      const userId = data.id || data.userId;

      if (!userToken || !duprId) {
        console.warn('[DUPR SSO] Missing required fields:', {
          userToken: !!userToken,
          duprId: !!duprId,
        });
        onError('Invalid SSO response from DUPR');
        return;
      }

      console.log('[DUPR SSO] Login successful for DUPR ID:', duprId);
      this.closeSsoIframe();
      onSuccess({
        accessToken: userToken,
        refreshToken: refreshToken || '',
        duprId,
        userId: userId || '',
        stats: data.stats,
      });
    };

    window.addEventListener('message', this.messageHandler);

    // Create iframe — per DUPR docs: <iframe src="https://uat.dupr.gg/login-external-app/:clientKey" allow="payment">
    const iframeUrl = baseUrl + encodedKey;
    console.log('[DUPR SSO] Opening iframe:', iframeUrl);
    this.ssoIframe = document.createElement('iframe');
    this.ssoIframe.src = iframeUrl;
    this.ssoIframe.style.position = 'fixed';
    this.ssoIframe.style.top = '0';
    this.ssoIframe.style.left = '0';
    this.ssoIframe.style.width = '100%';
    this.ssoIframe.style.height = '100%';
    this.ssoIframe.style.zIndex = '9999';
    this.ssoIframe.style.border = 'none';
    this.ssoIframe.setAttribute('allow', 'payment');
    document.body.appendChild(this.ssoIframe);
  }

  /**
   * Close the SSO iframe and remove the message listener.
   */
  closeSsoIframe(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    if (this.ssoIframe && this.ssoIframe.parentNode) {
      this.ssoIframe.parentNode.removeChild(this.ssoIframe);
    }
    this.ssoIframe = null;
  }

  /**
   * Connect DUPR: after SSO login, send tokens to the Connect DUPR flow
   * for server-side identity verification and persistence.
   */
  async connect(
    ssoData: SsoMessageData,
    dinkmatchUserId: string,
  ): Promise<boolean> {
    this.state.connecting = true;
    this.state.error = '';
    try {
      const settings = this.state.settings;
      if (!settings) {
        throw new Error('DUPR settings not loaded');
      }

      // Call the Connect DUPR flow
      const connectUrl = settings.connect_flow_url;
      if (!connectUrl) {
        throw new Error('DUPR connect flow URL not configured');
      }

      const authHeaders = this.getAuthHeaders();
      console.log(
        '[DUPR] Connect flow auth headers present:',
        !!authHeaders.Authorization,
      );

      const response = await fetch(connectUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          accessToken: ssoData.accessToken,
          refreshToken: ssoData.refreshToken,
          duprId: ssoData.duprId,
          userId: ssoData.userId || dinkmatchUserId,
        }),
      });

      console.log('[DUPR] Connect flow response status:', response.status);

      if (!response.ok) {
        const errText = await response.text();
        console.error('[DUPR] Connect flow error:', errText);
        throw new Error(errText || `Flow returned ${response.status}`);
      }

      const result = await response.json();
      console.log('[DUPR] Connect flow result:', result);

      // Update local state from flow response
      this.state.connection = {
        id: '',
        dupr_id: result.duprId || ssoData.duprId,
        environment: result.environment || settings.environment || 'uat',
        status: 'connected',
        singles_rating: result.singlesRating ?? null,
        doubles_rating: result.doublesRating ?? null,
        rating_updated_at: new Date().toISOString(),
        connected_at: new Date().toISOString(),
        disconnected_at: null,
      };
      LocalStorage.set(DUPR_CACHE_KEY, this.state.connection);

      // Also update PlayerProfile so it survives refresh via fetchProfile
      const { PlayerProfile } = await import('src/services/playerProfile');
      PlayerProfile.state.duprId = result.duprId || ssoData.duprId;
      PlayerProfile.saveState();

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect DUPR';
      this.state.error = msg;
      console.error('[DUPR] Connect failed:', err);
      return false;
    } finally {
      this.state.connecting = false;
    }
  }

  /**
   * Disconnect DUPR: clear local state, update directus_users.dupr_id to null.
   */
  async disconnect(): Promise<boolean> {
    this.state.connecting = true;
    try {
      // Clear local state
      this.state.connection = null;
      LocalStorage.remove(DUPR_CACHE_KEY);

      // Clear dupr_id from user profile so it survives refresh
      const { PlayerProfile } = await import('src/services/playerProfile');
      const { updateUser } = await import('@likha-erp/likha-sdk');
      const { likhaClient } = await import('src/services/likhaClient');

      if (PlayerProfile.state.id) {
        try {
          await likhaClient.request(
            updateUser(PlayerProfile.state.id, { dupr_id: null } as Record<
              string,
              unknown
            >),
          );
        } catch (err) {
          console.warn('[DUPR] Failed to clear dupr_id on server:', err);
        }
      }

      PlayerProfile.state.duprId = '';
      PlayerProfile.saveState();

      return true;
    } catch (err) {
      console.error('[DUPR] Disconnect failed:', err);
      return false;
    } finally {
      this.state.connecting = false;
    }
  }

  /**
   * Submit matches to DUPR via the Submit DUPR Matches flow.
   */
  async submitMatches(
    matchKeys: string[],
    clubId: string,
    userId: string,
  ): Promise<SubmitResult | null> {
    this.state.submitting = true;
    this.state.error = '';
    try {
      const settings = this.state.settings;
      if (!settings?.submit_flow_url) {
        throw new Error('DUPR submit flow URL not configured');
      }

      const response = await fetch(settings.submit_flow_url!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({
          matchKeys,
          clubId,
          userId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Flow returned ${response.status}`);
      }

      const result = (await response.json()) as SubmitResult;

      // Refresh submissions from server to get persisted status
      await this.fetchSubmissions(clubId);

      return result;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to submit matches';
      this.state.error = msg;
      console.error('[DUPR] Submit failed:', err);
      return null;
    } finally {
      this.state.submitting = false;
    }
  }

  /**
   * Clear all DUPR state on logout.
   */
  clearAll(): void {
    this.state.connection = null;
    this.state.settings = null;
    this.state.submissions = [];
    this.state.error = '';
    LocalStorage.remove(DUPR_CACHE_KEY);
    LocalStorage.remove(SUBMISSIONS_CACHE_KEY);
  }
}

export interface SsoMessageData {
  accessToken: string;
  userToken?: string;
  refreshToken: string;
  duprId: string;
  id?: string;
  userId?: string;
  stats?: unknown;
}

export interface SubmitResult {
  results: {
    matchKey: string;
    status: string;
    duprMatchCode: string | null;
    error: string | null;
  }[];
  submitted: number;
  failed: number;
  unknown: number;
  total: number;
}

export const DuprServiceInstance = new DuprService();
export const useDupr = () => DuprServiceInstance;
