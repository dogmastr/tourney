/**
 * Tiebreak Calculation Utilities
 * 
 * This module implements various chess tournament tiebreak systems according to
 * FIDE regulations. Tiebreaks are used to determine standings when players have
 * equal points.
 * 
 * Implemented Tiebreaks:
 * 
 * 1. **Buchholz** (BH): Sum of all opponents' final scores. Reflects the strength
 *    of opposition faced.
 * 
 * 2. **Buchholz Cut 1** (BHC1): Buchholz minus the lowest opponent's score.
 *    Reduces impact of one weak opponent.
 * 
 * 3. **Sonneborn-Berger** (SB): Sum of scores of defeated opponents plus half
 *    the scores of drawn opponents. Rewards wins against strong players.
 * 
 * 4. **Progressive Score** (Prog): Sum of cumulative scores after each round.
 *    Rewards early success in the tournament.
 * 
 * 5. **Direct Encounter** (DE): Head-to-head result if players have met.
 *    The winner of the direct game is ranked higher.
 * 
 * 6. **Wins**: Number of games won. Simple count of victories.
 * 
 * 7. **Wins with Black** (WB): Number of games won with the black pieces.
 *    Rewards success with the theoretically weaker color.
 * 
 * 8. **Average Rating Cut 1** (ARO): Average rating of opponents minus the
 *    lowest-rated opponent. Similar to BHC1 but based on ratings.
 * 
 * @see FIDE Handbook C.02 for official tiebreak rules
 */

import { type Tournament, type TiebreakType, DEFAULT_TIEBREAK_ORDER } from "./model";

/**
 * Tiebreak values for a player
 * Default order: Buchholz Cut 1, Buchholz, Sonneborn-Berger, Progressive,
 * Direct Encounter, Wins, Wins with Black, Average Rating Cut 1
 */
export interface TiebreakResult {
    buchholzCut1: number;
    buchholz: number;
    sonnebornBerger: number;
    progressive: number;
    wins: number;
    winsWithBlack: number;
    avgRatingCut1: number;
}

/**
 * Get all opponents a player has faced
 */
function getOpponents(tournament: Tournament, playerId: string): string[] {
    const opponents: string[] = [];

    tournament.rounds.forEach(round => {
        round.pairings.forEach(pairing => {
            if (pairing.whitePlayerId === playerId && pairing.blackPlayerId) {
                opponents.push(pairing.blackPlayerId);
            } else if (pairing.blackPlayerId === playerId) {
                opponents.push(pairing.whitePlayerId);
            }
        });
    });

    return opponents;
}

/**
 * Get opponent scores for Buchholz calculation
 */
function getOpponentScores(tournament: Tournament, playerId: string): number[] {
    const opponents = getOpponents(tournament, playerId);

    return opponents.map(oppId => {
        const opponent = tournament.players.find(p => p.id === oppId);
        return opponent ? opponent.points : 0;
    });
}

/**
 * Get opponent ratings for Average Rating calculation
 */
function getOpponentRatings(tournament: Tournament, playerId: string): number[] {
    const opponents = getOpponents(tournament, playerId);

    return opponents.map(oppId => {
        const opponent = tournament.players.find(p => p.id === oppId);
        return opponent ? opponent.rating : 0;
    });
}

/**
 * Calculate progressive score (cumulative points after each round)
 */
function calculateProgressive(tournament: Tournament, playerId: string): number {
    let progressive = 0;
    let cumulativePoints = 0;

    tournament.rounds.forEach(round => {
        round.pairings.forEach(pairing => {
            if (!pairing.result) return;

            const isWhite = pairing.whitePlayerId === playerId;
            const isBlack = pairing.blackPlayerId === playerId;

            if (isWhite || isBlack) {
                if (pairing.result === "1-0" || pairing.result === "1F-0F") {
                    cumulativePoints += isWhite ? 1 : 0;
                } else if (pairing.result === "0-1" || pairing.result === "0F-1F") {
                    cumulativePoints += isBlack ? 1 : 0;
                } else if (pairing.result === "1/2-1/2") {
                    cumulativePoints += 0.5;
                }
                // Handle bye
                if (!pairing.blackPlayerId && isWhite) {
                    cumulativePoints += tournament.byeValue;
                }
            }
        });
        progressive += cumulativePoints;
    });

    return progressive;
}

/**
 * Calculate wins with Black pieces
 * Unplayed games (byes) count as played with White
 */
function calculateWinsWithBlack(tournament: Tournament, playerId: string): number {
    let winsWithBlack = 0;

    tournament.rounds.forEach(round => {
        round.pairings.forEach(pairing => {
            if (!pairing.result) return;

            // Player is Black and won
            if (pairing.blackPlayerId === playerId) {
                if (pairing.result === "0-1" || pairing.result === "0F-1F") {
                    winsWithBlack++;
                }
            }
            // Byes count as White, so no increment
        });
    });

    return winsWithBlack;
}

/**
 * Calculate Sonneborn-Berger score
 * Sum of (defeated opponents' scores) + 0.5 * (drawn opponents' scores)
 */
function calculateSonnebornBerger(tournament: Tournament, playerId: string): number {
    let sb = 0;

    tournament.rounds.forEach(round => {
        round.pairings.forEach(pairing => {
            if (!pairing.result || !pairing.blackPlayerId) return;

            const isWhite = pairing.whitePlayerId === playerId;
            const isBlack = pairing.blackPlayerId === playerId;

            if (!isWhite && !isBlack) return;

            const opponentId = isWhite ? pairing.blackPlayerId : pairing.whitePlayerId;
            const opponent = tournament.players.find(p => p.id === opponentId);
            const oppPoints = opponent ? opponent.points : 0;

            // Check if player won
            const playerWon =
                (isWhite && (pairing.result === "1-0" || pairing.result === "1F-0F")) ||
                (isBlack && (pairing.result === "0-1" || pairing.result === "0F-1F"));

            // Check if draw
            const isDraw = pairing.result === "1/2-1/2";

            if (playerWon) {
                sb += oppPoints;
            } else if (isDraw) {
                sb += oppPoints * 0.5;
            }
        });
    });

    return sb;
}

/**
 * Calculate all tiebreaks for a player
 */
export function calculateTiebreaks(tournament: Tournament, playerId: string): TiebreakResult {
    const opponentScores = getOpponentScores(tournament, playerId);
    const opponentRatings = getOpponentRatings(tournament, playerId);

    // Buchholz: sum of opponent scores
    const buchholz = opponentScores.reduce((sum, s) => sum + s, 0);

    // Buchholz Cut 1: Buchholz minus lowest opponent score
    const minOppScore = opponentScores.length > 0 ? Math.min(...opponentScores) : 0;
    const buchholzCut1 = buchholz - minOppScore;

    // Sonneborn-Berger
    const sonnebornBerger = calculateSonnebornBerger(tournament, playerId);

    // Progressive
    const progressive = calculateProgressive(tournament, playerId);

    // Get player stats for wins
    let wins = 0;
    tournament.rounds.forEach(round => {
        round.pairings.forEach(pairing => {
            if (!pairing.result) return;

            const isWhite = pairing.whitePlayerId === playerId;
            const isBlack = pairing.blackPlayerId === playerId;

            if (isWhite && (pairing.result === "1-0" || pairing.result === "1F-0F")) {
                wins++;
            } else if (isBlack && (pairing.result === "0-1" || pairing.result === "0F-1F")) {
                wins++;
            }
            // Byes with win value
            if (isWhite && !pairing.blackPlayerId && tournament.byeValue === 1) {
                wins++;
            }
        });
    });

    // Wins with Black
    const winsWithBlack = calculateWinsWithBlack(tournament, playerId);

    // Average Rating Cut 1
    let avgRatingCut1 = 0;
    if (opponentRatings.length > 1) {
        const minOppRating = Math.min(...opponentRatings);
        const sumWithoutMin = opponentRatings.reduce((sum, r) => sum + r, 0) - minOppRating;
        avgRatingCut1 = sumWithoutMin / (opponentRatings.length - 1);
    } else if (opponentRatings.length === 1) {
        avgRatingCut1 = opponentRatings[0];
    }

    return {
        buchholzCut1,
        buchholz,
        sonnebornBerger,
        progressive,
        wins,
        winsWithBlack,
        avgRatingCut1,
    };
}

/**
 * Compare two players by direct encounter
 * Returns: 1 if a beat b, -1 if b beat a, 0 if draw or never played
 */
export function compareDirectEncounter(
    tournament: Tournament,
    playerAId: string,
    playerBId: string
): number {
    for (const round of tournament.rounds) {
        for (const pairing of round.pairings) {
            if (!pairing.result || !pairing.blackPlayerId) continue;

            const aIsWhite = pairing.whitePlayerId === playerAId && pairing.blackPlayerId === playerBId;
            const aIsBlack = pairing.blackPlayerId === playerAId && pairing.whitePlayerId === playerBId;

            if (aIsWhite) {
                if (pairing.result === "1-0" || pairing.result === "1F-0F") return 1;  // A wins
                if (pairing.result === "0-1" || pairing.result === "0F-1F") return -1; // B wins
            } else if (aIsBlack) {
                if (pairing.result === "0-1" || pairing.result === "0F-1F") return 1;  // A wins
                if (pairing.result === "1-0" || pairing.result === "1F-0F") return -1; // B wins
            }
        }
    }

    return 0; // Draw or never played
}

/**
 * Compare a single tiebreak value
 * Returns: positive if a is better, negative if b is better, 0 if equal
 */
function compareSingleTiebreak(
    tiebreak: TiebreakType,
    a: TiebreakResult,
    b: TiebreakResult,
    tournament: Tournament,
    playerAId: string,
    playerBId: string
): number {
    switch (tiebreak) {
        case 'buchholzCut1':
            return b.buchholzCut1 - a.buchholzCut1;
        case 'buchholz':
            return b.buchholz - a.buchholz;
        case 'sonnebornBerger':
            return b.sonnebornBerger - a.sonnebornBerger;
        case 'progressive':
            return b.progressive - a.progressive;
        case 'directEncounter':
            return -compareDirectEncounter(tournament, playerAId, playerBId);
        case 'wins':
            return b.wins - a.wins;
        case 'winsWithBlack':
            return b.winsWithBlack - a.winsWithBlack;
        case 'avgRatingCut1':
            return b.avgRatingCut1 - a.avgRatingCut1;
        default:
            return 0;
    }
}

/**
 * Compare two tiebreak results according to custom or default order
 * Returns: positive if a should rank higher, negative if b should rank higher, 0 if equal
 */
export function compareTiebreaks(
    a: TiebreakResult,
    b: TiebreakResult,
    tournament: Tournament,
    playerAId: string,
    playerBId: string
): number {
    const order = tournament.tiebreakOrder || DEFAULT_TIEBREAK_ORDER;

    for (const tiebreak of order) {
        const result = compareSingleTiebreak(tiebreak, a, b, tournament, playerAId, playerBId);
        if (result !== 0) return result;
    }

    return 0;
}

