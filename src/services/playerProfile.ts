import { reactive } from 'vue';
import { LocalStorage } from 'quasar';
import { likhaClient } from 'src/boot/likha';
import { readMe, readItems } from '@likha-erp/likha-sdk';

export interface RatingEvent {
  day: string;
  wins: number;
  losses: number;
  rating: number;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  rating: number;
  avatar?: string;
  lastModified?: number;
  events?: RatingEvent[];
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
      rating: saved?.rating ?? 1500,
      avatar: saved?.avatar || '',
      lastModified: saved?.lastModified || 0,
      events: saved?.events || [],
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
      const user = await likhaClient.request(readMe());
      if (user) {
        const userObj = user as Record<string, unknown>;
        let rating = 1500;

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

        this.saveState();
        this.loading.value = false;
        return true;
      }
    } catch (err) {
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
    this.state.rating = 1500;
    this.state.avatar = '';
    this.state.lastModified = 0;
    this.state.events = [];
  }

  public hasCachedProfile(): boolean {
    return !!this.state.id && (this.state.lastModified || 0) > 0;
  }
}

// Singleton instance for app-wide use
export const PlayerProfile = new PlayerProfileService();
