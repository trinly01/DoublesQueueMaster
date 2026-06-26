// Player utility functions - extracted to reduce duplication

import { Player } from '../services/matchmaking';

// We also need a UI-level representation for Queue to show wait times
export interface UIQueueEntry {
  player: Player;
  queueType: 'GENERAL' | 'WINNERS' | 'LOSERS';
  enteredAt: number;
}

export interface UIMatch {
  id: string; // from matchId
  teamA: Player[];
  teamB: Player[];
  status: 'waiting' | 'in-progress' | 'completed';
  court?: number;
  order: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  queueSource?: string;
  expectedDifference?: number;
  winProbability?: number; // Team A win probability (0-1)
}

/**
 * Get forecast chip color based on win probability (0-1).
 * 50% = grey, >50% = green shade 1-10, <50% = red shade 1-10.
 */
export const getForecastColor = (prob: number): string => {
  const margin = Math.abs(prob - 0.5);
  if (margin < 0.01) return 'grey-6';
  const shade = Math.min(10, Math.max(1, Math.ceil(margin * 20)));
  return prob > 0.5 ? `green-${shade}` : `red-${shade}`;
};

/**
 * Get the color for a player level
 */
export const getLevelColor = (level: 1 | 2 | 3): string => {
  switch (level) {
    case 1:
      return 'green-6'; // Beginner - Green shade 6
    case 2:
      return 'orange-7'; // Intermediate - Orange shade 7
    case 3:
      return 'red-8'; // Advanced - Red shade 8
    default:
      return 'grey-5';
  }
};

/**
 * Get the color for a player rating.
 * Tiers: Beginner, Intermediate, Advanced, Expert, Pro.
 */
export const getRatingColor = (rating: number): string => {
  if (rating < 1400) return 'grey-6'; // Beginner
  if (rating < 1700) return 'blue-6'; // Intermediate
  if (rating < 1900) return 'green-6'; // Advanced
  if (rating < 2100) return 'amber-7'; // Expert
  return 'red-7'; // Pro
};

/**
 * Get the category name for a player rating.
 * Tiers: Beginner, Intermediate, Advanced, Expert, Pro.
 */
export const getRatingCategory = (rating: number): string => {
  if (rating < 1400) return 'Beginner';
  if (rating < 1700) return 'Intermediate';
  if (rating < 1900) return 'Advanced';
  if (rating < 2100) return 'Expert';
  return 'Pro';
};

/**
 * Get the icon for a player level
 */
export const getLevelIcon = (level: 1 | 2 | 3): string => {
  switch (level) {
    case 1:
      return 'star_border';
    case 2:
      return 'star_half';
    case 3:
      return 'star';
    default:
      return 'star_outline';
  }
};

/**
 * Get queue time information for a player
 */
export const getQueueTimeInfo = (enteredAt: number): string => {
  const now = Date.now();
  const diff = now - enteredAt;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just joined';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

/**
 * Get match status color
 */
export const getMatchStatusColor = (status: string): string => {
  switch (status) {
    case 'waiting':
      return 'grey-6';
    case 'in-progress':
      return 'red-6';
    case 'completed':
      return 'blue-6';
    default:
      return 'grey-6';
  }
};

/**
 * Get match status label
 */
export const getMatchStatusLabel = (status: string): string => {
  switch (status) {
    case 'waiting':
      return 'Waiting';
    case 'in-progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    default:
      return 'Unknown';
  }
};

/**
 * Calculate team skill level
 */
export const getTeamSkill = (team: Player[]): number => {
  return team.reduce((sum, p) => sum + p.level, 0);
};

/**
 * Calculate skill difference between teams
 */
export const getSkillDifference = (
  team1: Player[],
  team2: Player[],
): number => {
  return Math.abs(getTeamSkill(team1) - getTeamSkill(team2));
};

/**
 * Check if teams are balanced (within 1 skill point)
 */
export const isBalanced = (team1: Player[], team2: Player[]): boolean => {
  return getSkillDifference(team1, team2) <= 1;
};

/**
 * Get balance indicator color
 */
export const getBalanceColor = (team1: Player[], team2: Player[]): string => {
  const diff = getSkillDifference(team1, team2);
  if (diff === 0) return 'green';
  if (diff === 1) return 'light-green';
  if (diff === 2) return 'orange';
  return 'red';
};

/**
 * Get balance indicator icon
 */
export const getBalanceIcon = (team1: Player[], team2: Player[]): string => {
  const diff = getSkillDifference(team1, team2);
  if (diff === 0) return 'verified';
  if (diff === 1) return 'check_circle';
  if (diff === 2) return 'warning';
  return 'error';
};

/**
 * Get balance indicator text
 */
export const getBalanceText = (team1: Player[], team2: Player[]): string => {
  const diff = getSkillDifference(team1, team2);
  if (diff === 0) return 'Perfect Balance';
  if (diff === 1) return 'Well Balanced';
  if (diff === 2) return 'Slightly Unbalanced';
  return 'Very Unbalanced';
};

/**
 * Get queue statistics
 */
export const getQueueStats = (queue: Player[]) => {
  const total = queue.length;
  const level1 = queue.filter((p) => p.level === 1).length;
  const level2 = queue.filter((p) => p.level === 2).length;
  const level3 = queue.filter((p) => p.level === 3).length;

  return { total, level1, level2, level3 };
};

/**
 * Calculate how many matches can be generated
 */
export const calculateMatchCapacity = (
  playerCount: number,
  matchType: 'singles' | 'doubles',
): {
  maxMatches: number;
  remainingPlayers: number;
  canGenerate: boolean;
} => {
  const requiredPlayers = matchType === 'singles' ? 2 : 4;
  const maxMatches = Math.floor(playerCount / requiredPlayers);
  const remainingPlayers = playerCount % requiredPlayers;

  return {
    maxMatches,
    remainingPlayers,
    canGenerate: playerCount >= requiredPlayers,
  };
};

/**
 * Generate court selection options
 */
export const generateCourtOptions = (
  courtCount: number,
): Array<{ label: string; value: number }> => {
  return Array.from({ length: courtCount }, (_, i) => ({
    label: `Court ${i + 1}`,
    value: i + 1,
  }));
};

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Format an ISO date to a readable date string: "17 Jun '26"
 */
export const formatDateOnly = (iso: string): string => {
  const d = new Date(iso);
  const year = String(d.getFullYear()).slice(-2);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} '${year}`;
};

/**
 * Format an ISO date to a readable string: "17 Jun '26, 8:22 PM"
 */
export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  const year = String(d.getFullYear()).slice(-2);
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} '${year}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
};

/**
 * Wilson score lower-bound confidence interval.
 * Best-practice ranking for a positive rate with unequal sample sizes.
 * z = 1.96 corresponds to ~95% confidence.
 */
export const wilsonLowerBound = (successes: number, total: number): number => {
  if (total === 0) return 0;
  const z = 1.96;
  const p = successes / total;
  const z2 = z * z;
  return (
    (p +
      z2 / (2 * total) -
      z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) /
    (1 + z2 / total)
  );
};

/**
 * Composite leaderboard score based on rating and win/loss record.
 * Formula: 0.6 * rating + 50 * (wins - losses) / sqrt(wins + losses)
 */
export const computeCompositeScore = (
  rating: number,
  wins: number,
  losses: number,
): number => {
  const games = wins + losses;
  if (games === 0) return 0;
  return 0.6 * rating + (50 * (wins - losses)) / Math.sqrt(games);
};

export const resolveAvatarUrl = (
  avatar?: string | null,
  baseUrl = 'https://dink-it.zyberlab.com',
): string | undefined => {
  if (!avatar) return undefined;
  const s = String(avatar);
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return `${baseUrl}/assets/${s}`;
};
