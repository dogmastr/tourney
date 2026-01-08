/**
 * Input Validation Utilities
 * 
 * Provides validation and sanitization for all user inputs.
 */

import { LIMITS, LIMIT_MESSAGES } from './limits';

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

// ============================================================================
// Sanitization
// ============================================================================

/**
 * Sanitize a string by removing potentially dangerous content
 */
export function sanitizeString(input: string): string {
    if (typeof input !== 'string') return '';

    return input
        // Remove HTML tags
        .replace(/<[^>]*>/g, '')
        // Remove script-like content
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        // Trim
        .trim();
}

/**
 * Sanitize and validate a text field with max length
 */
export function sanitizeTextField(input: string, maxLength: number): string {
    return sanitizeString(input).slice(0, maxLength);
}

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

// ============================================================================
// User Profile Validation
// ============================================================================

/**
 * Validate username - alphanumeric and underscore only, 3-20 chars
 */
export function validateUsername(username: string): ValidationResult {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required.' };
    }

    const trimmed = username.trim();

    if (trimmed.length < LIMITS.MIN_USERNAME_LENGTH) {
        return { valid: false, error: `Username must be at least ${LIMITS.MIN_USERNAME_LENGTH} characters.` };
    }

    if (trimmed.length > LIMITS.MAX_USERNAME_LENGTH) {
        return { valid: false, error: `Username cannot exceed ${LIMITS.MAX_USERNAME_LENGTH} characters.` };
    }

    // Alphanumeric and underscore only
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(trimmed)) {
        return { valid: false, error: 'Username can only contain letters, numbers, and underscores.' };
    }

    // Cannot start with a number
    if (/^[0-9]/.test(trimmed)) {
        return { valid: false, error: 'Username cannot start with a number.' };
    }

    return { valid: true };
}

/**
 * Validate bio/description - max 500 chars
 */
export function validateBio(bio: string): ValidationResult {
    if (!bio) {
        return { valid: true }; // Optional field
    }

    const sanitized = sanitizeString(bio);

    if (sanitized.length > LIMITS.MAX_BIO_LENGTH) {
        return { valid: false, error: `Bio cannot exceed ${LIMITS.MAX_BIO_LENGTH} characters.` };
    }

    return { valid: true };
}
