export interface MatchMeta {
  generatedBy?: string;
  editedBy?: string;
  scoredBy?: string;
  cancelledBy?: string;
  matchmakingMode?: string;
  generationType?: 'auto' | 'manual';
  isEdited?: boolean;
  originalMatchup?: string;
  originalTeamA?: string;
  originalTeamB?: string;
}
