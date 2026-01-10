/**
 * Utilities for handling game results and their display styles.
 * Centralizes result-related logic used across multiple components.
 */

import { type ResultType } from './constants';

// ============================================================================
// Result Display
// ============================================================================

/**
 * Returns Tailwind CSS classes for styling a result display element.
 * Used in the rounds tab for the result dropdown button.
 * 
 * @param result - The game result or null/undefined for no result
 * @returns CSS class string for background, text, and border colors
 * 
 * @example
 * getResultStyles("1-0") // "bg-green-500/10 text-green-600 border-green-500/30"
 * getResultStyles(null)  // ""
 */
export function getResultStyles(result: ResultType | string | null | undefined): string {
    if (!result || result === "empty") return "";

    switch (result) {
        case "1-0":
        case "1F-0F":
            return "bg-green-500/10 text-green-600 border-green-500/30";
        case "0-1":
            return "bg-red-500/10 text-red-600 border-red-500/30";
        case "0F-1F":
            return "bg-red-500/10 text-red-600 border-red-500/30";
        case "1/2-1/2":
            return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
        case "0F-0F":
            return "bg-gray-500/10 text-gray-500 border-gray-500/30";
        default:
            return "";
    }
}

/**
 * Crosstable result styling for the dashboard standings table.
 * Returns both a text color class and a background class.
 * 
 * @param result - Single letter result code: W (win), L (loss), D (draw), B (bye), - (not played)
 * @returns Object with colorClass and bgClass for styling
 */
export function getCrosstableResultStyles(result: "W" | "L" | "D" | "B" | "-"): {
    colorClass: string;
    bgClass: string;
} {
    switch (result) {
        case "W":
            return { colorClass: "text-green-600", bgClass: "bg-green-500/10" };
        case "L":
            return { colorClass: "text-red-500", bgClass: "bg-red-500/10" };
        case "D":
            return { colorClass: "text-yellow-600", bgClass: "bg-yellow-500/10" };
        case "B":
            return { colorClass: "text-blue-500", bgClass: "bg-blue-500/10" };
        case "-":
        default:
            return { colorClass: "text-muted-foreground", bgClass: "" };
    }
}

// ============================================================================
// Result Parsing
// ============================================================================

/**
 * Determines if a result is a forfeit (contains "F").
 * 
 * @param result - The game result
 * @returns true if the result is a forfeit
 */
export function isForfeit(result: ResultType | string | null | undefined): boolean {
    if (!result) return false;
    return result.includes("F");
}

/**
 * Determines if a result represents a win for White.
 * 
 * @param result - The game result
 * @returns true if White won
 */
export function isWhiteWin(result: ResultType | string | null | undefined): boolean {
    return result === "1-0" || result === "1F-0F";
}

/**
 * Determines if a result represents a win for Black.
 * 
 * @param result - The game result
 * @returns true if Black won
 */
export function isBlackWin(result: ResultType | string | null | undefined): boolean {
    return result === "0-1" || result === "0F-1F";
}

/**
 * Determines if a result is a draw.
 * 
 * @param result - The game result
 * @returns true if the game was a draw
 */
export function isDraw(result: ResultType | string | null | undefined): boolean {
    return result === "1/2-1/2";
}

/**
 * Gets the points earned by the white player from a result.
 * 
 * @param result - The game result
 * @param byeValue - Points awarded for a bye (default: 1)
 * @returns Points for White (1, 0.5, or 0)
 */
export function getWhitePoints(result: ResultType | string | null | undefined, byeValue: number = 1): number {
    if (!result) return 0;
    if (isWhiteWin(result)) return 1;
    if (isDraw(result)) return 0.5;
    return 0;
}

/**
 * Gets the points earned by the black player from a result.
 * 
 * @param result - The game result
 * @returns Points for Black (1, 0.5, or 0)
 */
export function getBlackPoints(result: ResultType | string | null | undefined): number {
    if (!result) return 0;
    if (isBlackWin(result)) return 1;
    if (isDraw(result)) return 0.5;
    return 0;
}

// ============================================================================
// Upset Detection
// ============================================================================

/**
 * Determines if a game result qualifies as an upset.
 * An upset occurs when the lower-rated player defeats the higher-rated player.
 * 
 * @param result - The game result
 * @param whiteRating - Rating of the white player
 * @param blackRating - Rating of the black player
 * @returns true if the result is an upset
 */
export function isUpset(
    result: ResultType | string | null | undefined,
    whiteRating: number,
    blackRating: number
): boolean {
    if (!result) return false;

    if (isWhiteWin(result)) {
        return whiteRating < blackRating;
    }
    if (isBlackWin(result)) {
        return blackRating < whiteRating;
    }
    return false;
}
