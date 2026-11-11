import { likhaClient } from 'src/services/likhaClient';
import { readItems, updateItem } from '@likha-erp/likha-sdk';

export interface ClubMembershipInfo {
  clubUUID: string;
  isMember: boolean;
}

/**
 * Check if a user is already a member of a club.
 * Searches by clubId (public slug) and checks the players M2M relation.
 */
export async function checkClubMembership(
  clubId: string,
  userId: string,
): Promise<ClubMembershipInfo | null> {
  const clubs = await likhaClient.request(
    readItems('club', {
      filter: { clubId: { _eq: clubId } },
      fields: ['id', 'players.directus_users_id.id'],
      deep: { players: { _limit: -1 } },
    }),
  );

  if (!clubs || clubs.length === 0) return null;

  const club = clubs[0] as unknown as {
    id: string;
    players?: Array<{ directus_users_id?: { id: string } }>;
  };

  const isMember = club.players?.some(
    (p) => p.directus_users_id?.id === userId,
  );

  return { clubUUID: club.id, isMember: !!isMember };
}

/**
 * Add a user to a club's players M2M relation.
 */
export async function addClubMember(
  clubUUID: string,
  userId: string,
): Promise<void> {
  await likhaClient.request(
    updateItem('club', clubUUID, {
      players: { create: [{ directus_users_id: userId }] },
    }),
  );
}

/**
 * Convenience: check membership and auto-join if not already a member.
 * Returns the club UUID and whether the user was already a member or newly added.
 *
 * `opts.skipMembershipCheck` lets callers that already hold a fresh member
 * list (e.g. ClubPage auto-join right after loadClubData fetched
 * club.players.directus_users_id.id) skip the redundant club re-read.
 * `opts.clubUUID` must then supply the target club's UUID; without it the
 * membership check runs anyway so the club can still be resolved.
 */
export async function joinClub(
  clubId: string,
  userId: string,
  opts?: { clubUUID?: string; skipMembershipCheck?: boolean },
): Promise<
  | { success: true; clubUUID: string; alreadyMember: boolean }
  | { success: false; error: string }
> {
  try {
    let clubUUID: string;
    let alreadyMember = false;
    if (opts?.skipMembershipCheck && opts.clubUUID) {
      // Caller asserts fresh membership data shows the user is NOT a member.
      clubUUID = opts.clubUUID;
    } else {
      const info = await checkClubMembership(clubId, userId);
      if (!info) return { success: false, error: 'Club not found' };
      clubUUID = info.clubUUID;
      alreadyMember = info.isMember;
    }

    if (!alreadyMember) {
      await addClubMember(clubUUID, userId);
    }

    return {
      success: true,
      clubUUID,
      alreadyMember,
    };
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response
      ?.status;
    if (status === 401) {
      throw err; // Let caller handle auth redirect
    }

    let errorMessage = 'Failed to join club';
    if (err instanceof Error) {
      errorMessage = err.message;
    } else if (typeof err === 'object' && err !== null) {
      const sdkErr = err as {
        errors?: { message?: string }[];
        message?: string;
      };
      errorMessage =
        sdkErr.errors?.[0]?.message ?? sdkErr.message ?? 'Failed to join club';
    } else if (typeof err === 'string') {
      errorMessage = err;
    }
    return { success: false, error: errorMessage };
  }
}
