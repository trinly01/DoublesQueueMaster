import { computed, type Ref } from 'vue';
import { useQuasar } from 'quasar';
import type { QNotifyCreateOptions } from 'quasar';
import { readItems, updateItem } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import { MatchmakingApp } from 'src/services/matchmaking';
import { useNotify } from 'src/composables/useNotify';

type NotifyFn = (opts: QNotifyCreateOptions) => void;

export type ClubSettingsSort =
  | 'nameAsc'
  | 'nameDesc'
  | 'ratingDesc'
  | 'ratingAsc';

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
  playerJunctionId?: string;
  adminJunctionId?: string;
  moderatorJunctionId?: string;
}

export interface UseClubMembersContext {
  currentClubId: Ref<string>;
  currentClubUUID: Ref<string>;
  clubAdminIds: Ref<Set<string>>;
  clubMembers: Ref<ClubMember[]>;
  likhaUrl: Ref<string>;
  clubSettingsSearch: Ref<string>;
  clubSettingsSort: Ref<ClubSettingsSort>;
}

export function useClubMembers(context: UseClubMembersContext) {
  const {
    currentClubId,
    currentClubUUID,
    clubAdminIds,
    clubMembers,
    likhaUrl,
    clubSettingsSearch,
    clubSettingsSort,
  } = context;
  const $q = useQuasar();
  const { notify: ctxNotify } = useNotify();
  const notify = ctxNotify as NotifyFn;

  const filteredSortedMembers = computed(() => {
    let list = clubMembers.value;
    const search = (clubSettingsSearch.value || '').trim().toLowerCase();
    if (search) {
      list = list.filter(
        (m) =>
          (m.firstName || '').toLowerCase().includes(search) ||
          (m.username || '').toLowerCase().includes(search) ||
          (m.email || '').toLowerCase().includes(search),
      );
    }
    list = [...list].sort((a, b) => {
      switch (clubSettingsSort.value) {
        case 'nameAsc':
          return (a.firstName || a.username || '').localeCompare(
            b.firstName || b.username || '',
          );
        case 'nameDesc':
          return (b.firstName || b.username || '').localeCompare(
            a.firstName || a.username || '',
          );
        case 'ratingDesc':
          return (b.rating || 0) - (a.rating || 0);
        case 'ratingAsc':
          return (a.rating || 0) - (b.rating || 0);
        default:
          return 0;
      }
    });
    return list;
  });

  const adminMembers = computed(() =>
    filteredSortedMembers.value.filter((m) => m.isAdmin),
  );
  const moderatorMembers = computed(() =>
    filteredSortedMembers.value.filter((m) => m.isModerator && !m.isAdmin),
  );
  const regularMembers = computed(() =>
    filteredSortedMembers.value.filter((m) => !m.isAdmin && !m.isModerator),
  );

  const adminMatchStats = computed(() => {
    const stats: Record<
      string,
      {
        total: number;
        auto: number;
        manual: number;
        edited: number;
        scored: number;
        cancelled: number;
      }
    > = {};
    const ensureStat = (name: string) => {
      if (!stats[name])
        stats[name] = {
          total: 0,
          auto: 0,
          manual: 0,
          edited: 0,
          scored: 0,
          cancelled: 0,
        };
    };
    const completed = MatchmakingApp.state.completedMatches;
    for (const m of completed) {
      const admin = m.meta?.generatedBy;
      if (!admin) continue;
      ensureStat(admin);
      stats[admin].total++;
      if (m.meta?.isEdited) {
        const editor = m.meta?.editedBy || admin;
        ensureStat(editor);
        stats[editor].edited++;
      } else if (m.meta?.generationType === 'auto') stats[admin].auto++;
      else if (m.meta?.generationType === 'manual') stats[admin].manual++;
      if (m.meta?.scoredBy) {
        const scorer = m.meta.scoredBy;
        ensureStat(scorer);
        stats[scorer].scored++;
      }
    }
    const active = MatchmakingApp.state.activeMatches;
    for (const m of active) {
      if (m.cancelledBy) {
        ensureStat(m.cancelledBy);
        stats[m.cancelledBy].cancelled++;
      }
    }
    return stats;
  });

  const removeClubMember = async (
    memberId: string,
    playerJunctionId: string,
  ) => {
    if (!currentClubUUID.value) return;
    try {
      await likhaClient.request(
        updateItem('club', currentClubUUID.value, {
          players: { delete: [playerJunctionId] },
        }),
      );
      await refreshClubMembers();
      notify({ type: 'positive', message: 'Member removed from club' });
    } catch (err) {
      console.error('Failed to remove club member:', err);
      notify({ type: 'negative', message: 'Failed to remove member' });
    }
  };

  const promoteToAdmin = async (memberId: string) => {
    if (!currentClubUUID.value) return;
    try {
      await likhaClient.request(
        updateItem('club', currentClubUUID.value, {
          admins: { create: [{ directus_users_id: memberId }] },
        }),
      );
      await refreshClubMembers();
      notify({ type: 'positive', message: 'Member promoted to admin' });
    } catch (err) {
      console.error('Failed to promote member:', err);
      notify({ type: 'negative', message: 'Failed to promote member' });
    }
  };

  const demoteAdmin = async (memberId: string, adminJunctionId: string) => {
    if (!currentClubUUID.value) return;
    try {
      await likhaClient.request(
        updateItem('club', currentClubUUID.value, {
          admins: { delete: [adminJunctionId] },
        }),
      );
      await refreshClubMembers();
      notify({ type: 'positive', message: 'Admin demoted to member' });
    } catch (err) {
      console.error('Failed to demote admin:', err);
      notify({ type: 'negative', message: 'Failed to demote admin' });
    }
  };

  const demoteAdminToModerator = async (
    memberId: string,
    adminJunctionId: string,
  ) => {
    if (!currentClubUUID.value) return;
    try {
      await likhaClient.request(
        updateItem('club', currentClubUUID.value, {
          admins: { delete: [adminJunctionId] },
          moderators: { create: [{ directus_users_id: memberId }] },
        }),
      );
      await refreshClubMembers();
      notify({ type: 'positive', message: 'Admin demoted to moderator' });
    } catch (err) {
      console.error('Failed to demote admin to moderator:', err);
      notify({ type: 'negative', message: 'Failed to demote admin' });
    }
  };

  const promoteToModerator = async (memberId: string) => {
    if (!currentClubUUID.value) return;
    try {
      await likhaClient.request(
        updateItem('club', currentClubUUID.value, {
          moderators: { create: [{ directus_users_id: memberId }] },
        }),
      );
      await refreshClubMembers();
      notify({ type: 'positive', message: 'Member promoted to moderator' });
    } catch (err) {
      console.error('Failed to promote member:', err);
      notify({ type: 'negative', message: 'Failed to promote member' });
    }
  };

  const demoteModerator = async (
    memberId: string,
    moderatorJunctionId: string,
  ) => {
    if (!currentClubUUID.value) return;
    try {
      await likhaClient.request(
        updateItem('club', currentClubUUID.value, {
          moderators: { delete: [moderatorJunctionId] },
        }),
      );
      await refreshClubMembers();
      notify({ type: 'positive', message: 'Moderator demoted to member' });
    } catch (err) {
      console.error('Failed to demote moderator:', err);
      notify({ type: 'negative', message: 'Failed to demote moderator' });
    }
  };

  const promoteModeratorToAdmin = async (
    memberId: string,
    moderatorJunctionId: string,
  ) => {
    if (!currentClubUUID.value) return;
    try {
      await likhaClient.request(
        updateItem('club', currentClubUUID.value, {
          moderators: { delete: [moderatorJunctionId] },
          admins: { create: [{ directus_users_id: memberId }] },
        }),
      );
      await refreshClubMembers();
      notify({ type: 'positive', message: 'Moderator promoted to admin' });
    } catch (err) {
      console.error('Failed to promote moderator to admin:', err);
      notify({ type: 'negative', message: 'Failed to promote moderator' });
    }
  };

  const confirmDemoteAdmin = (
    memberId: string,
    adminJunctionId: string,
    name: string,
  ) => {
    const adminCount = clubMembers.value.filter((m) => m.isAdmin).length;
    if (adminCount <= 1) {
      notify({ type: 'warning', message: 'Club must have at least one admin' });
      return;
    }
    $q.dialog({
      title: 'Demote Admin',
      message: `Demote ${name} to moderator?`,
      cancel: true,
      persistent: true,
    }).onOk(() => demoteAdminToModerator(memberId, adminJunctionId));
  };

  const confirmPromoteToAdmin = (memberId: string, name: string) => {
    $q.dialog({
      title: 'Make Admin',
      message: `Promote ${name} to admin?`,
      cancel: true,
      persistent: true,
    }).onOk(() => promoteToAdmin(memberId));
  };

  const confirmPromoteToModerator = (memberId: string, name: string) => {
    $q.dialog({
      title: 'Make Moderator',
      message: `Promote ${name} to moderator?`,
      cancel: true,
      persistent: true,
    }).onOk(() => promoteToModerator(memberId));
  };

  const confirmPromoteModeratorToAdmin = (
    memberId: string,
    moderatorJunctionId: string,
    name: string,
  ) => {
    $q.dialog({
      title: 'Promote to Admin',
      message: `Promote ${name} from moderator to admin?`,
      cancel: true,
      persistent: true,
    }).onOk(() => promoteModeratorToAdmin(memberId, moderatorJunctionId));
  };

  const confirmDemoteModerator = (
    memberId: string,
    moderatorJunctionId: string,
    name: string,
  ) => {
    $q.dialog({
      title: 'Demote Moderator',
      message: `Demote ${name} to regular member?`,
      cancel: true,
      persistent: true,
    }).onOk(() => demoteModerator(memberId, moderatorJunctionId));
  };

  const confirmRemoveMember = (
    memberId: string,
    playerJunctionId: string,
    name: string,
    rating?: number,
  ) => {
    const player = MatchmakingApp.state.players[name];
    const isActive = !!player && !player.deletedAt;
    const activeStats = isActive
      ? `Games: ${player.matchesPlayed || 0} | Rating: ${player.rating || 1450}`
      : '';
    const ratingLine = rating ? `Rating: ${rating}` : '';
    const message = [
      `Remove ${name} from the club?`,
      ratingLine,
      activeStats,
      isActive ? 'This player is currently active in the session.' : '',
    ]
      .filter(Boolean)
      .join('\n');

    $q.dialog({
      title: 'Remove Member',
      message,
      cancel: true,
      persistent: true,
    }).onOk(() => removeClubMember(memberId, playerJunctionId));
  };

  const refreshClubMembers = async () => {
    if (!currentClubId.value) return;
    try {
      const result = await likhaClient.request(
        readItems('club', {
          filter: { clubId: { _eq: currentClubId.value } },
          fields: [
            'players.id',
            'players.directus_users_id.id',
            'players.directus_users_id.username',
            'players.directus_users_id.first_name',
            'players.directus_users_id.last_name',
            'players.directus_users_id.email',
            'players.directus_users_id.rating',
            'players.directus_users_id.dupr_id',
            'players.directus_users_id.avatar',
            'admins.id',
            'admins.directus_users_id.id',
            'admins.directus_users_id.email',
            'moderators.id',
            'moderators.directus_users_id.id',
            'moderators.directus_users_id.email',
          ] as unknown as string[],
          deep: {
            players: { _limit: -1 },
            admins: { _limit: -1 },
            moderators: { _limit: -1 },
          },
        }),
      );
      if (!result || result.length === 0) return;
      const club = result[0] as unknown as {
        players?: Array<{
          id: string;
          directus_users_id?: Record<string, unknown> | null;
        }>;
        admins?: Array<{
          id: string;
          directus_users_id?: { id?: string } | null;
        }>;
        moderators?: Array<{
          id: string;
          directus_users_id?: { id?: string } | null;
        }>;
      };
      clubAdminIds.value = new Set(
        (club.admins || [])
          .map((a) => a.directus_users_id?.id)
          .filter((id): id is string => !!id),
      );
      const adminJunctionMap = new Map<string, string>();
      (club.admins || []).forEach((a) => {
        const uid = a.directus_users_id?.id;
        if (uid && a.id) adminJunctionMap.set(uid, a.id);
      });
      const moderatorIdSet = new Set<string>();
      (club.moderators || []).forEach((m) => {
        const uid = m.directus_users_id?.id;
        if (uid) moderatorIdSet.add(uid);
      });
      const moderatorJunctionMap = new Map<string, string>();
      (club.moderators || []).forEach((m) => {
        const uid = m.directus_users_id?.id;
        if (uid && m.id) moderatorJunctionMap.set(uid, m.id);
      });
      clubMembers.value =
        (club.players || [])
          .map((p) => {
            const u = p.directus_users_id as Record<string, unknown> | null;
            const userId = typeof u?.id === 'string' ? u.id : '';
            const avatarId =
              typeof u?.avatar === 'string' ? u.avatar : undefined;
            return {
              id: userId,
              username:
                typeof u?.username === 'string' ? u.username : undefined,
              firstName:
                typeof u?.first_name === 'string' ? u.first_name : undefined,
              lastName:
                typeof u?.last_name === 'string' ? u.last_name : undefined,
              email: typeof u?.email === 'string' ? u.email : undefined,
              rating: typeof u?.rating === 'number' ? u.rating : undefined,
              isAdmin: clubAdminIds.value.has(userId),
              isModerator: moderatorIdSet.has(userId),
              avatar: avatarId
                ? `${likhaUrl.value}/assets/${avatarId}`
                : undefined,
              playerJunctionId: p.id || undefined,
              adminJunctionId: adminJunctionMap.get(userId) || undefined,
              moderatorJunctionId:
                moderatorJunctionMap.get(userId) || undefined,
            };
          })
          .filter((m) => m.id) || [];
    } catch (err) {
      console.warn('Failed to refresh club members:', err);
    }
  };

  return {
    filteredSortedMembers,
    adminMembers,
    moderatorMembers,
    regularMembers,
    adminMatchStats,
    removeClubMember,
    promoteToAdmin,
    demoteAdmin,
    promoteToModerator,
    demoteModerator,
    demoteAdminToModerator,
    promoteModeratorToAdmin,
    confirmDemoteAdmin,
    confirmPromoteToAdmin,
    confirmDemoteModerator,
    confirmPromoteToModerator,
    confirmPromoteModeratorToAdmin,
    confirmRemoveMember,
    refreshClubMembers,
  };
}
