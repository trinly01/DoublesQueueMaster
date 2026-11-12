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
  /**
   * Write-privilege id sets — admins/moderators INTERSECTED with member
   * (players M2M) ids. These feed the cloud-sync push gate; a user who is in
   * the admins/moderators M2M but not players M2M gets no member row and no
   * admin UI, so granting them push rights would be an invisible privileged
   * write (RESET_DECISION #17). Intersecting keeps gate and UI consistent:
   * write privilege requires membership. Member rows' isAdmin/isModerator
   * flags still reflect true roles via the unfiltered sets.
   */
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

  // Invisible-writer guard: restrict the returned privilege sets to users
  // who are also club members (players M2M). See MappedClubMembers docs.
  const memberIds = new Set(members.map((m) => m.id));
  const writeAdminIds = new Set(
    [...adminIds].filter((id) => memberIds.has(id)),
  );
  const writeModeratorIds = new Set(
    [...moderatorIds].filter((id) => memberIds.has(id)),
  );

  return { members, adminIds: writeAdminIds, moderatorIds: writeModeratorIds };
}

// ---------------------------------------------------------------------------
// club_meta_* privilege cache contract (reset-detection contract §4)
// ---------------------------------------------------------------------------

/**
 * TTL for the privilege fields (adminIds/moderatorIds) inside club_meta_*
 * LocalStorage entries. The ids are re-verified by a fresh admins/moderators
 * M2M fetch on every loadClubData / refreshClubMembers; this TTL bounds how
 * long a verified entry may keep authorizing cloud-sync pushes without a new
 * fetch — i.e. the demoted-admin window on a long-lived session.
 *
 * 5 minutes chosen per contract §4 ("suggest 5min for privilege fields"):
 * long enough to cover routine UI seeds between fetches, short enough that a
 * demotion stops authorizing pushes quickly in practice — resume-sync and
 * the periodic member refresh both re-fetch club data well inside this
 * window, so the TTL only binds when fetches are failing.
 */
export const CLUB_PRIVILEGE_META_TTL_MS = 5 * 60 * 1000;

/**
 * Shape of a club_meta_<clubId> LocalStorage entry (privilege fields only —
 * the entry also carries clubUUID/members/clubName/clubLogo/clubStatus).
 */
export interface ClubPrivilegeMeta {
  adminIds?: string[];
  moderatorIds?: string[];
  timestamp?: number;
  verified?: boolean;
}

/**
 * Fail-closed check for cached club privilege. `verified` is written true
 * only by a fresh admins/moderators M2M fetch; legacy entries written before
 * this field existed are unverified and must not authorize pushes. The entry
 * also expires CLUB_PRIVILEGE_META_TTL_MS after its timestamp so a demoted
 * admin's cached ids stop authorizing pushes even when no fresh fetch has
 * run. A future-dated timestamp (device clock moved backwards) is treated as
 * unverified — fail closed.
 */
export function isClubPrivilegeMetaVerified(
  meta: ClubPrivilegeMeta | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!meta || meta.verified !== true) return false;
  const ts = meta.timestamp;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return false;
  const age = now - ts;
  return age >= 0 && age <= CLUB_PRIVILEGE_META_TTL_MS;
}
