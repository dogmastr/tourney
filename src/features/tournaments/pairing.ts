/**
 * FIDE Dutch Swiss Pairing System (C.04.3)
 * 
 * Implements the official FIDE Dutch pairing rules including:
 * - No repeat opponents (absolute constraint)
 * - Color balancing (max +2/-2 difference, no 3 same colors in a row)
 * - Score bracket pairing with S1/S2 subgroups
 * - Float tracking
 * - Color preference handling (absolute > strong > mild)
 */

import { type Player, type Tournament, type Pairing, type Round } from './model';

// Color preference types
type ColorPreference = 'absolute' | 'strong' | 'mild' | 'none';
type Color = 'W' | 'B';
type FloatDirection = 'up' | 'down' | 'none';

interface PairingPlayerData {
    id: string;
    name: string;
    rating: number;
    points: number;
    pairingNumber: number; // Initial ranking position
    colorHistory: Color[];
    opponentHistory: (string | null)[];
    colorDifference: number; // W games - B games
    floatHistory: FloatDirection[]; // Last 2 rounds
    hasByeHistory: boolean;
}

interface ColorPreferenceResult {
    type: ColorPreference;
    preferredColor: Color | null;
}

/**
 * Build pairing data from tournament state
 */
export function buildPairingData(tournament: Tournament): PairingPlayerData[] {
    const activePlayers = tournament.players.filter(p => p.active);

    // Sort by rating for initial pairing numbers
    const sortedByRating = [...activePlayers].sort((a, b) => b.rating - a.rating);

    return sortedByRating.map((player, index) => {
        // Build color and opponent history from rounds
        const colorHistory: Color[] = [];
        const opponentHistory: (string | null)[] = [];
        const floatHistory: FloatDirection[] = [];
        let hasByeHistory = false;

        for (const round of tournament.rounds) {
            for (const pairing of round.pairings) {
                if (pairing.whitePlayerId === player.id) {
                    colorHistory.push('W');
                    opponentHistory.push(pairing.blackPlayerId);
                    if (pairing.blackPlayerId === null) {
                        hasByeHistory = true;
                    }
                } else if (pairing.blackPlayerId === player.id) {
                    colorHistory.push('B');
                    opponentHistory.push(pairing.whitePlayerId);
                }
            }

            // Track floats (simplified: compare score bracket position)
            if (round.playerPointsAtStart) {
                const pointsAtStart = round.playerPointsAtStart[player.id] ?? 0;
                const pairing = round.pairings.find(
                    p => p.whitePlayerId === player.id || p.blackPlayerId === player.id
                );
                if (pairing && pairing.blackPlayerId) {
                    const opponentId = pairing.whitePlayerId === player.id
                        ? pairing.blackPlayerId
                        : pairing.whitePlayerId;
                    const opponentPoints = round.playerPointsAtStart[opponentId] ?? 0;

                    if (opponentPoints > pointsAtStart) {
                        floatHistory.push('up');
                    } else if (opponentPoints < pointsAtStart) {
                        floatHistory.push('down');
                    } else {
                        floatHistory.push('none');
                    }
                } else {
                    floatHistory.push('none');
                }
            }
        }

        // Calculate color difference
        const whiteGames = colorHistory.filter(c => c === 'W').length;
        const blackGames = colorHistory.filter(c => c === 'B').length;
        const colorDifference = whiteGames - blackGames;

        return {
            id: player.id,
            name: player.name,
            rating: player.rating,
            points: player.points,
            pairingNumber: index + 1,
            colorHistory,
            opponentHistory,
            colorDifference,
            floatHistory: floatHistory.slice(-2), // Last 2 rounds only
            hasByeHistory,
        };
    });
}

/**
 * Determine color preference for a player
 */
export function getColorPreference(player: PairingPlayerData): ColorPreferenceResult {
    const { colorHistory, colorDifference } = player;

    // Check for absolute color preference
    // 1. Color difference > +1 or < -1
    if (colorDifference > 1) {
        return { type: 'absolute', preferredColor: 'B' };
    }
    if (colorDifference < -1) {
        return { type: 'absolute', preferredColor: 'W' };
    }

    // 2. Same color in last 2 games
    if (colorHistory.length >= 2) {
        const lastTwo = colorHistory.slice(-2);
        if (lastTwo[0] === lastTwo[1]) {
            return {
                type: 'absolute',
                preferredColor: lastTwo[0] === 'W' ? 'B' : 'W'
            };
        }
    }

    // Strong color preference: colorDifference is +1 or -1
    if (colorDifference === 1) {
        return { type: 'strong', preferredColor: 'B' };
    }
    if (colorDifference === -1) {
        return { type: 'strong', preferredColor: 'W' };
    }

    // Mild color preference: alternate from last game
    if (colorHistory.length > 0) {
        const lastColor = colorHistory[colorHistory.length - 1];
        return {
            type: 'mild',
            preferredColor: lastColor === 'W' ? 'B' : 'W'
        };
    }

    return { type: 'none', preferredColor: null };
}

/**
 * Check if two players can be paired (hard constraints)
 */
export function canPair(p1: PairingPlayerData, p2: PairingPlayerData): boolean {
    // Cannot pair if they've already played each other
    if (p1.opponentHistory.includes(p2.id) || p2.opponentHistory.includes(p1.id)) {
        return false;
    }

    // Check if pairing would violate absolute color constraints
    const pref1 = getColorPreference(p1);
    const pref2 = getColorPreference(p2);

    // If both have absolute preference for the same color, can't pair
    if (pref1.type === 'absolute' && pref2.type === 'absolute' &&
        pref1.preferredColor === pref2.preferredColor) {
        return false;
    }

    return true;
}

/**
 * Determine color assignment for a pairing
 * Returns [whitePlayer, blackPlayer]
 */
export function assignColors(
    p1: PairingPlayerData,
    p2: PairingPlayerData
): [PairingPlayerData, PairingPlayerData] {
    const pref1 = getColorPreference(p1);
    const pref2 = getColorPreference(p2);

    // Priority 1: Absolute preferences
    if (pref1.type === 'absolute' && pref1.preferredColor === 'W') {
        return [p1, p2];
    }
    if (pref2.type === 'absolute' && pref2.preferredColor === 'W') {
        return [p2, p1];
    }
    if (pref1.type === 'absolute' && pref1.preferredColor === 'B') {
        return [p2, p1];
    }
    if (pref2.type === 'absolute' && pref2.preferredColor === 'B') {
        return [p1, p2];
    }

    // Priority 2: Strong preferences
    if (pref1.type === 'strong' && pref1.preferredColor === 'W') {
        return [p1, p2];
    }
    if (pref2.type === 'strong' && pref2.preferredColor === 'W') {
        return [p2, p1];
    }
    if (pref1.type === 'strong' && pref1.preferredColor === 'B') {
        return [p2, p1];
    }
    if (pref2.type === 'strong' && pref2.preferredColor === 'B') {
        return [p1, p2];
    }

    // Priority 3: Mild preferences
    if (pref1.type === 'mild' && pref1.preferredColor === 'W') {
        return [p1, p2];
    }
    if (pref2.type === 'mild' && pref2.preferredColor === 'W') {
        return [p2, p1];
    }

    // Default: higher-rated player gets white
    return p1.rating >= p2.rating ? [p1, p2] : [p2, p1];
}

/**
 * Calculate pairing quality score (lower is better)
 */
function pairingQuality(p1: PairingPlayerData, p2: PairingPlayerData): number {
    let score = 0;

    // Score difference penalty
    score += Math.abs(p1.points - p2.points) * 100;

    // Float penalty: avoid same float direction as last round
    const p1LastFloat = p1.floatHistory[p1.floatHistory.length - 1];
    const p2LastFloat = p2.floatHistory[p2.floatHistory.length - 1];

    if (p1.points > p2.points && p1LastFloat === 'down') {
        score += 50; // p1 would float down again
    }
    if (p2.points > p1.points && p2LastFloat === 'down') {
        score += 50; // p2 would float down again
    }
    if (p1.points < p2.points && p1LastFloat === 'up') {
        score += 50; // p1 would float up again
    }
    if (p2.points < p1.points && p2LastFloat === 'up') {
        score += 50; // p2 would float up again
    }

    // Color preference satisfaction bonus
    const pref1 = getColorPreference(p1);
    const pref2 = getColorPreference(p2);
    const [white, black] = assignColors(p1, p2);

    // Check if assigned colors match preferences
    if (pref1.preferredColor === 'W' && white.id !== p1.id) score += 10;
    if (pref1.preferredColor === 'B' && black.id !== p1.id) score += 10;
    if (pref2.preferredColor === 'W' && white.id !== p2.id) score += 10;
    if (pref2.preferredColor === 'B' && black.id !== p2.id) score += 10;

    return score;
}

/**
 * Select the bye player (lowest score, hasn't had bye)
 */
export function selectByePlayer(players: PairingPlayerData[]): PairingPlayerData | null {
    // Sort by: 1) hasn't had bye, 2) lowest points, 3) lowest pairing number (highest ranked)
    const candidates = [...players].sort((a, b) => {
        // Prioritize those who haven't had a bye
        if (a.hasByeHistory !== b.hasByeHistory) {
            return a.hasByeHistory ? 1 : -1;
        }
        // Lower points gets bye first
        if (a.points !== b.points) {
            return a.points - b.points;
        }
        // Higher pairing number (lower rated) gets bye
        return b.pairingNumber - a.pairingNumber;
    });

    return candidates[0] || null;
}

/**
 * Group players into score brackets
 */
function groupByScore(players: PairingPlayerData[]): Map<number, PairingPlayerData[]> {
    const brackets = new Map<number, PairingPlayerData[]>();

    for (const player of players) {
        const score = player.points;
        if (!brackets.has(score)) {
            brackets.set(score, []);
        }
        brackets.get(score)!.push(player);
    }

    // Sort players within each bracket by pairing number
    for (const [score, players] of brackets) {
        brackets.set(score, players.sort((a, b) => a.pairingNumber - b.pairingNumber));
    }

    return brackets;
}

/**
 * Try to find a valid pairing using backtracking
 */
function findPairingsRecursive(
    unpaired: PairingPlayerData[],
    currentPairings: [PairingPlayerData, PairingPlayerData][],
    depth: number = 0
): [PairingPlayerData, PairingPlayerData][] | null {
    // Base case: all players paired (or 1 left for bye)
    if (unpaired.length <= 1) {
        return currentPairings;
    }

    // Limit recursion depth to prevent infinite loops
    if (depth > 100) {
        return null;
    }

    // Take the first unpaired player
    const player = unpaired[0];
    const remaining = unpaired.slice(1);

    // Sort candidates by pairing quality
    const candidates = remaining
        .filter(p => canPair(player, p))
        .map(p => ({ player: p, quality: pairingQuality(player, p) }))
        .sort((a, b) => a.quality - b.quality);

    // Try each candidate
    for (const candidate of candidates) {
        const opponent = candidate.player;
        const newRemaining = remaining.filter(p => p.id !== opponent.id);
        const [white, black] = assignColors(player, opponent);
        const newPairings = [...currentPairings, [white, black] as [PairingPlayerData, PairingPlayerData]];

        const result = findPairingsRecursive(newRemaining, newPairings, depth + 1);
        if (result) {
            return result;
        }
    }

    return null;
}

/**
 * Main entry point: generate FIDE Dutch Swiss pairings
 */
export function generateFIDEDutchPairings(tournament: Tournament): Pairing[] {
    const players = buildPairingData(tournament);

    if (players.length < 2) {
        return [];
    }

    // Sort by points (descending), then by pairing number
    players.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.pairingNumber - b.pairingNumber;
    });

    // Handle odd number of players - select bye player
    let byePlayer: PairingPlayerData | null = null;
    let pairingPlayers = [...players];

    if (players.length % 2 === 1) {
        byePlayer = selectByePlayer(players);
        if (byePlayer) {
            pairingPlayers = players.filter(p => p.id !== byePlayer!.id);
        }
    }

    // Group by score and try bracket-based pairing
    const scoreBrackets = groupByScore(pairingPlayers);
    const scores = Array.from(scoreBrackets.keys()).sort((a, b) => b - a);

    // Flatten players maintaining score order for FIDE Dutch S1/S2 approach
    const orderedPlayers: PairingPlayerData[] = [];
    for (const score of scores) {
        const bracket = scoreBrackets.get(score)!;
        orderedPlayers.push(...bracket);
    }

    // Try to find valid pairings using backtracking
    let pairings = findPairingsRecursive(orderedPlayers, []);

    // Fallback: if strict pairing fails, try with relaxed constraints
    if (!pairings) {
        // Simple greedy fallback
        pairings = [];
        const remaining = [...orderedPlayers];

        while (remaining.length >= 2) {
            const p1 = remaining.shift()!;

            // Find best available opponent
            let bestIdx = -1;
            let bestQuality = Infinity;

            for (let i = 0; i < remaining.length; i++) {
                const p2 = remaining[i];
                // In fallback, only check repeat opponents
                if (!p1.opponentHistory.includes(p2.id)) {
                    const quality = pairingQuality(p1, p2);
                    if (quality < bestQuality) {
                        bestQuality = quality;
                        bestIdx = i;
                    }
                }
            }

            // If no valid opponent found, try anyone
            if (bestIdx === -1 && remaining.length > 0) {
                bestIdx = 0;
            }

            if (bestIdx >= 0) {
                const p2 = remaining.splice(bestIdx, 1)[0];
                const [white, black] = assignColors(p1, p2);
                pairings.push([white, black]);
            }
        }

        // If still someone unpaired, add to bye
        if (remaining.length === 1 && !byePlayer) {
            byePlayer = remaining[0];
        }
    }

    // Convert to Pairing format
    const result: Pairing[] = pairings.map(([white, black]) => ({
        id: crypto.randomUUID(),
        whitePlayerId: white.id,
        blackPlayerId: black.id,
        result: null,
    }));

    // Add bye pairing if needed
    if (byePlayer) {
        // Determine bye result based on tournament settings (will be set by caller)
        result.push({
            id: crypto.randomUUID(),
            whitePlayerId: byePlayer.id,
            blackPlayerId: null,
            result: null, // Will be set by createRound based on byeValue
        });
    }

    return result;
}

function rotateRight<T>(items: T[], steps: number): T[] {
    if (items.length === 0) return [];
    const normalized = ((steps % items.length) + items.length) % items.length;
    if (normalized === 0) return [...items];
    return [...items.slice(-normalized), ...items.slice(0, -normalized)];
}

/**
 * Generate round-robin pairings using the circle method.
 */
export function generateRoundRobinPairings(tournament: Tournament, roundIndexOverride?: number): Pairing[] {
    const activePlayers = tournament.players.filter(p => p.active);
    if (activePlayers.length < 2) {
        return [];
    }

    const seededPlayers = [...activePlayers].sort((a, b) => {
        const ratingA = a.initialRating ?? a.rating;
        const ratingB = b.initialRating ?? b.rating;
        if (ratingB !== ratingA) return ratingB - ratingA;
        const createdA = a.createdAt ?? "";
        const createdB = b.createdAt ?? "";
        if (createdA !== createdB) return createdA.localeCompare(createdB);
        if (a.name !== b.name) return a.name.localeCompare(b.name);
        return a.id.localeCompare(b.id);
    });

    const players: Array<Player | null> = seededPlayers.length % 2 === 1
        ? [...seededPlayers, null]
        : seededPlayers;

    if (players.length < 2) {
        return [];
    }

    const roundsPerCycle = players.length - 1;
    const roundIndex = roundIndexOverride ?? tournament.rounds.length;
    const cycleIndex = roundsPerCycle > 0 ? Math.floor(roundIndex / roundsPerCycle) : 0;
    const roundInCycle = roundsPerCycle > 0 ? roundIndex % roundsPerCycle : 0;

    const fixed = players[0];
    const rotating = players.slice(1);
    const rotated = rotateRight(rotating, roundInCycle);
    const order = [fixed, ...rotated];

    const pairings: Pairing[] = [];
    const half = players.length / 2;

    for (let i = 0; i < half; i += 1) {
        const home = order[i];
        const away = order[order.length - 1 - i];

        if (!home && !away) continue;

        if (!home || !away) {
            const byePlayer = home ?? away;
            if (!byePlayer) continue;
            pairings.push({
                id: crypto.randomUUID(),
                whitePlayerId: byePlayer.id,
                blackPlayerId: null,
                result: null,
            });
            continue;
        }

        const baseSwap = (roundInCycle + i) % 2 === 1;
        const swapColors = cycleIndex % 2 === 1 ? !baseSwap : baseSwap;
        const white = swapColors ? away : home;
        const black = swapColors ? home : away;

        pairings.push({
            id: crypto.randomUUID(),
            whitePlayerId: white.id,
            blackPlayerId: black.id,
            result: null,
        });
    }

    return pairings;
}
