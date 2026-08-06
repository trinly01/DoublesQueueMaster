import { ref, type Ref } from 'vue';
import { readItems } from '@likha-erp/likha-sdk';
import { LocalStorage } from 'quasar';
import { likhaClient, LIKHA_URL } from 'src/services/likhaClient';

export interface RecentClub {
  id: string;
  clubId: string;
  name: string;
  logoUrl: string;
  players?: Array<{ id?: string; directus_users_id?: { id: string } }>;
}

export function useRecentClubs(
  currentUserId: Ref<string>,
  options?: {
    includePlayers?: boolean;
    cacheKey?: string;
  },
) {
  const includePlayers = options?.includePlayers ?? false;
  const cacheKey = options?.cacheKey ?? 'recent_clubs_cache';

  const recentClubs = ref<RecentClub[]>([]);
  const loading = ref(false);

  const resolveLogoUrl = (logo?: string): string => {
    if (!logo) return '';
    if (logo.startsWith('http://') || logo.startsWith('https://')) {
      return logo;
    }
    return `${LIKHA_URL}/assets/${logo}`;
  };

  const loadRecentClubs = async () => {
    if (!currentUserId.value) return;

    const cached = LocalStorage.getItem(cacheKey) as RecentClub[] | null;
    const hasCache = cached && cached.length > 0;
    if (hasCache) {
      recentClubs.value = cached;
    } else {
      loading.value = true;
    }

    try {
      const fields = [
        'completed_at',
        'club.id',
        'club.clubId',
        'club.name',
        'club.logo',
      ];
      if (includePlayers) {
        fields.push('club.players.id', 'club.players.directus_users_id.id');
      }

      const matches = await likhaClient.request(
        readItems('completed_match', {
          filter: {
            players: { directus_users_id: { _eq: currentUserId.value } },
          },
          fields,
          sort: ['-completed_at'],
          limit: 250,
        }),
      );

      const matchList = (matches || []) as unknown as {
        completed_at: string;
        club: {
          id: string;
          clubId: string;
          name?: string;
          logo?: string;
          players?: Array<{ id?: string; directus_users_id?: { id: string } }>;
        };
      }[];

      const seen = new Set<string>();
      const sortedClubs: RecentClub[] = [];
      for (const m of matchList) {
        const club = m.club;
        if (club && club.id && !seen.has(club.id)) {
          seen.add(club.id);
          sortedClubs.push({
            id: club.id,
            clubId: club.clubId,
            name: club.name || club.clubId,
            logoUrl: resolveLogoUrl(club.logo),
            players: includePlayers ? club.players : undefined,
          });
        }
      }

      // Merge cached clubs that have no matches (user joined but hasn't played yet)
      if (hasCache && includePlayers) {
        for (const c of cached!) {
          if (!seen.has(c.id)) {
            sortedClubs.push(c);
          }
        }
      }

      recentClubs.value = sortedClubs;
      LocalStorage.set(cacheKey, sortedClubs);
    } catch (err) {
      console.warn('Failed to load recent clubs:', err);
      if (!hasCache) {
        recentClubs.value = [];
      }
    } finally {
      loading.value = false;
    }
  };

  return {
    recentClubs,
    loading,
    loadRecentClubs,
  };
}
