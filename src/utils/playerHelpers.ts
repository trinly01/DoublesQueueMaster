// Player utility functions - extracted to reduce duplication

export interface Player {
  name: string;
  level: 1 | 2 | 3;
  gamesPlayed: number;
  wins: number;
  losses: number;
  queuePosition?: number;
  originalQueueTime?: Date;
  lastMatchTime?: Date;
  priority?: 'normal' | 'high' | 'returned';
}

export interface Match {
  id: string;
  players: Player[];
  status: 'waiting' | 'in-progress' | 'completed';
  court?: number;
  order: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

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
export const getQueueTimeInfo = (player: Player): string => {
  if (player.priority === 'returned') {
    return 'Recently returned';
  }
  if (player.originalQueueTime) {
    const now = new Date();
    const diff = now.getTime() - new Date(player.originalQueueTime).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just joined';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }
  return 'In queue';
};

/**
 * Get match status color
 */
export const getMatchStatusColor = (status: string): string => {
  switch (status) {
    case 'waiting':
      return 'grey-6';
    case 'in-progress':
      return 'green-6';
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
 * Sort players by various criteria
 */
export const sortPlayers = (players: Player[], sortBy: string): Player[] => {
  return [...players].sort((a, b) => {
    switch (sortBy) {
      case 'gamesPlayed':
        return b.gamesPlayed - a.gamesPlayed;
      case 'wins':
        return b.wins - a.wins;
      case 'losses':
        return b.losses - a.losses;
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return a.name.localeCompare(b.name);
    }
  });
};

/**
 * Filter matches by court
 */
export const filterMatchesByCourt = (
  matches: Match[],
  courtFilter: string | number,
): Match[] => {
  if (courtFilter === 'all') {
    return matches;
  }
  return matches.filter((match) => match.court === courtFilter);
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
