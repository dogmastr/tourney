/**
 * Tournament and player validation utilities.
 */

import { LIMITS, LIMIT_MESSAGES } from '@shared/limits';
import { sanitizeString, type ValidationResult } from '@/shared/validation';

// ============================================================================
// Tournament Validation
// ============================================================================

export function validateTournamentName(name: string): ValidationResult {
    const sanitized = sanitizeString(name);

    if (sanitized.length < LIMITS.MIN_TOURNAMENT_NAME_LENGTH) {
        return { valid: false, error: 'Tournament name is required.' };
    }

    if (sanitized.length > LIMITS.MAX_TOURNAMENT_NAME_LENGTH) {
        return { valid: false, error: LIMIT_MESSAGES.INVALID_TOURNAMENT_NAME };
    }

    return { valid: true };
}

export function validateTournamentSystem(system: string): ValidationResult {
    const validSystems = ['normal-swiss', 'round-robin'];

    if (!validSystems.includes(system)) {
        return { valid: false, error: 'Invalid tournament system.' };
    }

    return { valid: true };
}

export function validateByeValue(byeValue: number): ValidationResult {
    if (![0, 0.5, 1].includes(byeValue)) {
        return { valid: false, error: 'Bye value must be 0, 0.5, or 1.' };
    }

    return { valid: true };
}

export function validateTotalRounds(rounds: number): ValidationResult {
    if (!Number.isInteger(rounds)) {
        return { valid: false, error: 'Rounds must be a whole number.' };
    }

    if (rounds < LIMITS.MIN_ROUNDS_PER_TOURNAMENT || rounds > LIMITS.MAX_ROUNDS_PER_TOURNAMENT) {
        return { valid: false, error: LIMIT_MESSAGES.INVALID_ROUNDS };
    }

    return { valid: true };
}

export interface TournamentInput {
    name: string;
    system: string;
    byeValue: number;
    totalRounds: number;
}

export function validateTournamentInput(input: TournamentInput): ValidationResult {
    const nameResult = validateTournamentName(input.name);
    if (!nameResult.valid) return nameResult;

    const systemResult = validateTournamentSystem(input.system);
    if (!systemResult.valid) return systemResult;

    const byeResult = validateByeValue(input.byeValue);
    if (!byeResult.valid) return byeResult;

    const roundsResult = validateTotalRounds(input.totalRounds);
    if (!roundsResult.valid) return roundsResult;

    return { valid: true };
}

// ============================================================================
// Player Validation
// ============================================================================

export function validatePlayerName(name: string): ValidationResult {
    const sanitized = sanitizeString(name);

    if (sanitized.length < LIMITS.MIN_PLAYER_NAME_LENGTH) {
        return { valid: false, error: 'Player name is required.' };
    }

    if (sanitized.length > LIMITS.MAX_PLAYER_NAME_LENGTH) {
        return { valid: false, error: LIMIT_MESSAGES.INVALID_PLAYER_NAME };
    }

    return { valid: true };
}

export function validateRating(rating: number): ValidationResult {
    if (typeof rating !== 'number' || isNaN(rating)) {
        return { valid: false, error: 'Rating must be a number.' };
    }

    if (rating < LIMITS.MIN_RATING || rating > LIMITS.MAX_RATING) {
        return { valid: false, error: LIMIT_MESSAGES.INVALID_RATING };
    }

    return { valid: true };
}

export function validateFideId(fideId: number | null | undefined): ValidationResult {
    if (fideId === null || fideId === undefined) {
        return { valid: true }; // Optional field
    }

    if (!Number.isInteger(fideId) || fideId <= 0) {
        return { valid: false, error: 'FIDE ID must be a positive integer.' };
    }

    return { valid: true };
}

export function validatePlayerTitles(titles: string[]): ValidationResult {
    if (!Array.isArray(titles)) {
        return { valid: false, error: 'Titles must be an array.' };
    }

    if (titles.length > LIMITS.MAX_TITLES_PER_PLAYER) {
        return { valid: false, error: `A player can have at most ${LIMITS.MAX_TITLES_PER_PLAYER} titles.` };
    }

    return { valid: true };
}

export interface PlayerInput {
    name: string;
    rating: number;
    fideId?: number | null;
    titles?: string[];
}

export function validatePlayerInput(input: PlayerInput): ValidationResult {
    const nameResult = validatePlayerName(input.name);
    if (!nameResult.valid) return nameResult;

    const ratingResult = validateRating(input.rating);
    if (!ratingResult.valid) return ratingResult;

    const fideResult = validateFideId(input.fideId);
    if (!fideResult.valid) return fideResult;

    if (input.titles) {
        const titlesResult = validatePlayerTitles(input.titles);
        if (!titlesResult.valid) return titlesResult;
    }

    return { valid: true };
}

// ============================================================================
// Settings Validation
// ============================================================================

export function validateDateString(date: string): ValidationResult {
    if (!date) return { valid: true }; // Optional

    // Simple YYYY-MM-DD format check
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        return { valid: false, error: 'Invalid date format. Use YYYY-MM-DD.' };
    }

    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
        return { valid: false, error: 'Invalid date.' };
    }

    return { valid: true };
}

export function validateTimeControl(timeControl: string): ValidationResult {
    if (!timeControl) return { valid: true }; // Optional

    const sanitized = sanitizeString(timeControl);
    if (sanitized.length > LIMITS.MAX_TIME_CONTROL_LENGTH) {
        return { valid: false, error: `Time control cannot exceed ${LIMITS.MAX_TIME_CONTROL_LENGTH} characters.` };
    }

    return { valid: true };
}

// ============================================================================
// Custom Title Validation
// ============================================================================

export function validateCustomTitleName(name: string): ValidationResult {
    const sanitized = sanitizeString(name);

    if (sanitized.length === 0) {
        return { valid: false, error: 'Title name is required.' };
    }

    if (sanitized.length > LIMITS.MAX_TITLE_NAME_LENGTH) {
        return { valid: false, error: `Title name cannot exceed ${LIMITS.MAX_TITLE_NAME_LENGTH} characters.` };
    }

    return { valid: true };
}

export function validateHexColor(color: string): ValidationResult {
    const hexRegex = /^#[0-9A-Fa-f]{6}$/;

    if (!hexRegex.test(color)) {
        return { valid: false, error: 'Invalid color format. Use #RRGGBB.' };
    }

    return { valid: true };
}
