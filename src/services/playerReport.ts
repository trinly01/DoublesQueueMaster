import { likhaClient } from 'src/services/likhaClient';
import {
  createItem,
  readItems,
  readUsers,
  updateItem,
} from '@likha-erp/likha-sdk';

export type ReportType = 'report' | 'commend';

export interface ReportContent {
  items: string[];
  comments?: string;
}

export interface PlayerReport {
  id?: string;
  player: string;
  reporter: string;
  type: ReportType;
  content: ReportContent;
  comments?: string;
  club: string;
}

export interface ReportItem {
  key: string;
  label: string;
  description: string;
  icon: string;
}

export const REPORT_ITEMS: ReportItem[] = [
  {
    key: 'afk',
    label: 'No Hustle',
    description: 'Too lazy to pick up the ball or move to the kitchen line.',
    icon: 'pause_circle',
  },
  {
    key: 'feeding',
    label: 'Feeding',
    description: 'Hitting easy pop-ups for the enemy to smash.',
    icon: 'sports_tennis',
  },
  {
    key: 'sabotage',
    label: 'Sabotage',
    description: "Stealing the partner's shots and hitting them into the net.",
    icon: 'handshake',
  },
  {
    key: 'map_abuse',
    label: 'Map Abuse',
    description:
      'Refusing to move up to the Kitchen line (camping at the baseline).',
    icon: 'place',
  },
  {
    key: 'cheating',
    label: 'Cheating',
    description: 'Calling "Out" on balls that were clearly "In".',
    icon: 'gavel',
  },
  {
    key: 'toxicity',
    label: 'Toxicity',
    description: 'Throwing paddles or raging at teammates.',
    icon: 'sentiment_very_dissatisfied',
  },
  {
    key: 'voice_abuse',
    label: 'Voice Abuse',
    description: 'Giving non-stop, annoying coaching to their partner.',
    icon: 'record_voice_over',
  },
];

export const COMMEND_ITEMS: ReportItem[] = [
  {
    key: 'great_hustle',
    label: 'Great Hustle',
    description:
      'Chases down every shot with energy and never gives up on a point.',
    icon: 'directions_run',
  },
  {
    key: 'strategic_play',
    label: 'Strategic Play',
    description:
      'Consistently hits unattackable dinks and well-placed drops into the kitchen.',
    icon: 'psychology',
  },
  {
    key: 'great_synergy',
    label: 'Great Synergy',
    description:
      'Communicates well ("Yours/Mine!"), respects their partner, and covers the middle.',
    icon: 'groups',
  },
  {
    key: 'strong_positioning',
    label: 'Strong Positioning',
    description:
      'Always moves up to the Kitchen line at the right time and holds the advantage.',
    icon: 'place',
  },
  {
    key: 'honorable',
    label: 'Honorable / Fair Play',
    description:
      'Makes honest, fair line calls, even if it costs them the point.',
    icon: 'emoji_events',
  },
  {
    key: 'tilt_proof',
    label: 'Tilt-Proof',
    description:
      'Stays positive, encourages their partner, and keeps morale high when losing.',
    icon: 'mood',
  },
  {
    key: 'clear_comms',
    label: 'Clear Comms',
    description:
      'Calls the score clearly, communicates court switches, and supports without micromanaging.',
    icon: 'mic',
  },
];

/**
 * Submit or update a player report/commendation.
 * One record per (reporter, player, club, type).
 */
export async function submitPlayerReport(
  report: PlayerReport,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const existing = await likhaClient.request(
      readItems('report_player', {
        filter: {
          player: { _eq: report.player },
          reporter: { _eq: report.reporter },
          club: { _eq: report.club },
          type: { _eq: report.type },
        },
        fields: ['id'],
        limit: 1,
      }),
    );

    const payload = {
      player: report.player,
      reporter: report.reporter,
      type: report.type,
      content: report.content,
      comments: report.comments || null,
      club: report.club,
    };

    const records = (existing as { id: string }[]) || [];
    if (records.length > 0 && records[0]?.id) {
      await likhaClient.request(
        updateItem('report_player', records[0].id, payload),
      );
    } else {
      await likhaClient.request(createItem('report_player', payload));
    }

    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to submit report';
    console.error('submitPlayerReport error:', err);
    return { success: false, error: message };
  }
}

export interface FeedbackEntry {
  id: string;
  player: string;
  reporter: string;
  type: ReportType;
  content: ReportContent;
  comments?: string;
  club: string;
  dateCreated: string;
  date_created?: string;
  dateUpdated?: string;
  date_updated?: string;
}

/**
 * Load all feedback (reports and commendations) for a target player.
 */
export async function getPlayerFeedback(
  playerId: string,
): Promise<FeedbackEntry[]> {
  try {
    const result = await likhaClient.request(
      readItems('report_player', {
        filter: { player: { _eq: playerId } },
        fields: [
          'id',
          'player',
          'reporter',
          'type',
          'content',
          'comments',
          'club',
          'date_created',
          'date_updated',
        ],
        sort: ['-date_updated', '-date_created'],
      }),
    );
    return (result as FeedbackEntry[]).map((r) => ({
      ...r,
      dateCreated: r.dateCreated || r.date_created || new Date().toISOString(),
      dateUpdated:
        r.dateUpdated ||
        r.date_updated ||
        r.dateCreated ||
        r.date_created ||
        new Date().toISOString(),
    }));
  } catch (err) {
    console.error('getPlayerFeedback error:', err);
    return [];
  }
}

/**
 * Resolve a user's display name from their user id.
 */
export async function getUserName(userId: string): Promise<string | null> {
  try {
    const result = await likhaClient.request(
      readUsers({
        filter: { id: { _eq: userId } },
        fields: ['first_name', 'username'],
        limit: 1,
      }),
    );
    const users = result as Array<{ first_name?: string; username?: string }>;
    if (users.length === 0) return null;
    return users[0].first_name || users[0].username || null;
  } catch (err) {
    console.error('getUserName error:', err);
    return null;
  }
}

/**
 * Resolve a reporter's display name from their user id.
 */
export async function getReporterName(
  reporterId: string,
): Promise<string | null> {
  return getUserName(reporterId);
}

export interface ClubFeedbackEntry extends FeedbackEntry {
  playerName?: string;
  playerUsername?: string;
  reporterName?: string;
  reporterUsername?: string;
}

/**
 * Batch-resolve display info for many user ids in a single request.
 * Returns a map of userId → { name, username }; missing/failed lookups are
 * simply absent from the map (same degradation as getUserInfo's nulls).
 */
export async function getUsersInfo(
  userIds: string[],
): Promise<Map<string, { name: string | null; username: string | null }>> {
  const map = new Map<
    string,
    { name: string | null; username: string | null }
  >();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return map;
  try {
    const result = await likhaClient.request(
      readUsers({
        filter: { id: { _in: ids } },
        fields: ['id', 'first_name', 'username'],
        limit: -1,
      }),
    );
    const users = (result as Array<{
      id?: string;
      first_name?: string;
      username?: string;
    }>) || [];
    for (const user of users) {
      if (!user?.id) continue;
      map.set(user.id, {
        name: user.first_name || user.username || null,
        username: user.username || null,
      });
    }
  } catch (err) {
    console.error('getUsersInfo error:', err);
  }
  return map;
}

const EMPTY_USER_INFO = { name: null, username: null } as const;

/**
 * Load all feedback (reports and commendations) linked to a club.
 */
export async function getClubFeedback(
  clubId: string,
): Promise<ClubFeedbackEntry[]> {
  try {
    const result = await likhaClient.request(
      readItems('report_player', {
        filter: { club: { _eq: clubId } },
        fields: [
          'id',
          'player',
          'reporter',
          'type',
          'content',
          'comments',
          'club',
          'date_created',
          'date_updated',
        ],
        sort: ['-date_updated', '-date_created'],
      }),
    );
    const entries = (result as FeedbackEntry[]).map((r) => ({
      ...r,
      dateCreated: r.dateCreated || r.date_created || new Date().toISOString(),
      dateUpdated:
        r.dateUpdated ||
        r.date_updated ||
        r.dateCreated ||
        r.date_created ||
        new Date().toISOString(),
    }));
    // One batched users read for every referenced player+reporter —
    // previously this issued 2 readUsers calls per feedback entry.
    const userMap = await getUsersInfo(
      entries.flatMap((entry) => [entry.player, entry.reporter]),
    );
    return entries.map((entry) => {
      const player = userMap.get(entry.player) ?? EMPTY_USER_INFO;
      const reporter = userMap.get(entry.reporter) ?? EMPTY_USER_INFO;
      return {
        ...entry,
        playerName: player.name || undefined,
        playerUsername: player.username || undefined,
        reporterName: reporter.name || undefined,
        reporterUsername: reporter.username || undefined,
      };
    });
  } catch (err) {
    console.error('getClubFeedback error:', err);
    return [];
  }
}

export async function getUserInfo(
  userId: string,
): Promise<{ name: string | null; username: string | null }> {
  try {
    const result = await likhaClient.request(
      readUsers({
        filter: { id: { _eq: userId } },
        fields: ['first_name', 'username'],
        limit: 1,
      }),
    );
    const users = result as Array<{
      first_name?: string;
      username?: string;
    }>;
    if (users.length === 0) return { name: null, username: null };
    const user = users[0];
    return {
      name: user.first_name || user.username || null,
      username: user.username || null,
    };
  } catch (err) {
    console.error('getUserInfo error:', err);
    return { name: null, username: null };
  }
}
