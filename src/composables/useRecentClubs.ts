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

/**
 * Minimal shape needed to derive recent clubs from an already-fetched
 * completed_match row (e.g. PlayerProfile.state.completedMatches).
 */
export interface RecentClubSourceMatch {
  completed_at?: string;
  club?:
    | string
    | null
    | {
        id?: string;
        clubId?: string;
        name?: string;
        logo?: string;
        players?: Array<{ id?: string; directus_users_id?: { id: string } }>;
      };
}

// The dedicated query only ever consumed the 250 most recent matches —
// callers passing a larger prefetched window are sliced to the same size.
const RECENT_MATCH_LIMIT = 250;

export function useRecentClubs(
  currentUserId: Ref<string>,
  options?: {
    includePlayers?: boolean;
    cacheKey?: string;
    membershipOnly?: boolean;
  },
) {
  const includePlayers = options?.includePlayers ?? false;
  const cacheKey = options?.cacheKey ?? 'recent_clubs_cache';
  const membershipOnly = options?.membershipOnly ?? false;

  const recentClubs = ref<RecentClub[]>([]);
  const loading = ref(false);

  const resolveLogoUrl = (logo?: string): string => {
    if (!logo) return '';
    if (logo.startsWith('http://') || logo.startsWith('https://')) {
      return logo;
    }
    return `${LIKHA_URL}/assets/${logo}`;
  };

  /**
   * Paint cached clubs instantly. Safe to call before the user id or fresh
   * matches arrive — it never hits the network.
   */
  const loadCachedClubs = (): boolean => {
    const cached = LocalStorage.getItem(cacheKey) as RecentClub[] | null;
    const hasCache = !!(cached && cached.length > 0);
    if (hasCache) {
      recentClubs.value = cached;
    }
    return hasCache;
  };

  const loadRecentClubs = async (
    prefetchedMatches?: RecentClubSourceMatch[],
  ) => {
    // Show cached clubs instantly, even before user ID is available
    const hasCache = loadCachedClubs();

    // Skip server fetch if we don't have a user ID yet
    if (!currentUserId.value) return;

    if (!hasCache) {
      loading.value = true;
    }

    try {
      let rawMatches: unknown;
      if (prefetchedMatches !== undefined) {
        // Caller already fetched this user's completed matches (same
        // players.directus_users_id filter, larger limit) — derive clubs
        // from that payload instead of issuing a second completed_match read.
        rawMatches = prefetchedMatches;
      } else {
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

        rawMatches = await likhaClient.request(
          readItems('completed_match', {
            filter: {
              players: { directus_users_id: { _eq: currentUserId.value } },
            },
            fields,
            sort: ['-completed_at'],
            limit: RECENT_MATCH_LIMIT,
          }),
        );
      }

      const matchList = ((rawMatches || []) as unknown as {
        completed_at: string;
        club: {
          id: string;
          clubId: string;
          name?: string;
          logo?: string;
          players?: Array<{
            id?: string;
            directus_users_id?: { id: string };
          }>;
        };
      }[]).slice(0, RECENT_MATCH_LIMIT);

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

      if (membershipOnly) {
        // Query actual club membership to filter out left clubs
        const memberClubs = await likhaClient.request(
          readItems('club', {
            filter: {
              players: { directus_users_id: { _eq: currentUserId.value } },
            },
            fields: [
              'id',
              'clubId',
              'name',
              'logo',
              'players.id',
              'players.directus_users_id.id',
            ],
            deep: { players: { _limit: -1 } },
          }),
        );

        const memberMap = new Map<string, RecentClub>();
        for (const c of (memberClubs || []) as unknown as {
          id: string;
          clubId: string;
          name?: string;
          logo?: string;
          players?: Array<{ id?: string; directus_users_id?: { id: string } }>;
        }[]) {
          memberMap.set(c.id, {
            id: c.id,
            clubId: c.clubId,
            name: c.name || c.clubId,
            logoUrl: resolveLogoUrl(c.logo),
            players: c.players,
          });
        }

        // Keep only clubs the user is still a member of (sorted by recent match)
        const filtered: RecentClub[] = sortedClubs
          .filter((c) => memberMap.has(c.id))
          .map((c) => ({ ...c, players: memberMap.get(c.id)!.players }));

        // Append member clubs with no matches (joined but never played)
        for (const [id, c] of memberMap) {
          if (!seen.has(id)) {
            filtered.push(c);
          }
        }

        recentClubs.value = filtered;
        LocalStorage.set(cacheKey, filtered);
      } else {
        // Merge cached clubs that have no matches (user joined but hasn't played yet)
        if (hasCache && includePlayers) {
          // recentClubs still holds the cache loadCachedClubs() painted.
          for (const c of recentClubs.value) {
            if (!seen.has(c.id)) {
              sortedClubs.push(c);
            }
          }
        }

        recentClubs.value = sortedClubs;
        LocalStorage.set(cacheKey, sortedClubs);
      }
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
    loadCachedClubs,
  };
}
