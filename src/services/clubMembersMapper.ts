import { hasPremiumL1 } from 'src/services/matchmaking';

export interface ClubMember {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  rating?: number;
  level?: 1 | 2 | 3;
  isAdmin?: boolean;
  isModerator?: boolean;
  avatar?: string;
  duprId?: string;
  duprPlus?: boolean;
  playerJunctionId?: string;
  playerJunctionIds?: string[];
  adminJunctionId?: string;
  adminJunctionIds?: string[];
  moderatorJunctionId?: string;
  moderatorJunctionIds?: string[];
}

interface ClubJunction {
  id?: string;
  directus_users_id?: unknown;
}

export interface ClubMembersPayload {
  players?: ClubJunction[];
  admins?: ClubJunction[];
  moderators?: ClubJunction[];
}

export interface MappedClubMembers {
  members: ClubMember[];
  adminIds: Set<string>;
  moderatorIds: Set<string>;
}

const userIdOf = (u: unknown): string => {
  const id = (u as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' ? id : '';
};

/**
 * Single source of truth for turning a Directus club payload into the
 * member list. Both loadClubData (initial load / cloud sync) and
 * refreshClubMembers (post-mutation reconcile) must use this so the two
 * paths can never drift: duplicate junction rows are collapsed to one
 * member per user, and every junction record id is preserved for
 * admin/moderator/remove operations.
 */
export function mapClubToMembers(
  club: ClubMembersPayload,
  avatarBaseUrl: string,
): MappedClubMembers {
  const adminIds = new Set<string>();
  const adminJunctionMap = new Map<string, string[]>();
  (club.admins || []).forEach((a) => {
    const uid = userIdOf(a.directus_users_id);
    if (!uid) return;
    adminIds.add(uid);
    if (a.id) {
      const ids = adminJunctionMap.get(uid) || [];
      ids.push(a.id);
      adminJunctionMap.set(uid, ids);
    }
  });

  const moderatorIds = new Set<string>();
  const moderatorJunctionMap = new Map<string, string[]>();
  (club.moderators || []).forEach((m) => {
    const uid = userIdOf(m.directus_users_id);
    if (!uid) return;
    moderatorIds.add(uid);
    if (m.id) {
      const ids = moderatorJunctionMap.get(uid) || [];
      ids.push(m.id);
      moderatorJunctionMap.set(uid, ids);
    }
  });

  const playerJunctionMap = new Map<string, string[]>();
  (club.players || []).forEach((p) => {
    const uid = userIdOf(p.directus_users_id);
    if (uid && p.id) {
      const ids = playerJunctionMap.get(uid) || [];
      ids.push(p.id);
      playerJunctionMap.set(uid, ids);
    }
  });

  const members = (club.players || [])
    .map((p) => {
      const u = p.directus_users_id as Record<string, unknown> | null;
      const userId = userIdOf(u);
      const avatarId =
        typeof u?.avatar === 'string' ? u.avatar : undefined;
      return {
        id: userId,
        username: typeof u?.username === 'string' ? u.username : undefined,
        firstName:
          typeof u?.first_name === 'string' ? u.first_name : undefined,
        lastName:
          typeof u?.last_name === 'string' ? u.last_name : undefined,
        email: typeof u?.email === 'string' ? u.email : undefined,
        rating: typeof u?.rating === 'number' ? u.rating : undefined,
        duprId: typeof u?.dupr_id === 'string' ? u.dupr_id : undefined,
        duprPlus: hasPremiumL1(u?.dupr_entitlements),
        isAdmin: adminIds.has(userId),
        isModerator: moderatorIds.has(userId),
        avatar: avatarId ? `${avatarBaseUrl}/assets/${avatarId}` : undefined,
        playerJunctionId: p.id || undefined,
        playerJunctionIds: playerJunctionMap.get(userId) || [],
        adminJunctionId: adminJunctionMap.get(userId)?.[0],
        adminJunctionIds: adminJunctionMap.get(userId) || [],
        moderatorJunctionId: moderatorJunctionMap.get(userId)?.[0],
        moderatorJunctionIds: moderatorJunctionMap.get(userId) || [],
      };
    })
    .filter((m) => m.id)
    // Deduplicate by user ID — a user may have multiple junction records
    .reduce((acc: ClubMember[], m) => {
      if (!acc.some((x) => x.id === m.id)) acc.push(m);
      return acc;
    }, []);

  return { members, adminIds, moderatorIds };
}
