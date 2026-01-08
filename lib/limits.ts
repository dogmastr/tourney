/**
 * Resource Limits and Constants
 * 
 * Re-exports from the shared module (single source of truth)
 * and provides additional frontend-only helper functions.
 */

// Re-export LIMITS and LIMIT_MESSAGES from the shared module
// This is the single source of truth for both Lambda and frontend
export { LIMITS, LIMIT_MESSAGES } from '@shared/limits';

// Import LIMITS for use in helper functions
import { LIMITS } from '@shared/limits';

// ============================================================================
// Helper Functions (frontend-only)
// ============================================================================

export function canCreateTournament(currentCount: number): boolean {
    return currentCount < LIMITS.MAX_TOURNAMENTS_PER_USER;
}

export function canAddPlayer(currentCount: number): boolean {
    return currentCount < LIMITS.MAX_PLAYERS_PER_TOURNAMENT;
}

export function canCreateRound(currentCount: number): boolean {
    return currentCount < LIMITS.MAX_ROUNDS_PER_TOURNAMENT;
}

export function canAddCustomTitle(currentCount: number): boolean {
    return currentCount < LIMITS.MAX_CUSTOM_TITLES_PER_TOURNAMENT;
}

export function getRemainingTournaments(currentCount: number): number {
    return Math.max(0, LIMITS.MAX_TOURNAMENTS_PER_USER - currentCount);
}

export function getRemainingPlayers(currentCount: number): number {
    return Math.max(0, LIMITS.MAX_PLAYERS_PER_TOURNAMENT - currentCount);
}

export function getRemainingRounds(currentCount: number): number {
    return Math.max(0, LIMITS.MAX_ROUNDS_PER_TOURNAMENT - currentCount);
}

export function getRemainingCustomTitles(currentCount: number): number {
    return Math.max(0, LIMITS.MAX_CUSTOM_TITLES_PER_TOURNAMENT - currentCount);
}
