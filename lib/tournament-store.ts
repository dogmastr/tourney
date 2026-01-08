export interface CustomTitle {
  id: string;
  name: string;
  color: string; // Hex color code
}

import { generateFIDEDutchPairings } from './swiss-pairing';

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
  allowChangingResults: boolean;
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
}

export interface Pairing {
  id: string;
  whitePlayerId: string;
  blackPlayerId: string | null; // null for bye
  result?: "1-0" | "0-1" | "1/2-1/2" | "1F-0F" | "0F-1F" | "0F-0F" | null;
}

const STORAGE_KEY = "tournament-manager-tournaments";

export function getAllTournaments(): Tournament[] {
  if (typeof window === "undefined") return [];

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function getTournament(id: string): Tournament | null {
  const tournaments = getAllTournaments();
  const tournament = tournaments.find((t) => t.id === id);
  if (!tournament) return null;

  // Migrate old tournaments to include allowChangingResults
  if (tournament.allowChangingResults === undefined) {
    tournament.allowChangingResults = false;
    saveTournament(tournament);
  }

  // Migrate old players to include active field
  let needsSave = false;
  tournament.players.forEach(player => {
    if (player.active === undefined) {
      player.active = true;
      needsSave = true;
    }

    // Migrate old single title to titles array
    const playerAny = player as any;
    if (playerAny.title !== undefined && !player.titles) {
      player.titles = playerAny.title ? [playerAny.title] : [];
      delete playerAny.title;
      needsSave = true;
    }
  });

  // Migrate old tournaments to include customTitles
  if (tournament.customTitles === undefined) {
    tournament.customTitles = [];
    needsSave = true;
  }

  if (needsSave) {
    saveTournament(tournament);
  }

  return tournament;
}

export function saveTournament(tournament: Tournament): void {
  if (typeof window === "undefined") return;

  const tournaments = getAllTournaments();
  const index = tournaments.findIndex((t) => t.id === tournament.id);

  if (index >= 0) {
    tournaments[index] = tournament;
  } else {
    tournaments.push(tournament);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(tournaments));
}

export function createTournament(data: {
  name: string;
  system: string;
  byeValue: number;
  totalRounds: number;
}): Tournament {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const tournament: Tournament = {
    id: crypto.randomUUID(),
    name: data.name,
    system: data.system,
    byeValue: data.byeValue,
    totalRounds: data.totalRounds,
    allowChangingResults: false,
    customTitles: [],
    createdAt: new Date().toISOString(),
    players: [],
    rounds: [],
    // Default values for tournament info
    startDate: today,
    endDate: today,
    timeControl: "10+0",
    location: "Singapore",
    federation: "Singapore",
  };

  saveTournament(tournament);
  return tournament;
}

/**
 * Create a tournament and sync to DynamoDB cloud storage
 * This is the preferred method when user is authenticated
 */
export async function createTournamentAsync(
  data: {
    name: string;
    system: string;
    byeValue: number;
    totalRounds: number;
  },
  userId: string,
  userName?: string
): Promise<Tournament> {
  // Import dynamically to avoid circular dependencies
  const { syncTournamentToCloud } = await import('./tournament-sync');

  const today = new Date().toISOString().split('T')[0];
  const tournament: Tournament = {
    id: crypto.randomUUID(),
    name: data.name,
    system: data.system,
    byeValue: data.byeValue,
    totalRounds: data.totalRounds,
    allowChangingResults: false,
    customTitles: [],
    createdAt: new Date().toISOString(),
    players: [],
    rounds: [],
    startDate: today,
    endDate: today,
    timeControl: "10+0",
    location: "Singapore",
    federation: "Singapore",
    // Cloud sync fields
    creatorId: userId,
    creatorName: userName,
  };

  // Sync to cloud (this is the primary storage now)
  await syncTournamentToCloud(tournament, userId, userName);

  return tournament;
}

/**
 * Save tournament changes and sync to cloud if creatorId exists
 */
export async function saveTournamentAsync(tournament: Tournament): Promise<void> {
  if (tournament.creatorId) {
    const { syncTournamentToCloud } = await import('./tournament-sync');
    await syncTournamentToCloud(tournament, tournament.creatorId, tournament.creatorName);
  }
}

/**
 * Delete tournament and remove from cloud if creatorId exists
 */
export async function deleteTournamentAsync(tournamentId: string, creatorId?: string): Promise<void> {
  if (creatorId) {
    const { deleteTournamentFromCloud } = await import('./tournament-sync');
    await deleteTournamentFromCloud(tournamentId);
  }
}


export function addPlayerToTournament(tournamentId: string, player: Omit<Player, "id" | "createdAt" | "points" | "active">): Player {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const newPlayer: Player = {
    id: crypto.randomUUID(),
    ...player,
    titles: player.titles || [],
    points: 0,
    active: true,
    createdAt: new Date().toISOString(),
  };

  tournament.players.push(newPlayer);
  saveTournament(tournament);

  return newPlayer;
}

export function removePlayerFromTournament(tournamentId: string, playerId: string): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  tournament.players = tournament.players.filter((p) => p.id !== playerId);
  saveTournament(tournament);
}

export function deactivatePlayer(tournamentId: string, playerId: string): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const player = tournament.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }

  player.active = false;
  saveTournament(tournament);
}

export function activatePlayer(tournamentId: string, playerId: string): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const player = tournament.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }
  player.active = true;
  saveTournament(tournament);
}

export function updatePlayer(
  tournamentId: string,
  playerId: string,
  updates: { name?: string; rating?: number; titles?: string[]; fideId?: number | null }
): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const player = tournament.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }

  if (updates.name !== undefined) {
    player.name = updates.name.trim();
  }
  if (updates.rating !== undefined) {
    if (updates.rating <= 0) {
      throw new Error("Rating must be greater than 0");
    }
    player.rating = updates.rating;
  }
  if (updates.titles !== undefined) {
    player.titles = updates.titles.length > 0 ? updates.titles : [];
  }
  if ('fideId' in updates) {
    if (updates.fideId === null || updates.fideId === undefined) {
      player.fideId = undefined;
    } else if (updates.fideId > 0 && Number.isInteger(updates.fideId)) {
      player.fideId = updates.fideId;
    } else {
      throw new Error("FIDE ID must be a positive integer");
    }
  }

  saveTournament(tournament);
}

export function deleteTournament(tournamentId: string): void {
  if (typeof window === "undefined") return;

  const tournaments = getAllTournaments();
  const filtered = tournaments.filter((t) => t.id !== tournamentId);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function updateTournamentName(tournamentId: string, name: string): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  tournament.name = name;
  saveTournament(tournament);
}

export function addCustomTitle(
  tournamentId: string,
  title: { name: string; color: string }
): CustomTitle {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  if (!tournament.customTitles) {
    tournament.customTitles = [];
  }

  const newTitle: CustomTitle = {
    id: crypto.randomUUID(),
    name: title.name.trim(),
    color: title.color,
  };

  tournament.customTitles.push(newTitle);
  saveTournament(tournament);

  return newTitle;
}

export function updateCustomTitle(
  tournamentId: string,
  titleId: string,
  updates: { name?: string; color?: string }
): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  if (!tournament.customTitles) {
    throw new Error("Custom titles not found");
  }

  const title = tournament.customTitles.find(t => t.id === titleId);
  if (!title) {
    throw new Error("Custom title not found");
  }

  if (updates.name !== undefined) {
    title.name = updates.name.trim();
  }
  if (updates.color !== undefined) {
    title.color = updates.color;
  }

  saveTournament(tournament);
}

export function removeCustomTitle(tournamentId: string, titleId: string): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  if (!tournament.customTitles) {
    return;
  }

  // Find the title name before removing it
  const titleToRemove = tournament.customTitles.find(t => t.id === titleId);
  if (!titleToRemove) {
    return; // Title not found, nothing to do
  }

  // Remove this title from all players who have it
  tournament.players.forEach(player => {
    if (player.titles && player.titles.includes(titleToRemove.name)) {
      player.titles = player.titles.filter(t => t !== titleToRemove.name);
    }
  });

  // Remove the custom title from the tournament
  tournament.customTitles = tournament.customTitles.filter(t => t.id !== titleId);
  saveTournament(tournament);
}


export function updateTournamentSettings(
  tournamentId: string,
  settings: {
    byeValue?: number;
    allowChangingResults?: boolean;
    totalRounds?: number;
    tiebreakOrder?: TiebreakType[];
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
  }
): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  if (settings.byeValue !== undefined) {
    if (![0, 0.5, 1].includes(settings.byeValue)) {
      throw new Error("Bye value must be 0, 0.5, or 1");
    }
    tournament.byeValue = settings.byeValue;
  }

  if (settings.allowChangingResults !== undefined) {
    tournament.allowChangingResults = settings.allowChangingResults;
  }

  if (settings.totalRounds !== undefined) {
    if (settings.totalRounds < 0 || !Number.isInteger(settings.totalRounds)) {
      throw new Error("Total rounds must be a non-negative integer");
    }
    if (settings.totalRounds < tournament.rounds.length) {
      throw new Error(`Total rounds cannot be less than the current number of rounds (${tournament.rounds.length})`);
    }
    tournament.totalRounds = settings.totalRounds;
  }

  if (settings.tiebreakOrder !== undefined) {
    tournament.tiebreakOrder = settings.tiebreakOrder;
  }

  // Update chess-results compatible fields
  if (settings.organizers !== undefined) tournament.organizers = settings.organizers;
  if (settings.federation !== undefined) tournament.federation = settings.federation;
  if (settings.tournamentDirector !== undefined) tournament.tournamentDirector = settings.tournamentDirector;
  if (settings.chiefArbiter !== undefined) tournament.chiefArbiter = settings.chiefArbiter;
  if (settings.timeControl !== undefined) tournament.timeControl = settings.timeControl;
  if (settings.startDate !== undefined) tournament.startDate = settings.startDate;
  if (settings.startTime !== undefined) tournament.startTime = settings.startTime;
  if (settings.endDate !== undefined) tournament.endDate = settings.endDate;
  if (settings.endTime !== undefined) tournament.endTime = settings.endTime;
  if (settings.location !== undefined) tournament.location = settings.location;

  saveTournament(tournament);
}


export function createRound(tournamentId: string): Round {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  // Check if there are at least 2 active players
  const activePlayers = tournament.players.filter(p => p.active);
  if (activePlayers.length < 2) {
    throw new Error("You need at least 2 active players to create a round");
  }

  // Check if previous round is completed
  if (tournament.rounds.length > 0) {
    const lastRound = tournament.rounds[tournament.rounds.length - 1];
    if (!lastRound.completed) {
      throw new Error("Previous round must be completed before creating a new round");
    }
    const incompletePairings = lastRound.pairings.filter(p => !p.result);
    if (incompletePairings.length > 0) {
      throw new Error("All results from the previous round must be entered");
    }
  }

  // Store player points at the start of this round
  const playerPointsAtStart: Record<string, number> = {};
  tournament.players.forEach(player => {
    playerPointsAtStart[player.id] = player.points;
  });

  // Use FIDE Dutch Swiss pairing algorithm
  const pairings = generateFIDEDutchPairings(tournament);

  // Apply bye results and points
  for (const pairing of pairings) {
    if (pairing.blackPlayerId === null) {
      // Set bye result based on tournament byeValue
      let byeResult: "1-0" | "0-1" | "1/2-1/2";
      if (tournament.byeValue === 1) {
        byeResult = "1-0";
      } else if (tournament.byeValue === 0) {
        byeResult = "0-1";
      } else {
        byeResult = "1/2-1/2";
      }
      pairing.result = byeResult;

      // Award bye points immediately
      const byePlayer = tournament.players.find(p => p.id === pairing.whitePlayerId);
      if (byePlayer) {
        byePlayer.points += tournament.byeValue;
      }
    }
  }

  const newRound: Round = {
    id: crypto.randomUUID(),
    roundNumber: tournament.rounds.length + 1,
    pairings,
    completed: false,
    playerPointsAtStart,
  };

  tournament.rounds.push(newRound);
  saveTournament(tournament);

  return newRound;
}

export function updatePairingResult(
  tournamentId: string,
  roundId: string,
  pairingId: string,
  result: "1-0" | "0-1" | "1/2-1/2" | "1F-0F" | "0F-1F" | "0F-0F" | null
): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const round = tournament.rounds.find(r => r.id === roundId);
  if (!round) {
    throw new Error("Round not found");
  }

  // Check if changing results is allowed
  if (!tournament.allowChangingResults && round.completed) {
    throw new Error("Changing results is not allowed for completed rounds");
  }

  const pairing = round.pairings.find(p => p.id === pairingId);
  if (!pairing) {
    throw new Error("Pairing not found");
  }

  // Update result
  pairing.result = result;

  // Handle bye result format
  if (!pairing.blackPlayerId && result) {
    // Bye result should match the bye value format
    if (tournament.byeValue === 1) {
      pairing.result = "1-0";
    } else if (tournament.byeValue === 0) {
      pairing.result = "0-1";
    } else {
      pairing.result = "1/2-1/2";
    }
  }

  // Recalculate all points from scratch and update playerPointsAtStart for all rounds
  recalculatePointsAndRoundStarts(tournament);

  saveTournament(tournament);
}

function recalculatePointsAndRoundStarts(tournament: Tournament): void {
  // Reset all player points to 0
  tournament.players.forEach(player => {
    player.points = 0;
  });

  // Process each round in order
  for (const round of tournament.rounds) {
    // Store current points as the starting points for this round
    const playerPointsAtStart: Record<string, number> = {};
    tournament.players.forEach(player => {
      playerPointsAtStart[player.id] = player.points;
    });
    round.playerPointsAtStart = playerPointsAtStart;

    // Process all pairings in this round to update points
    for (const pairing of round.pairings) {
      if (!pairing.result) continue;

      if (pairing.blackPlayerId) {
        // Regular pairing
        const whitePlayer = tournament.players.find(p => p.id === pairing.whitePlayerId);
        const blackPlayer = tournament.players.find(p => p.id === pairing.blackPlayerId);

        if (whitePlayer && blackPlayer) {
          if (pairing.result === "1-0" || pairing.result === "1F-0F") {
            whitePlayer.points += 1;
            blackPlayer.points += 0;
          } else if (pairing.result === "0-1" || pairing.result === "0F-1F") {
            whitePlayer.points += 0;
            blackPlayer.points += 1;
          } else if (pairing.result === "1/2-1/2") {
            whitePlayer.points += 0.5;
            blackPlayer.points += 0.5;
          } else if (pairing.result === "0F-0F") {
            whitePlayer.points += 0;
            blackPlayer.points += 0;
          }
        }
      } else {
        // Bye
        const whitePlayer = tournament.players.find(p => p.id === pairing.whitePlayerId);
        if (whitePlayer && pairing.result) {
          whitePlayer.points += tournament.byeValue;
        }
      }
    }
  }
}

export function markRoundComplete(tournamentId: string, roundId: string): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const round = tournament.rounds.find(r => r.id === roundId);
  if (!round) {
    throw new Error("Round not found");
  }

  // Check if all results are entered
  const allResultsEntered = round.pairings.every(p => p.result !== null && p.result !== undefined);
  if (!allResultsEntered) {
    throw new Error("All results must be entered before marking round as complete");
  }

  round.completed = true;
  saveTournament(tournament);
}

export function addManualPairing(
  tournamentId: string,
  roundId: string,
  whitePlayerId: string,
  blackPlayerId: string | null
): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const round = tournament.rounds.find(r => r.id === roundId);
  if (!round) {
    throw new Error("Round not found");
  }

  if (round.completed) {
    throw new Error("Cannot add pairings to a completed round");
  }

  // Check if players are already in this round
  const isPlayerUsed = (playerId: string) =>
    round.pairings.some(p => p.whitePlayerId === playerId || p.blackPlayerId === playerId);

  if (isPlayerUsed(whitePlayerId)) {
    const player = tournament.players.find(p => p.id === whitePlayerId);
    throw new Error(`Player ${player?.name || whitePlayerId} is already paired in this round`);
  }

  if (blackPlayerId && isPlayerUsed(blackPlayerId)) {
    const player = tournament.players.find(p => p.id === blackPlayerId);
    throw new Error(`Player ${player?.name || blackPlayerId} is already paired in this round`);
  }

  if (whitePlayerId === blackPlayerId) {
    throw new Error("A player cannot be paired against themselves");
  }

  const newPairing: Pairing = {
    id: crypto.randomUUID(),
    whitePlayerId,
    blackPlayerId,
    result: null,
  };

  // If it's a bye, assign result immediately
  if (!blackPlayerId) {
    if (tournament.byeValue === 1) {
      newPairing.result = "1-0";
    } else if (tournament.byeValue === 0) {
      newPairing.result = "0-1";
    } else {
      newPairing.result = "1/2-1/2";
    }
  }

  round.pairings.push(newPairing);

  // Recalculate points if it's a bye
  if (!blackPlayerId) {
    recalculatePointsAndRoundStarts(tournament);
  }

  saveTournament(tournament);
}

export function deleteLastRound(tournamentId: string): void {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  if (tournament.rounds.length === 0) {
    throw new Error("No rounds to delete");
  }

  // Remove the last round
  tournament.rounds.pop();

  // Recalculate all points and round starts for remaining rounds
  recalculatePointsAndRoundStarts(tournament);

  saveTournament(tournament);
}

