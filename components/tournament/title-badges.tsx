"use client";

/**
 * TitleBadges Component
 * 
 * Displays player title badges with consistent styling across the application.
 * Supports both custom tournament titles and standard chess titles.
 */

import { type Tournament } from "@/lib/tournament-store";
import { getTitlesStyles } from "@/lib/title-utils";
import { MAX_VISIBLE_TITLES } from "@/lib/constants";

interface TitleBadgesProps {
    /** The tournament context for custom title colors */
    tournament: Tournament;
    /** Array of title strings to display */
    titles?: string[];
    /** Maximum number of titles to show before "+N" indicator */
    maxVisible?: number;
    /** Size variant: "sm" for compact display, "default" for normal */
    size?: "sm" | "default";
    /** Additional CSS classes */
    className?: string;
}

/**
 * Renders a row of title badges with proper styling.
 * Shows custom title colors when available, falls back to theme defaults.
 * Displays a "+N" indicator when there are more titles than maxVisible.
 * 
 * @example
 * // Basic usage
 * <TitleBadges tournament={tournament} titles={["GM", "NM"]} />
 * 
 * // Compact size for tables
 * <TitleBadges tournament={tournament} titles={player.titles} size="sm" />
 * 
 * // Custom max visible
 * <TitleBadges tournament={tournament} titles={titles} maxVisible={2} />
 */
export function TitleBadges({
    tournament,
    titles,
    maxVisible = MAX_VISIBLE_TITLES,
    size = "default",
    className = "",
}: TitleBadgesProps) {
    if (!titles || titles.length === 0) {
        return null;
    }

    const visibleTitles = titles.slice(0, maxVisible);
    const extraCount = titles.length - maxVisible;
    const titleStyles = getTitlesStyles(tournament, visibleTitles);

    // Size-based styling
    const sizeClasses = size === "sm"
        ? "text-[10px] font-medium px-1 py-0"
        : "text-xs font-medium px-1.5 py-0.5";

    const gapClass = size === "sm" ? "gap-0.5 sm:gap-1" : "gap-1";

    return (
        <span className={`flex flex-wrap ${gapClass} ${className}`}>
            {titleStyles.map(({ title, style }) => (
                <span
                    key={title}
                    className={`${sizeClasses} border bg-transparent rounded-[3px]`}
                    style={{
                        borderColor: style?.color ? `${style.color}60` : "hsl(var(--border))",
                        color: style?.color || "hsl(var(--foreground))",
                    }}
                >
                    {title}
                </span>
            ))}
            {extraCount > 0 && (
                <span className={`${size === "sm" ? "text-[9px]" : "text-[10px]"} text-muted-foreground`}>
                    +{extraCount}
                </span>
            )}
        </span>
    );
}

/**
 * Static version of TitleBadges for read-only display (e.g., deactivated players).
 * Does not include hover effects or interactive elements.
 */
export function TitleBadgesStatic({
    tournament,
    titles,
    className = "",
}: {
    tournament: Tournament;
    titles?: string[];
    className?: string;
}) {
    if (!titles || titles.length === 0) {
        return <span className="text-muted-foreground text-xs">—</span>;
    }

    const titleStyles = getTitlesStyles(tournament, titles);

    return (
        <div className={`flex flex-wrap gap-1 ${className}`}>
            {titleStyles.map(({ title, style }) => (
                <span
                    key={title}
                    className="text-[10px] font-medium border px-1 py-0 rounded-[3px] bg-transparent"
                    style={{
                        borderColor: style?.color ? `${style.color}60` : "hsl(var(--border))",
                        color: style?.color || "hsl(var(--foreground))",
                    }}
                >
                    {title}
                </span>
            ))}
        </div>
    );
}
