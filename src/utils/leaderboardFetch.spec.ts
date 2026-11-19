import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock likhaClient — the helper pages through likhaClient.request.
vi.mock('src/services/likhaClient', () => ({
  likhaClient: {
    request: vi.fn(),
  },
}));

// Mock the SDK query builder — capture the query object it receives so the
// tests can assert on filter/fields/sort/page without depending on the real
// Directus query serialization.
vi.mock('@likha-erp/likha-sdk', () => ({
  readItems: vi.fn((_collection: string, query: Record<string, unknown>) => ({
    collection: _collection,
    query,
  })),
}));

import { fetchLeaderboardMatches } from './leaderboardFetch';
import { likhaClient } from 'src/services/likhaClient';
import { readItems } from '@likha-erp/likha-sdk';

const requestMock = likhaClient.request as ReturnType<typeof vi.fn>;
const readItemsMock = readItems as unknown as ReturnType<typeof vi.fn>;

const PAGE_SIZE = 500;
const MAX_PAGES = 10;
const fullPage = () =>
  Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: `m${i}` }));

// The query object passed as the second argument to readItems.
const lastQuery = () =>
  readItemsMock.mock.calls[readItemsMock.mock.calls.length - 1][1] as Record<
    string,
    unknown
  >;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchLeaderboardMatches', () => {
  it('returns an empty array when there are no matches', async () => {
    requestMock.mockResolvedValue([]);
    const result = await fetchLeaderboardMatches();
    expect(result).toEqual([]);
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('requests the shared fields/sort and only the 30-day filter without a club', async () => {
    requestMock.mockResolvedValue([]);
    await fetchLeaderboardMatches();
    const query = lastQuery();
    expect(query.filter).toEqual({
      completed_at: { _gte: '$NOW(-30 days)' },
    });
    expect(query.fields).toEqual(['*', 'players.directus_users_id.*']);
    expect(query.sort).toEqual(['-completed_at']);
    expect(query.limit).toBe(PAGE_SIZE);
    expect(query.page).toBe(1);
  });

  it('adds a club equality filter when a clubUUID is given', async () => {
    requestMock.mockResolvedValue([]);
    await fetchLeaderboardMatches('club-uuid-1');
    const query = lastQuery();
    expect(query.filter).toEqual({
      _and: [
        { club: { _eq: 'club-uuid-1' } },
        { completed_at: { _gte: '$NOW(-30 days)' } },
      ],
    });
  });

  it('concatenates pages until a short page is returned', async () => {
    requestMock
      .mockResolvedValueOnce(fullPage())
      .mockResolvedValueOnce([{ id: 'last' }]);
    const result = await fetchLeaderboardMatches();
    expect(result).toHaveLength(PAGE_SIZE + 1);
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(readItemsMock.mock.calls[1][1]).toMatchObject({ page: 2 });
  });

  it('stops paginating when a page comes back empty', async () => {
    requestMock.mockResolvedValueOnce(fullPage()).mockResolvedValueOnce([]);
    const result = await fetchLeaderboardMatches();
    expect(result).toHaveLength(PAGE_SIZE);
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it('caps pagination at 10 pages', async () => {
    requestMock.mockResolvedValue(fullPage());
    const result = await fetchLeaderboardMatches();
    expect(result).toHaveLength(PAGE_SIZE * MAX_PAGES);
    expect(requestMock).toHaveBeenCalledTimes(MAX_PAGES);
  });
});
