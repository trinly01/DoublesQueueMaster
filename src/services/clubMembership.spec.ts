import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/services/likhaClient', () => ({
  likhaClient: {
    request: vi.fn(),
  },
}));

vi.mock('@likha-erp/likha-sdk', () => ({
  readItems: vi.fn(),
  updateItem: vi.fn(),
}));

import { checkClubMembership, joinClub } from './clubMembership';
import { likhaClient } from 'src/services/likhaClient';
import { readItems, updateItem } from '@likha-erp/likha-sdk';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkClubMembership', () => {
  it('requests all player rows (deep _limit -1) so large clubs are not truncated', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'uuid-1', players: [{ directus_users_id: { id: 'u9' } }] },
    ]);
    const result = await checkClubMembership('siklab', 'u9');
    expect(readItems).toHaveBeenCalledWith(
      'club',
      expect.objectContaining({
        deep: { players: { _limit: -1 } },
      }),
    );
    expect(result).toEqual({ clubUUID: 'uuid-1', isMember: true });
  });

  it('returns isMember false when user is absent', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'uuid-1', players: [{ directus_users_id: { id: 'u1' } }] },
    ]);
    const result = await checkClubMembership('siklab', 'u2');
    expect(result?.isMember).toBe(false);
  });
});

describe('joinClub', () => {
  it('does not create a membership row when already a member', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'uuid-1',
        players: [
          { directus_users_id: { id: 'u1' } },
          { directus_users_id: { id: 'u2' } },
        ],
      },
    ]);
    const result = await joinClub('siklab', 'u2');
    expect(result).toEqual({
      success: true,
      clubUUID: 'uuid-1',
      alreadyMember: true,
    });
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('creates membership when user is not a member', async () => {
    (likhaClient.request as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'uuid-1', players: [{ directus_users_id: { id: 'u1' } }] },
    ]);
    const result = await joinClub('siklab', 'u2');
    expect(result).toEqual({
      success: true,
      clubUUID: 'uuid-1',
      alreadyMember: false,
    });
    expect(updateItem).toHaveBeenCalledWith('club', 'uuid-1', {
      players: { create: [{ directus_users_id: 'u2' }] },
    });
  });
});
