import { reactive } from 'vue';
import { LocalStorage } from 'quasar';
import { likhaClient } from 'src/services/likhaClient';
import { readMe, readItems } from '@likha-erp/likha-sdk';
export interface RatingEvent {
  day: string;
  wins: number;
  losses: number;
  rating: number;
}

export interface DirectusCompletedMatch {
  match_key: string;
  match_id: string;
  match_type: string;
  team_a: {
    username: string;
    userId?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    level?: 1 | 2 | 3;
    rating?: number;
    avatar?: string;
    duprId?: string;
  }[];
  team_b: {
    username: string;
    userId?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    level?: 1 | 2 | 3;
    rating?: number;
    avatar?: string;
    duprId?: string;
  }[];
  team_a_score: number;
  team_b_score: number;
  completed_at: string;
  started_at?: string;
  club: string;
  players?: {
    id: number;
    directus_users_id?: {
      id: string;
      username?: string;
      first_name?: string;
      last_name?: string;
      rating?: number;
      avatar?: string;
    };
  }[];
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  rating: number;
  duprId?: string;
  avatar?: string;
  lastPayment?: string;
  lastModified?: number;
  events?: RatingEvent[];
  completedMatches?: DirectusCompletedMatch[];
}

const STORAGE_KEY = 'player_profile';

export class PlayerProfileService {
  public state: UserProfile;
  public loading = reactive({ value: false });
  public error = reactive({ value: '' });

  constructor() {
    const saved = this.loadState();
    this.state = reactive({
      id: saved?.id || '',
      firstName: saved?.firstName || '',
      lastName: saved?.lastName || '',
      email: saved?.email || '',
      username: saved?.username || '',
      rating: saved?.rating ?? 1450,
      duprId: saved?.duprId || '',
      avatar: saved?.avatar || '',
      lastPayment: saved?.lastPayment || '',
      lastModified: saved?.lastModified || 0,
      events: saved?.events || [],
      completedMatches: saved?.completedMatches || [],
    });
  }

  public saveState() {
    this.state.lastModified = Date.now();
    LocalStorage.set(STORAGE_KEY, { ...this.state });
  }

  private loadState(): Partial<UserProfile> | null {
    const saved = LocalStorage.getItem(STORAGE_KEY) as
      | Partial<UserProfile>
      | string
      | null;
    if (!saved) return null;
    if (typeof saved === 'string') {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return saved;
  }

  /**
   * Fetch profile from server and update local cache.
   * Falls back silently to cached data when offline.
   */
  public async fetchProfile(): Promise<boolean> {
    this.loading.value = true;
    this.error.value = '';

    try {
      // On first Google SSO registration, the Directus provisioning Flow may
      // not have finished populating username/rating/names yet. Retry a few
      // times before accepting a half-provisioned profile.
      let user = await likhaClient.request(readMe());
      let attempts = 0;
      while (
        user &&
        !(user as Record<string, unknown>).username &&
        attempts < 3
      ) {
        await new Promise((r) => setTimeout(r, 1500));
        user = await likhaClient.request(readMe());
        attempts++;
      }

      if (user) {
        const userObj = user as Record<string, unknown>;
        const isProvisioned = !!userObj.username;
        let rating = 1450;

        if (typeof userObj.rating === 'number') {
          rating = userObj.rating;
        } else if (
          typeof userObj.rating === 'string' &&
          !isNaN(Number(userObj.rating))
        ) {
          rating = Number(userObj.rating);
        }

        this.state.id = (userObj.id ?? '') as string;
        this.state.firstName = (userObj.first_name ?? '') as string;
        this.state.lastName = (userObj.last_name ?? '') as string;
        this.state.email = (userObj.email ?? '') as string;
        this.state.username = (userObj.username ?? '') as string;
        this.state.avatar = (userObj.avatar ?? '') as string;
        this.state.duprId = (userObj.dupr_id as string | undefined) ?? '';
        this.state.lastPayment =
          (userObj.last_payment as string | undefined) ?? '';
        this.state.rating = rating;

        try {
          const events = await likhaClient.request(
            readItems('event', {
              filter: { player: { _eq: this.state.id } },
              fields: ['day', 'wins', 'losses', 'rating'],
              sort: ['-day'],
              limit: 10,
            }),
          );

          console.log('Events', events);
          this.state.events = Array.isArray(events)
            ? (events as RatingEvent[])
            : [];
        } catch {
          this.state.events = [];
        }

        try {
          console.log(
            '[PlayerProfile] Fetching completed_matches for user:',
            this.state.id,
          );
          const matches = await likhaClient.request(
            readItems('completed_match', {
              filter: {
                players: { directus_users_id: { _eq: this.state.id } },
              },
              fields: ['*', 'club.id', 'players.directus_users_id.*'],
              sort: ['-completed_at'],
              limit: 250,
            }),
          );

          console.log('[PlayerProfile] Raw matches response:', matches);
          console.log('[PlayerProfile] Is array?', Array.isArray(matches));
          console.log(
            '[PlayerProfile] Matches count:',
            Array.isArray(matches) ? matches.length : 0,
          );
          if (Array.isArray(matches) && matches.length > 0) {
            console.log(
              '[PlayerProfile] First match keys:',
              Object.keys(matches[0]),
            );
            console.log('[PlayerProfile] First match:', matches[0]);
          }
          this.state.completedMatches = Array.isArray(matches)
            ? (matches as DirectusCompletedMatch[])
            : [];
          console.log(
            '[PlayerProfile] Stored completedMatches count:',
            this.state.completedMatches.length,
          );
        } catch (err) {
          console.warn(
            '[PlayerProfile] Failed to fetch completed matches:',
            err,
          );
          this.state.completedMatches = [];
        }

        // Only persist to cache when the profile is fully provisioned.
        // A half-provisioned snapshot (blank username from SSO race) would
        // stick in localStorage until logout; skipping saveState ensures the
        // next visit refetches fresh from the server.
        if (isProvisioned) {
          this.saveState();
        }
        this.loading.value = false;
        return true;
      }
    } catch (err) {
      // A 401 means the session is invalid/expired — not an offline state.
      // Re-throw so the caller can trigger a full logout + redirect.
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 401) {
        this.loading.value = false;
        throw err;
      }
      console.warn('Failed to fetch profile from server, using cache:', err);
      this.error.value = 'Offline — showing cached profile';
    } finally {
      this.loading.value = false;
    }

    return false;
  }

  public clearProfile() {
    LocalStorage.remove(STORAGE_KEY);
    this.state.id = '';
    this.state.firstName = '';
    this.state.lastName = '';
    this.state.email = '';
    this.state.username = '';
    this.state.rating = 1450;
    this.state.duprId = '';
    this.state.avatar = '';
    this.state.lastModified = 0;
    this.state.events = [];
    this.state.completedMatches = [];
  }

  public hasCachedProfile(): boolean {
    return !!this.state.id && (this.state.lastModified || 0) > 0;
  }
}

// Singleton instance for app-wide use
export const PlayerProfile = new PlayerProfileService();
