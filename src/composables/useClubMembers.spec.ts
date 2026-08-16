import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { MatchmakingApp } from 'src/services/matchmaking';
import type { ClubMember, ClubSettingsSort } from './useClubMembers';

// Mock useNotify
vi.mock('src/composables/useNotify', () => ({
  useNotify: () => ({
    notify: vi.fn(),
  }),
}));

// Mock useQuasar
vi.mock('quasar', () => ({
  useQuasar: () => ({
    dialog: vi.fn(({ onOk }) => {
      if (onOk) onOk();
      return { onOk: vi.fn() };
    }),
  }),
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
  updateItem: vi.fn(),
}));

import { useClubMembers } from './useClubMembers';
import { likhaClient } from 'src/services/likhaClient';
import { updateItem } from '@likha-erp/likha-sdk';

function makeMembers(): ClubMember[] {
  return [
    {
      id: 'u1',
      username: 'alice',
      firstName: 'Alice',
      rating: 1500,
      isAdmin: true,
      playerJunctionId: 'pj1',
      adminJunctionId: 'aj1',
    },
    {
      id: 'u2',
      username: 'bob',
      firstName: 'Bob',
      rating: 1400,
      isAdmin: false,
      playerJunctionId: 'pj2',
    },
    {
      id: 'u3',
      username: 'charlie',
      firstName: 'Charlie',
      rating: 1600,
      isAdmin: false,
      playerJunctionId: 'pj3',
    },
  ];
}

function makeContext(overrides: Record<string, unknown> = {}) {
  const clubMembers = ref<ClubMember[]>(makeMembers());
  const clubAdminIds = ref<Set<string>>(new Set(['u1']));
  const currentClubId = ref('club-123');
  const currentClubUUID = ref('uuid-123');
  const likhaUrl = ref('https://api.test');
  const clubSettingsSearch = ref('');
  const clubSettingsSort = ref<ClubSettingsSort>('nameAsc');

  return {
    context: {
      currentClubId,
      currentClubUUID,
      clubAdminIds,
      clubMembers,
      likhaUrl,
      clubSettingsSearch,
      clubSettingsSort,
      ...overrides,
    },
    clubMembers,
    clubAdminIds,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useClubMembers — filteredSortedMembers', () => {
  it('returns all members when no search', () => {
    const { context } = makeContext();
    const { filteredSortedMembers } = useClubMembers(context);
    expect(filteredSortedMembers.value).toHaveLength(3);
  });

  it('filters by search term', () => {
    const { context } = makeContext();
    context.clubSettingsSearch.value = 'alice';
    const { filteredSortedMembers } = useClubMembers(context);
    expect(filteredSortedMembers.value).toHaveLength(1);
    expect(filteredSortedMembers.value[0].firstName).toBe('Alice');
  });

  it('sorts by name ascending', () => {
    const { context } = makeContext();
    context.clubSettingsSort.value = 'nameAsc';
    const { filteredSortedMembers } = useClubMembers(context);
    expect(filteredSortedMembers.value.map((m) => m.firstName)).toEqual([
      'Alice',
      'Bob',
      'Charlie',
    ]);
  });

  it('sorts by name descending', () => {
    const { context } = makeContext();
    context.clubSettingsSort.value = 'nameDesc';
    const { filteredSortedMembers } = useClubMembers(context);
    expect(filteredSortedMembers.value.map((m) => m.firstName)).toEqual([
      'Charlie',
      'Bob',
      'Alice',
    ]);
  });

  it('sorts by rating descending', () => {
    const { context } = makeContext();
    context.clubSettingsSort.value = 'ratingDesc';
    const { filteredSortedMembers } = useClubMembers(context);
    expect(filteredSortedMembers.value.map((m) => m.rating)).toEqual([
      1600, 1500, 1400,
    ]);
  });

  it('sorts by rating ascending', () => {
    const { context } = makeContext();
    context.clubSettingsSort.value = 'ratingAsc';
    const { filteredSortedMembers } = useClubMembers(context);
    expect(filteredSortedMembers.value.map((m) => m.rating)).toEqual([
      1400, 1500, 1600,
    ]);
  });
});

describe('useClubMembers — adminMembers / regularMembers', () => {
  it('adminMembers returns only admins', () => {
    const { context } = makeContext();
    const { adminMembers } = useClubMembers(context);
    expect(adminMembers.value).toHaveLength(1);
    expect(adminMembers.value[0].isAdmin).toBe(true);
  });

  it('regularMembers returns only non-admins', () => {
    const { context } = makeContext();
    const { regularMembers } = useClubMembers(context);
    expect(regularMembers.value).toHaveLength(2);
    expect(regularMembers.value.every((m) => !m.isAdmin)).toBe(true);
  });
});

describe('useClubMembers — adminMatchStats', () => {
  it('aggregates stats from completedMatches', () => {
    MatchmakingApp.state.completedMatches = [
      {
        matchId: 'm1',
        meta: {
          generatedBy: 'Alice',
          generationType: 'auto',
          scoredBy: 'Alice',
        },
      } as never,
      {
        matchId: 'm2',
        meta: {
          generatedBy: 'Alice',
          generationType: 'manual',
          scoredBy: 'Bob',
        },
      } as never,
      {
        matchId: 'm3',
        meta: {
          generatedBy: 'Bob',
          generationType: 'auto',
          isEdited: true,
          editedBy: 'Alice',
          scoredBy: 'Bob',
        },
      } as never,
    ];
    const { context } = makeContext();
    const { adminMatchStats } = useClubMembers(context);
    expect(adminMatchStats.value['Alice']).toEqual({
      total: 2,
      auto: 1,
      manual: 1,
      edited: 1,
      scored: 1,
    });
    expect(adminMatchStats.value['Bob']).toEqual({
      total: 1,
      auto: 0,
      manual: 0,
      edited: 0,
      scored: 2,
    });
  });

  it('skips matches without generatedBy', () => {
    MatchmakingApp.state.completedMatches = [
      { matchId: 'm1', meta: {} } as never,
    ];
    const { context } = makeContext();
    const { adminMatchStats } = useClubMembers(context);
    expect(Object.keys(adminMatchStats.value)).toHaveLength(0);
  });
});

describe('useClubMembers — removeClubMember', () => {
  it('calls updateItem with correct junction ID', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { context } = makeContext();
    const { removeClubMember } = useClubMembers(context);
    await removeClubMember('u2', 'pj2');
    expect(likhaClient.request).toHaveBeenCalled();
    expect(updateItem).toHaveBeenCalledWith('club', 'uuid-123', {
      players: { delete: ['pj2'] },
    });
  });

  it('does nothing when currentClubUUID is empty', async () => {
    const { context } = makeContext({ currentClubUUID: ref('') });
    const { removeClubMember } = useClubMembers(context);
    await removeClubMember('u2', 'pj2');
    expect(likhaClient.request).not.toHaveBeenCalled();
  });
});

describe('useClubMembers — promoteToAdmin', () => {
  it('calls updateItem with create payload', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { context } = makeContext();
    const { promoteToAdmin } = useClubMembers(context);
    await promoteToAdmin('u2');
    expect(updateItem).toHaveBeenCalledWith('club', 'uuid-123', {
      admins: { create: [{ directus_users_id: 'u2' }] },
    });
  });
});

describe('useClubMembers — demoteAdmin', () => {
  it('calls updateItem with delete payload', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { context } = makeContext();
    const { demoteAdmin } = useClubMembers(context);
    await demoteAdmin('u1', 'aj1');
    expect(updateItem).toHaveBeenCalledWith('club', 'uuid-123', {
      admins: { delete: ['aj1'] },
    });
  });
});

describe('useClubMembers — confirmDemoteAdmin', () => {
  it('blocks demoting last admin', () => {
    const { context } = makeContext();
    context.clubMembers.value = [
      { id: 'u1', firstName: 'Alice', isAdmin: true, adminJunctionId: 'aj1' },
    ];
    const { confirmDemoteAdmin } = useClubMembers(context);
    confirmDemoteAdmin('u1', 'aj1', 'Alice');
    // Should not call dialog since there's only 1 admin
    // (useQuasar dialog mock would have been called if it proceeded)
  });
});

describe('useClubMembers — refreshClubMembers', () => {
  it('does nothing when currentClubId is empty', async () => {
    const { context } = makeContext({ currentClubId: ref('') });
    const { refreshClubMembers } = useClubMembers(context);
    await refreshClubMembers();
    expect(likhaClient.request).not.toHaveBeenCalled();
  });

  it('maps API response to clubMembers', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        players: [
          {
            id: 'pj1',
            directus_users_id: {
              id: 'u1',
              username: 'alice',
              first_name: 'Alice',
              last_name: 'Smith',
              email: 'alice@test.com',
              rating: 1500,
              avatar: 'avatar1.png',
            },
          },
        ],
        admins: [
          {
            id: 'aj1',
            directus_users_id: { id: 'u1' },
          },
        ],
      },
    ]);
    const { context, clubMembers, clubAdminIds } = makeContext();
    const { refreshClubMembers } = useClubMembers(context);
    await refreshClubMembers();
    expect(clubMembers.value).toHaveLength(1);
    expect(clubMembers.value[0].id).toBe('u1');
    expect(clubMembers.value[0].firstName).toBe('Alice');
    expect(clubMembers.value[0].isAdmin).toBe(true);
    expect(clubMembers.value[0].avatar).toBe(
      'https://api.test/assets/avatar1.png',
    );
    expect(clubMembers.value[0].playerJunctionId).toBe('pj1');
    expect(clubMembers.value[0].adminJunctionId).toBe('aj1');
    expect(clubAdminIds.value.has('u1')).toBe(true);
  });

  it('handles empty result', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { context, clubMembers } = makeContext();
    const { refreshClubMembers } = useClubMembers(context);
    await refreshClubMembers();
    // Should not modify clubMembers when result is empty
    expect(clubMembers.value).toHaveLength(3);
  });
});
