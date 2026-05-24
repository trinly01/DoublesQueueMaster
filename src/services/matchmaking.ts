import { reactive } from 'vue';

/**
 * ==========================================
 * 1. PWA LOCAL STORAGE ENTITIES
 * ==========================================
 */

export interface Player {
  username: string;     // Unique identifier
  name?: string;        // Optional alias for UI compatibility
  level: 1 | 2 | 3;     // Added for manual matchmaking and UI labels
  rating: number;       // Defaults to 1500
  matchesPlayed: number; // Defaults to 0
  wins: number;
  losses: number;
  priority?: string;
}

export interface QueueEntry {
  username: string;
  queueType: 'GENERAL' | 'WINNERS' | 'LOSERS';
  enteredAt: number;     // Timestamp for FIFO ordering
}

export interface ActiveMatch {
  matchId: string;       // Simple random string to identify the court/game
  queueSource: 'GENERAL' | 'WINNERS' | 'LOSERS' | 'MANUAL';
  teamA: string[];       // Array of usernames
  teamB: string[];       // Array of usernames
  expectedDifference: number;
  status: 'waiting' | 'in-progress' | 'completed';
  court?: number;
  createdAt?: number;
}

export interface AppState {
  teamSize: number;
  players: Record<string, Player>; // Dictionary of all players ever registered
  queues: QueueEntry[];            // Players currently waiting to play
  activeMatches: ActiveMatch[];    // Matches currently happening on the court
}

const STORAGE_KEY = 'quasar_matchmaking_state';

/**
 * ==========================================
 * 2. INDIVIDUAL RATING ALGORITHM
 * ==========================================
 * Pure math function. Aggressive decaying volatility for fast accuracy.
 */
export const RatingEngine = {
  calculateShift: (winners: Player[], losers: Player[], scoreW: number, scoreL: number) => {
    const avgW = winners.reduce((sum, p) => sum + p.rating, 0) / winners.length;
    const avgL = losers.reduce((sum, p) => sum + p.rating, 0) / losers.length;
    const expectedW = 1 / (1 + Math.pow(10, (avgL - avgW) / 400));
    const multiplier = 1 + (Math.abs(scoreW - scoreL) * 0.1);

    const applyToPlayer = (player: Player, isWinner: boolean): Player => {
      // Fast-Track Accuracy: K drops from 80 -> 60 -> 40 -> 20 over first 3 games
      const K = Math.max(20, 80 - (player.matchesPlayed * 20)); 
      const outcome = isWinner ? 1 : 0;
      const shift = K * multiplier * (outcome - expectedW);

      return {
        ...player,
        rating: Math.round(player.rating + shift),
        matchesPlayed: player.matchesPlayed + 1,
        wins: (player.wins || 0) + (isWinner ? 1 : 0),
        losses: (player.losses || 0) + (isWinner ? 0 : 1)
      };
    };

    return {
      updatedWinners: winners.map(p => applyToPlayer(p, true)),
      updatedLosers: losers.map(p => applyToPlayer(p, false))
    };
  }
};

/**
 * ==========================================
 * 3. BALANCED MATCHMAKING ALGORITHM
 * ==========================================
 * Pure function to calculate fairest Top-K combinations.
 */
export const MatchmakerEngine = {
  getCombinations: (players: Player[], teamSize: number) => {
    const combinations: { teamA: Player[], teamB: Player[] }[] = [];
    const playerZero = players[0];
    const rest = players.slice(1);

    const pick = (pool: Player[], needed: number, currentTeam: Player[]) => {
      if (needed === 0) {
        const teamA = [playerZero, ...currentTeam];
        const teamB = players.filter(p => !teamA.some(a => a.username === p.username));
        combinations.push({ teamA, teamB });
        return;
      }
      for (let i = 0; i <= pool.length - needed; i++) {
        pick(pool.slice(i + 1), needed - 1, [...currentTeam, pool[i]]);
      }
    };

    pick(rest, teamSize - 1, []);
    return combinations;
  },

  draftBalancedMatch: (players: Player[], teamSize: number) => {
    const allMatchups = MatchmakerEngine.getCombinations(players, teamSize);

    const evaluated = allMatchups.map(matchup => {
      const avgA = matchup.teamA.reduce((sum, p) => sum + p.rating, 0) / teamSize;
      const avgB = matchup.teamB.reduce((sum, p) => sum + p.rating, 0) / teamSize;
      return { ...matchup, expectedDifference: Math.abs(avgA - avgB) };
    });

    evaluated.sort((a, b) => a.expectedDifference - b.expectedDifference);

    // Pick randomly from the top 3 fairest combinations to prevent stale teams
    const poolSize = Math.min(3, evaluated.length);
    return evaluated[Math.floor(Math.random() * poolSize)];
  }
};

/**
 * ==========================================
 * 4. PWA LOCAL STORAGE MANAGER
 * ==========================================
 * The main service you will use in your Vue components.
 */
export class LocalMatchmakingSystem {
  public state: AppState;
  public onStateChange: (() => void) | null = null;

  constructor(defaultTeamSize: number = 2) {
    const initialState = this.loadState() || {
      teamSize: defaultTeamSize,
      players: {},
      queues: [],
      activeMatches: []
    };
    this.state = reactive(initialState);
  }

  // --- INTERNAL STORAGE METHODS ---
  private saveState() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      if (this.onStateChange) {
        this.onStateChange();
      }
    }
  }

  private loadState(): AppState | null {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    }
    return null;
  }

  // Helper to completely wipe data (Useful for "End Session" button in UI)
  public clearSession() {
    this.state.queues = [];
    this.state.activeMatches = [];
    this.saveState();
  }

  public hardResetEverything() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    this.state.players = {};
    this.state.queues = [];
    this.state.activeMatches = [];
  }

  // --- PUBLIC API FOR UI (VUE COMPONENTS) ---

  // 1. Register or Check-In a Player to the court
  public checkInPlayer(username: string, level: 1 | 2 | 3 = 1) {
    const normalizedUsername = username.trim();
    
    // Create player profile if they don't exist in the local database
    if (!this.state.players[normalizedUsername]) {
      this.state.players[normalizedUsername] = {
        username: normalizedUsername,
        level: level,
        rating: 1500,
        matchesPlayed: 0,
        wins: 0,
        losses: 0
      };
    } else {
        // if they do exist, just update the level
        this.state.players[normalizedUsername].level = level;
    }

    // Prevent adding if already in queue or currently playing
    const inQueue = this.state.queues.some(q => q.username === normalizedUsername);
    const inMatch = this.state.activeMatches.some(m => m.teamA.includes(normalizedUsername) || m.teamB.includes(normalizedUsername));
    
    if (!inQueue && !inMatch) {
      this.state.queues.push({
        username: normalizedUsername,
        queueType: 'GENERAL',
        enteredAt: Date.now()
      });
      this.saveState();
    }
  }
  
  public removeFromQueue(username: string) {
    this.state.queues = this.state.queues.filter(q => q.username !== username);
    this.saveState();
  }

  // 2. Draft the next round of matches from waiting players
  public draftNextMatches(priorityMode: string = 'timestamp') {
    const playersNeeded = this.state.teamSize * 2;

    const sortFn = (a: QueueEntry, b: QueueEntry) => {
      if (priorityMode === 'gamesPlayed') {
        const playerA = this.state.players[a.username];
        const playerB = this.state.players[b.username];
        if (playerA && playerB && playerA.matchesPlayed !== playerB.matchesPlayed) {
          return playerA.matchesPlayed - playerB.matchesPlayed;
        }
      }
      return a.enteredAt - b.enteredAt;
    };

    const prioritizedQueue = [...this.state.queues].sort(sortFn);

    while (prioritizedQueue.length >= playersNeeded) {
      let draftedEntries: QueueEntry[] = [];
      
      const winners = prioritizedQueue.filter(q => q.queueType === 'WINNERS');
      const losers = prioritizedQueue.filter(q => q.queueType === 'LOSERS');
      const general = prioritizedQueue.filter(q => q.queueType === 'GENERAL');
      
      // Find all groups that have enough players to form a match
      const validGroups = [];
      if (winners.length >= playersNeeded) validGroups.push(winners);
      if (losers.length >= playersNeeded) validGroups.push(losers);
      if (general.length >= playersNeeded) validGroups.push(general);
      
      if (validGroups.length > 0) {
         // Find the group that contains the player who has been waiting longest in prioritizedQueue
         let bestGroup = validGroups[0];
         let bestIndex = prioritizedQueue.length;
         
         for (const group of validGroups) {
           const index = prioritizedQueue.findIndex(q => q.username === group[0].username);
           if (index < bestIndex) {
             bestIndex = index;
             bestGroup = group;
           }
         }
         draftedEntries = bestGroup.slice(0, playersNeeded);
      } else {
         // Fallback to drafting from top of queue if no pure group has enough
         draftedEntries = prioritizedQueue.slice(0, playersNeeded);
      }

      const draftedUsernames = draftedEntries.map(e => e.username);
      
      // Remove drafted entries from the temporary priority array for the next iteration
      for (let i = prioritizedQueue.length - 1; i >= 0; i--) {
        if (draftedUsernames.includes(prioritizedQueue[i].username)) {
           prioritizedQueue.splice(i, 1);
        }
      }
      
      // Hydrate usernames into full Player objects
      const playersToBalance = draftedEntries.map(entry => this.state.players[entry.username]);

      // Remove these players from the global queue
      this.state.queues = this.state.queues.filter(q => !draftedUsernames.includes(q.username));

      // Generate the match
      const match = MatchmakerEngine.draftBalancedMatch(playersToBalance, this.state.teamSize);
      
      // Determine the dominant queue source for the UI tag (just use the first player's type)
      const dominantSource = draftedEntries[0].queueType || 'GENERAL';

      // Push to active matches
      this.state.activeMatches.push({
        matchId: Math.random().toString(36).substring(2, 9), // Simple local ID
        queueSource: dominantSource as 'GENERAL' | 'WINNERS' | 'LOSERS' | 'MANUAL',
        teamA: match.teamA.map(p => p.username),
        teamB: match.teamB.map(p => p.username),
        expectedDifference: match.expectedDifference,
        status: 'waiting',
        createdAt: Date.now()
      });
    }

    this.saveState();
  }

  // 3. Report a score for an active match
  public reportMatchScore(matchId: string, teamAScore: number, teamBScore: number, returnMethod: string = 'end_of_queue') {
    const matchIndex = this.state.activeMatches.findIndex(m => m.matchId === matchId);
    if (matchIndex === -1) return;

    const match = this.state.activeMatches[matchIndex];
    
    // Hydrate players from usernames
    const teamA = match.teamA.map(u => this.state.players[u]);
    const teamB = match.teamB.map(u => this.state.players[u]);

    const teamAWon = teamAScore > teamBScore;
    const winners = teamAWon ? teamA : teamB;
    const losers = teamAWon ? teamB : teamA;
    const scoreW = teamAWon ? teamAScore : teamBScore;
    const scoreL = teamAWon ? teamBScore : teamAScore;

    // Apply Math
    const { updatedWinners, updatedLosers } = RatingEngine.calculateShift(winners, losers, scoreW, scoreL);

    // Save new ratings to dictionary
    updatedWinners.forEach(p => this.state.players[p.username] = p);
    updatedLosers.forEach(p => this.state.players[p.username] = p);

    let winnerEnteredAt = Date.now();
    let loserEnteredAt = Date.now();
    
    if (returnMethod === 'fairness_first') {
      winnerEnteredAt = 0;
      loserEnteredAt = 0;
    }

    // Send Winners back to Winners Queue (only if they aren't somehow already there)
    updatedWinners.forEach(p => {
      if (!this.state.queues.some(q => q.username === p.username)) {
         this.state.queues.push({ username: p.username, queueType: 'WINNERS', enteredAt: winnerEnteredAt });
      }
    });

    // Send Losers back to Losers Queue
    updatedLosers.forEach(p => {
      if (!this.state.queues.some(q => q.username === p.username)) {
         this.state.queues.push({ username: p.username, queueType: 'LOSERS', enteredAt: loserEnteredAt });
      }
    });

    // Remove match from active list
    this.state.activeMatches.splice(matchIndex, 1);
    
    this.saveState();
  }
  
  public persist() {
      this.saveState();
  }
}

// Export a singleton instance so it can be easily imported into any Vue Component
export const MatchmakingApp = new LocalMatchmakingSystem(2); // Initialize for Doubles by default
