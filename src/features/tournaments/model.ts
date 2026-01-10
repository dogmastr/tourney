export interface CustomTitle {
  id: string;
  name: string;
  color: string; // Hex color code
}

// Tiebreak types in default order
export type TiebreakType =
  | 'buchholzCut1'
  | 'buchholz'
  | 'sonnebornBerger'
  | 'progressive'
  | 'directEncounter'
  | 'wins'
  | 'winsWithBlack'
  | 'avgRatingCut1';

export const DEFAULT_TIEBREAK_ORDER: TiebreakType[] = [
  'buchholzCut1',
  'buchholz',
  'sonnebornBerger',
  'progressive',
  'directEncounter',
  'wins',
  'winsWithBlack',
  'avgRatingCut1',
];

export const TIEBREAK_LABELS: Record<TiebreakType, string> = {
  buchholzCut1: 'Buchholz Cut 1',
  buchholz: 'Buchholz',
  sonnebornBerger: 'Sonneborn-Berger',
  progressive: 'Progressive',
  directEncounter: 'Direct Encounter',
  wins: 'Number of Wins',
  winsWithBlack: 'Wins with Black',
  avgRatingCut1: 'Avg Rating of Opponents Cut 1',
};

export interface Tournament {
  id: string;
  name: string;
  system: string;
  byeValue: number;
  totalRounds: number;
  rated: boolean;
  customTitles?: CustomTitle[];
  tiebreakOrder?: TiebreakType[];
  createdAt: string;
  players: Player[];
  rounds: Round[];
  // Chess-results compatible fields
  organizers?: string;
  federation?: string;
  tournamentDirector?: string;
  chiefArbiter?: string;
  timeControl?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  location?: string;
  // Cloud sync fields
  creatorId?: string;
  creatorName?: string;
  playerDatabase?: Array<{ name: string; titles: string[]; rating: number }>;
}

export interface Player {
  id: string;
  name: string;
  titles?: string[];
  rating: number;
  initialRating?: number; // Rating at start of tournament (for rated tournaments)
  fideId?: number; // Optional FIDE ID (integer > 0)
  points: number;
  active: boolean;
  createdAt: string;
}

export interface Round {
  id: string;
  roundNumber: number;
  pairings: Pairing[];
  completed: boolean;
  playerPointsAtStart: Record<string, number>; // Player ID -> points at round start
  playerRatingsAtStart?: Record<string, number>; // Player ID -> rating at round start (for rated tournaments)
}

export interface Pairing {
  id: string;
  whitePlayerId: string;
  blackPlayerId: string | null; // null for bye
  result?: "1-0" | "0-1" | "1/2-1/2" | "1F-0F" | "0F-1F" | "0F-0F" | null;
}
