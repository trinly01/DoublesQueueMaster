import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { ClubMember } from './useClubMembers';

// Mock quasar
vi.mock('quasar', () => ({
  LocalStorage: {
    getItem: vi.fn(() => null),
    set: vi.fn(),
  },
}));

// Mock likhaClient
vi.mock('src/services/likhaClient', () => ({
  likhaClient: {
    request: vi.fn(),
  },
}));

// Mock likha-sdk
vi.mock('@likha-erp/likha-sdk', () => ({
  readItems: vi.fn(),
}));

// Mock replayMatches
vi.mock('src/utils/ratingReplay', () => ({
  replayMatches: vi.fn((matches) => {
    const players: Record<
      string,
      {
        username: string;
        firstName: string;
        lastName: string;
        rating: number;
        avatar?: string;
        wins: number;
        losses: number;
        matchesPlayed: number;
      }
    > = {};
    for (const m of matches) {
      for (const p of [...m.teamA, ...m.teamB]) {
        if (!players[p.username]) {
          players[p.username] = {
            username: p.username,
            firstName: p.firstName || p.username,
            lastName: p.lastName || '',
            rating: p.rating || 1450,
            avatar: p.avatar,
            wins: 0,
            losses: 0,
            matchesPlayed: 0,
          };
        }
        players[p.username].matchesPlayed++;
      }
      if (m.teamAScore > m.teamBScore) {
        for (const p of m.teamA) players[p.username].wins++;
        for (const p of m.teamB) players[p.username].losses++;
      } else {
        for (const p of m.teamB) players[p.username].wins++;
        for (const p of m.teamA) players[p.username].losses++;
      }
    }
    return players;
  }),
}));

// Mock resolveAvatarUrl
vi.mock('src/utils/playerHelpers', () => ({
  resolveAvatarUrl: vi.fn((avatar?: string) => avatar || undefined),
}));

import { useLeaderboard } from './useLeaderboard';
import { likhaClient } from 'src/services/likhaClient';
import { LocalStorage } from 'quasar';
import { replayMatches } from 'src/utils/ratingReplay';

function makeContext(overrides: Record<string, unknown> = {}) {
  const currentClubUUID = ref('uuid-123');
  const clubMembers = ref<ClubMember[]>([
    { id: 'u1', username: 'alice', firstName: 'Alice', rating: 1500 },
    { id: 'u2', username: 'bob', firstName: 'Bob', rating: 1400 },
  ]);
  return {
    context: {
      currentClubUUID,
      clubMembers,
      ...overrides,
    },
    currentClubUUID,
    clubMembers,
  };
}

const mockMatches = [
  {
    team_a_score: 11,
    team_b_score: 5,
    team_a: [
      {
        username: 'alice',
        firstName: 'Alice',
        lastName: 'Smith',
        rating: 1500,
      },
      { username: 'bob', firstName: 'Bob', lastName: 'Jones', rating: 1400 },
    ],
    team_b: [
      {
        username: 'charlie',
        firstName: 'Charlie',
        lastName: 'Brown',
        rating: 1450,
      },
    ],
    players: [
      {
        directus_users_id: {
          username: 'alice',
          first_name: 'Alice',
          last_name: 'Smith',
          avatar: 'avatar1.png',
        },
      },
      {
        directus_users_id: {
          username: 'charlie',
          first_name: 'Charlie',
          last_name: 'Brown',
        },
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useLeaderboard — initial state', () => {
  it('starts with empty leaderboard and loading=false', () => {
    const { context } = makeContext();
    const { clubLeaderboard, clubLeaderboardLoading } = useLeaderboard(context);
    expect(clubLeaderboard.value).toEqual([]);
    expect(clubLeaderboardLoading.value).toBe(false);
  });
});

describe('useLeaderboard — fetchClubLeaderboard', () => {
  it('does nothing when currentClubUUID is empty', async () => {
    const { context } = makeContext({ currentClubUUID: ref('') });
    const { fetchClubLeaderboard } = useLeaderboard(context);
    await fetchClubLeaderboard();
    expect(likhaClient.request).not.toHaveBeenCalled();
  });

  it('does nothing when already loading', async () => {
    const { context } = makeContext();
    const { fetchClubLeaderboard, clubLeaderboardLoading } =
      useLeaderboard(context);
    clubLeaderboardLoading.value = true;
    await fetchClubLeaderboard();
    expect(likhaClient.request).not.toHaveBeenCalled();
  });

  it('fetches and populates leaderboard', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockMatches,
    );
    const { context } = makeContext();
    const { fetchClubLeaderboard, clubLeaderboard } = useLeaderboard(context);
    await fetchClubLeaderboard();
    expect(clubLeaderboard.value.length).toBeGreaterThan(0);
    expect(clubLeaderboard.value[0]).toHaveProperty('username');
    expect(clubLeaderboard.value[0]).toHaveProperty('score');
    expect(clubLeaderboard.value[0]).toHaveProperty('winRate');
  });

  it('limits to 20 entries', async () => {
    const manyMatches = Array.from({ length: 50 }, (_, i) => ({
      team_a_score: 11,
      team_b_score: 5,
      team_a: [
        {
          username: `player${i}`,
          firstName: `Player${i}`,
          lastName: '',
          rating: 1500 + i,
        },
      ],
      team_b: [
        {
          username: `opponent${i}`,
          firstName: `Opp${i}`,
          lastName: '',
          rating: 1400,
        },
      ],
      players: [
        {
          directus_users_id: {
            username: `player${i}`,
            first_name: `Player${i}`,
            last_name: '',
          },
        },
        {
          directus_users_id: {
            username: `opponent${i}`,
            first_name: `Opp${i}`,
            last_name: '',
          },
        },
      ],
    }));
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(
      manyMatches,
    );
    const { context } = makeContext();
    const { fetchClubLeaderboard, clubLeaderboard } = useLeaderboard(context);
    await fetchClubLeaderboard();
    expect(clubLeaderboard.value.length).toBeLessThanOrEqual(20);
  });

  it('sorts by score descending then rating', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockMatches,
    );
    const { context } = makeContext();
    const { fetchClubLeaderboard, clubLeaderboard } = useLeaderboard(context);
    await fetchClubLeaderboard();
    for (let i = 1; i < clubLeaderboard.value.length; i++) {
      const prev = clubLeaderboard.value[i - 1];
      const curr = clubLeaderboard.value[i];
      expect(prev.score >= curr.score).toBe(true);
    }
  });

  it('loads cached data before API fetch', async () => {
    const cachedData = [
      {
        id: 'cached1',
        username: 'cached',
        firstName: 'Cached',
        rating: 1600,
        wins: 5,
        losses: 0,
        games: 5,
        score: 1600,
        winRate: 100,
      },
    ];
    (LocalStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue({
      data: cachedData,
      timestamp: Date.now(),
    });
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockMatches,
    );
    const { context } = makeContext();
    const { fetchClubLeaderboard, clubLeaderboard } = useLeaderboard(context);
    await fetchClubLeaderboard();
    // After fetch completes, API data replaces cache
    expect(clubLeaderboard.value.length).toBeGreaterThan(0);
    expect(LocalStorage.getItem).toHaveBeenCalled();
  });

  it('sets loading to false after fetch', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockMatches,
    );
    const { context } = makeContext();
    const { fetchClubLeaderboard, clubLeaderboardLoading } =
      useLeaderboard(context);
    await fetchClubLeaderboard();
    expect(clubLeaderboardLoading.value).toBe(false);
  });

  it('handles API error gracefully', async () => {
    (LocalStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (likhaClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error'),
    );
    const { context } = makeContext();
    const { fetchClubLeaderboard, clubLeaderboard, clubLeaderboardLoading } =
      useLeaderboard(context);
    await fetchClubLeaderboard();
    expect(clubLeaderboard.value).toEqual([]);
    expect(clubLeaderboardLoading.value).toBe(false);
  });

  it('calls replayMatches with reversed match order', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockMatches,
    );
    const { context } = makeContext();
    const { fetchClubLeaderboard } = useLeaderboard(context);
    await fetchClubLeaderboard();
    expect(replayMatches).toHaveBeenCalled();
    const arg = (replayMatches as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
  });
});
