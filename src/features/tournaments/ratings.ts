/**
 * Elo Rating Calculation Utilities
 * 
 * Implements FIDE Elo rating formulas for chess tournaments.
 */

/**
 * Get K-factor based on player's rating (FIDE rules)
 * - K=40 for players with rating < 2300
 * - K=20 for players with 2300 <= rating < 2400
 * - K=10 for players with rating >= 2400
 */
export function getKFactor(rating: number): number {
    if (rating < 2300) return 40;
    if (rating < 2400) return 20;
    return 10;
}

/**
 * Calculate expected score using FIDE formula
 * E = 1 / (1 + 10^((Rb - Ra) / 400))
 */
export function calculateExpectedScore(playerRating: number, opponentRating: number): number {
    const exponent = (opponentRating - playerRating) / 400;
    return 1 / (1 + Math.pow(10, exponent));
}

/**
 * Calculate rating change for a single game
 * ΔR = K × (S - E)
 * Where S is actual score (1 for win, 0.5 for draw, 0 for loss)
 */
export function calculateRatingChange(
    playerRating: number,
    opponentRating: number,
    actualScore: number,
    kFactor?: number
): number {
    const k = kFactor ?? getKFactor(playerRating);
    const expectedScore = calculateExpectedScore(playerRating, opponentRating);
    return Math.round(k * (actualScore - expectedScore));
}

/**
 * Result type for rating updates
 */
export interface RatingUpdate {
    playerId: string;
    oldRating: number;
    newRating: number;
    change: number;
}

/**
 * Calculate rating updates for a completed pairing
 * Returns null for byes (no rating change)
 */
export function calculatePairingRatingUpdates(
    whiteRating: number,
    blackRating: number,
    whitePlayerId: string,
    blackPlayerId: string | null,
    result: string | null
): { white: RatingUpdate; black: RatingUpdate } | null {
    // No rating change for byes
    if (!blackPlayerId || !result) return null;

    let whiteScore: number;
    let blackScore: number;

    // Parse result
    if (result === '1-0' || result === '1F-0F') {
        whiteScore = 1;
        blackScore = 0;
    } else if (result === '0-1' || result === '0F-1F') {
        whiteScore = 0;
        blackScore = 1;
    } else if (result === '1/2-1/2') {
        whiteScore = 0.5;
        blackScore = 0.5;
    } else if (result === '0F-0F') {
        // Double forfeit - no rating change
        return null;
    } else {
        return null;
    }

    const whiteChange = calculateRatingChange(whiteRating, blackRating, whiteScore);
    const blackChange = calculateRatingChange(blackRating, whiteRating, blackScore);

    return {
        white: {
            playerId: whitePlayerId,
            oldRating: whiteRating,
            newRating: whiteRating + whiteChange,
            change: whiteChange,
        },
        black: {
            playerId: blackPlayerId,
            oldRating: blackRating,
            newRating: blackRating + blackChange,
            change: blackChange,
        },
    };
}
