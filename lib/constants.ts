/**
 * Shared constants for the tournament manager application.
 * Centralizes values that are used across multiple components.
 */

// ============================================================================
// Admin Configuration (re-exported from shared module)
// ============================================================================

// USER_TITLES is defined in amplify/shared/constants.ts
// This is the single source of truth for both Lambda and frontend
export { USER_TITLES, ADMIN_USERNAMES } from '@shared/constants';
export type { UserTitle } from '@shared/constants';

// ============================================================================
// Result Types
// ============================================================================

/**
 * Possible game results in chess notation.
 * - "1-0": White wins
 * - "0-1": Black wins  
 * - "1/2-1/2": Draw
 * - "1F-0F": White wins by forfeit
 * - "0F-1F": Black wins by forfeit
 * - "0F-0F": Double forfeit (both players lose)
 */
export const RESULT_VALUES = ["1-0", "0-1", "1/2-1/2", "1F-0F", "0F-1F", "0F-0F"] as const;
export type ResultType = typeof RESULT_VALUES[number];

/**
 * Keyboard shortcuts for entering results in the rounds tab.
 * Maps key to result value.
 */
export const RESULT_KEYBOARD_SHORTCUTS: Record<string, ResultType | "empty"> = {
    '1': '1-0',
    '2': '0-1',
    '3': '1/2-1/2',
    '4': '1F-0F',
    '5': '0F-1F',
    '6': '0F-0F',
    'Backspace': 'empty',
} as const;

// ============================================================================
// Tiebreak Constants
// ============================================================================

/**
 * Short labels for tiebreak columns in the standings table.
 * Keeps the table compact while still being readable.
 */
export const TIEBREAK_SHORT_LABELS: Record<string, string> = {
    buchholzCut1: 'BHC1',
    buchholz: 'BH',
    sonnebornBerger: 'SB',
    progressive: 'Prog',
    directEncounter: 'DE',
    wins: 'W',
    winsWithBlack: 'WB',
    avgRatingCut1: 'ARO',
} as const;

// ============================================================================
// Default Values
// ============================================================================

/** Default player rating for new players */
export const DEFAULT_RATING = 1000;

/** Default number of rounds for a new tournament */
export const DEFAULT_TOTAL_ROUNDS = 7;

/** Default bye value (full point) */
export const DEFAULT_BYE_VALUE = 1;

/** Maximum number of titles a player can display */
export const MAX_VISIBLE_TITLES = 3;

/** Number of top players to show in the points progression chart */
export const CHART_TOP_PLAYERS = 5;

// ============================================================================
// Chart Colors
// ============================================================================

/**
 * Color palette for charts and visualizations.
 * Uses CSS custom properties for theme compatibility.
 */
export const CHART_COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
    "#8b5cf6", // violet-500
    "#ec4899", // pink-500
    "#14b8a6", // teal-500
] as const;

// ============================================================================
// Rating Distribution Ranges
// ============================================================================

/**
 * Rating ranges for the rating distribution chart.
 * Covers typical chess ratings from beginner to master level.
 */
export const RATING_RANGES = [
    { range: "0-1000", min: 0, max: 1000 },
    { range: "1001-1200", min: 1001, max: 1200 },
    { range: "1201-1400", min: 1201, max: 1400 },
    { range: "1401-1600", min: 1401, max: 1600 },
    { range: "1601-1800", min: 1601, max: 1800 },
    { range: "1801-2000", min: 1801, max: 2000 },
    { range: "2001+", min: 2001, max: Infinity },
] as const;
