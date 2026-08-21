export interface MatchMeta {
  generatedBy?: string;
  editedBy?: string;
  scoredBy?: string;
  cancelledBy?: string;
  matchmakingMode?: string;
  generationType?: 'auto' | 'manual';
  isEdited?: boolean;
  editedAt?: number;
  originalMatchup?: string;
  originalTeamA?: string;
  originalTeamB?: string;
  createdAt?: Date | string | number;
  updatedAt?: Date | string | number;
}
