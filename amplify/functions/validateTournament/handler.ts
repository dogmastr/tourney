import type { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LIMITS } from '../../../shared/limits';
import { getRoundRobinMaxPlayers, getRoundRobinRequiredRounds } from '../../../shared/round-robin';

interface TournamentInput {
    id: string;
    name: string;
    // These can come as either JSON strings or already-parsed objects from AppSync a.json() type
    tournamentData?: string | object;
    playerDatabase?: string | object;
    creatorId: string;
    creatorName?: string;
    description?: string;
    location?: string;
    federation?: string;
    startDate?: string;
    endDate?: string;
    timeControl?: string;
    format?: string;
    totalRounds?: number;
    currentRound?: number;
    playerCount?: number;
    status?: string;
}

interface TournamentPlayer {
    id?: string;
    name?: string;
    rating?: number;
    titles?: string[];
    points?: number;
    active?: boolean;
}

interface TournamentPairing {
    id?: string;
    whitePlayerId?: string;
    blackPlayerId?: string | null;
    result?: string | null;
}

interface TournamentRound {
    id?: string;
    roundNumber?: number;
    pairings?: TournamentPairing[];
    completed?: boolean;
}

interface TournamentData {
    id?: string;
    name?: string;
    system?: string;
    byeValue?: number;
    totalRounds?: number;
    rated?: boolean;
    players?: TournamentPlayer[];
    rounds?: TournamentRound[];
    customTitles?: Array<{ name: string; color: string }>;
    organizers?: string;
    tournamentDirector?: string;
    chiefArbiter?: string;
    location?: string;
    timeControl?: string;
}

interface ValidationResult {
    valid: boolean;
    errors: string[];
}

interface AppSyncEvent {
    arguments: {
        input: TournamentInput;
    };
    identity?: {
        sub?: string;
        username?: string;
        claims?: {
            sub?: string;
            'cognito:username'?: string;
        };
    };
    info?: {
        fieldName: string;
    };
}

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const getTableName = (): string => {
    return process.env.TOURNAMENT_TABLE_NAME || '';
};

const VALID_RESULTS = new Set([
    "1-0",
    "0-1",
    "1/2-1/2",
    "1F-0F",
    "0F-1F",
    "0F-0F",
]);

/**
 * Validate tournament data against all resource limits
 */
function validateTournamentData(input: TournamentInput): ValidationResult {
    const errors: string[] = [];

    // Validate tournament name
    if (!input.name || input.name.length === 0) {
        errors.push('Tournament name is required');
    } else if (input.name.length > LIMITS.MAX_TOURNAMENT_NAME_LENGTH) {
        errors.push(`Tournament name exceeds ${LIMITS.MAX_TOURNAMENT_NAME_LENGTH} characters`);
    }

    // Validate text fields at top level
    if (input.location && input.location.length > LIMITS.MAX_LOCATION_LENGTH) {
        errors.push(`Location exceeds ${LIMITS.MAX_LOCATION_LENGTH} characters`);
    }
    if (input.timeControl && input.timeControl.length > LIMITS.MAX_TIME_CONTROL_LENGTH) {
        errors.push(`Time control exceeds ${LIMITS.MAX_TIME_CONTROL_LENGTH} characters`);
    }

    // Validate playerDatabase size
    if (input.playerDatabase) {
        const playerDbStr = typeof input.playerDatabase === 'string'
            ? input.playerDatabase
            : JSON.stringify(input.playerDatabase);
        if (playerDbStr.length > LIMITS.MAX_TOURNAMENT_DATA_LENGTH) {
            errors.push(`Player database too large (max ${Math.round(LIMITS.MAX_TOURNAMENT_DATA_LENGTH / 1024)}KB)`);
        }
    }

    // Parse and validate tournamentData JSON
    if (input.tournamentData) {
        // Handle both string and object inputs (a.json() type may pass already-parsed objects)
        const tournamentDataStr = typeof input.tournamentData === 'string'
            ? input.tournamentData
            : JSON.stringify(input.tournamentData);

        if (tournamentDataStr.length > LIMITS.MAX_TOURNAMENT_DATA_LENGTH) {
            errors.push(`Tournament data too large (max ${Math.round(LIMITS.MAX_TOURNAMENT_DATA_LENGTH / 1024)}KB)`);
            return { valid: false, errors };
        }

        let data: TournamentData;
        try {
            // If already an object, use directly; otherwise parse the string
            data = typeof input.tournamentData === 'string'
                ? JSON.parse(input.tournamentData)
                : input.tournamentData as unknown as TournamentData;
        } catch {
            errors.push('Invalid tournamentData JSON');
            return { valid: false, errors };
        }

        if (data.byeValue !== undefined && ![0, 0.5, 1].includes(data.byeValue)) {
            errors.push('Bye value must be 0, 0.5, or 1');
        }

        const system = data.system ?? input.format;
        const playerIds = new Set<string>();

        // Validate player count
        if (data.players && data.players.length > LIMITS.MAX_PLAYERS_PER_TOURNAMENT) {
            errors.push(`Players exceed limit of ${LIMITS.MAX_PLAYERS_PER_TOURNAMENT}`);
        }

        // Validate player data
        if (data.players) {
            for (let i = 0; i < data.players.length; i++) {
                const player = data.players[i];
                if (!player.id) {
                    errors.push(`Player ${i + 1} is missing an id`);
                } else if (playerIds.has(player.id)) {
                    errors.push(`Duplicate player id: ${player.id}`);
                } else {
                    playerIds.add(player.id);
                }
                if (player.name && player.name.length > LIMITS.MAX_PLAYER_NAME_LENGTH) {
                    errors.push(`Player ${i + 1} name exceeds ${LIMITS.MAX_PLAYER_NAME_LENGTH} characters`);
                }
                if (player.rating !== undefined) {
                    if (player.rating < LIMITS.MIN_RATING || player.rating > LIMITS.MAX_RATING) {
                        errors.push(`Player ${i + 1} rating out of range (${LIMITS.MIN_RATING}-${LIMITS.MAX_RATING})`);
                    }
                }
                // Validate titles per player
                if (player.titles && player.titles.length > LIMITS.MAX_TITLES_PER_PLAYER) {
                    errors.push(`Player ${i + 1} has too many titles (max ${LIMITS.MAX_TITLES_PER_PLAYER})`);
                }
            }
        }

        const totalPlayerCount = Array.isArray(data.players) ? data.players.length : 0;
        const activePlayerCount = Array.isArray(data.players)
            ? data.players.filter(player => player.active !== false).length
            : 0;

        // Validate round count
        if (data.rounds && data.rounds.length > LIMITS.MAX_ROUNDS_PER_TOURNAMENT) {
            errors.push(`Rounds exceed limit of ${LIMITS.MAX_ROUNDS_PER_TOURNAMENT}`);
        }

        const roundCount = Array.isArray(data.rounds) ? data.rounds.length : 0;
        const completedRounds = Array.isArray(data.rounds)
            ? data.rounds.filter(round => round.completed).length
            : 0;
        const totalRounds = data.totalRounds ?? input.totalRounds;

        if (totalRounds !== undefined && totalRounds !== null) {
            if (!Number.isInteger(totalRounds)) {
                errors.push('Total rounds must be a whole number');
            } else if (totalRounds < LIMITS.MIN_ROUNDS_PER_TOURNAMENT || totalRounds > LIMITS.MAX_ROUNDS_PER_TOURNAMENT) {
                errors.push(`Total rounds must be between ${LIMITS.MIN_ROUNDS_PER_TOURNAMENT} and ${LIMITS.MAX_ROUNDS_PER_TOURNAMENT}`);
            }
        }

        if (input.totalRounds !== undefined && roundCount > input.totalRounds) {
            errors.push(`Total rounds (${input.totalRounds}) less than existing rounds (${roundCount})`);
        }
        if (data.totalRounds !== undefined && roundCount > data.totalRounds) {
            errors.push(`Tournament rounds (${data.totalRounds}) less than existing rounds (${roundCount})`);
        }

        if (system === 'round-robin') {
            if (totalPlayerCount > LIMITS.MAX_ROUND_ROBIN_PLAYERS) {
                errors.push(`Round-robin tournaments can have at most ${LIMITS.MAX_ROUND_ROBIN_PLAYERS} players.`);
            }

            const requiredRounds = getRoundRobinRequiredRounds(activePlayerCount);
            if (requiredRounds > 0) {
                if (requiredRounds > LIMITS.MAX_ROUNDS_PER_TOURNAMENT) {
                    const maxPlayers = getRoundRobinMaxPlayers(LIMITS.MAX_ROUNDS_PER_TOURNAMENT);
                    errors.push(`Round-robin tournaments can have at most ${maxPlayers} active players (max ${LIMITS.MAX_ROUNDS_PER_TOURNAMENT} rounds)`);
                }
                if (roundCount > 0 && roundCount > requiredRounds) {
                    errors.push(`Round-robin tournaments with ${activePlayerCount} active players can have at most ${requiredRounds} rounds.`);
                }
            }
        }

        if (input.playerCount !== undefined && data.players && input.playerCount !== data.players.length) {
            errors.push(`Player count (${input.playerCount}) does not match players (${data.players.length})`);
        }
        if (input.currentRound !== undefined) {
            const expectedCurrentRound = system === 'round-robin' ? completedRounds : roundCount;
            if (input.currentRound !== expectedCurrentRound) {
                const label = system === 'round-robin' ? 'completed rounds' : 'rounds';
                errors.push(`Current round (${input.currentRound}) does not match ${label} (${expectedCurrentRound})`);
            }
        }

        // Validate custom titles count
        if (data.customTitles && data.customTitles.length > LIMITS.MAX_CUSTOM_TITLES_PER_TOURNAMENT) {
            errors.push(`Custom titles exceed limit of ${LIMITS.MAX_CUSTOM_TITLES_PER_TOURNAMENT}`);
        }

        // Validate text fields in tournamentData
        if (data.organizers && data.organizers.length > LIMITS.MAX_ORGANIZER_LENGTH) {
            errors.push(`Organizers exceeds ${LIMITS.MAX_ORGANIZER_LENGTH} characters`);
        }
        if (data.tournamentDirector && data.tournamentDirector.length > LIMITS.MAX_ARBITER_LENGTH) {
            errors.push(`Tournament Director exceeds ${LIMITS.MAX_ARBITER_LENGTH} characters`);
        }
        if (data.chiefArbiter && data.chiefArbiter.length > LIMITS.MAX_ARBITER_LENGTH) {
            errors.push(`Chief Arbiter exceeds ${LIMITS.MAX_ARBITER_LENGTH} characters`);
        }
        if (data.location && data.location.length > LIMITS.MAX_LOCATION_LENGTH) {
            errors.push(`Location in tournamentData exceeds ${LIMITS.MAX_LOCATION_LENGTH} characters`);
        }
        if (data.timeControl && data.timeControl.length > LIMITS.MAX_TIME_CONTROL_LENGTH) {
            errors.push(`Time control in tournamentData exceeds ${LIMITS.MAX_TIME_CONTROL_LENGTH} characters`);
        }

        if (data.rounds && !Array.isArray(data.rounds)) {
            errors.push('Rounds must be an array');
        }

        if (Array.isArray(data.rounds)) {
            const roundNumbers = new Set<number>();

            data.rounds.forEach((round, roundIndex) => {
                const roundLabel = `Round ${roundIndex + 1}`;
                if (round.roundNumber !== undefined) {
                    if (!Number.isInteger(round.roundNumber) || round.roundNumber < 1) {
                        errors.push(`${roundLabel} has an invalid round number`);
                    } else if (roundNumbers.has(round.roundNumber)) {
                        errors.push(`Duplicate round number: ${round.roundNumber}`);
                    } else {
                        roundNumbers.add(round.roundNumber);
                    }
                }

                if (round.pairings && !Array.isArray(round.pairings)) {
                    errors.push(`${roundLabel} pairings must be an array`);
                    return;
                }

                const usedPlayerIds = new Set<string>();
                const pairings = round.pairings || [];

                pairings.forEach((pairing, pairingIndex) => {
                    const pairingLabel = `${roundLabel} pairing ${pairingIndex + 1}`;
                    const whiteId = pairing.whitePlayerId;
                    const blackId = pairing.blackPlayerId ?? null;

                    if (!whiteId) {
                        errors.push(`${pairingLabel} is missing a white player`);
                    } else {
                        if (playerIds.size > 0 && !playerIds.has(whiteId)) {
                            errors.push(`${pairingLabel} references unknown white player`);
                        }
                        if (usedPlayerIds.has(whiteId)) {
                            errors.push(`${pairingLabel} repeats a player`);
                        } else {
                            usedPlayerIds.add(whiteId);
                        }
                    }

                    if (blackId !== null) {
                        if (blackId === whiteId) {
                            errors.push(`${pairingLabel} pairs a player against themselves`);
                        }
                        if (playerIds.size > 0 && !playerIds.has(blackId)) {
                            errors.push(`${pairingLabel} references unknown black player`);
                        }
                        if (usedPlayerIds.has(blackId)) {
                            errors.push(`${pairingLabel} repeats a player`);
                        } else {
                            usedPlayerIds.add(blackId);
                        }
                    }

                    if (pairing.result !== undefined && pairing.result !== null && !VALID_RESULTS.has(pairing.result)) {
                        errors.push(`${pairingLabel} has invalid result`);
                    }
                });

                if (round.completed && pairings.some(p => p.result === null || p.result === undefined)) {
                    errors.push(`${roundLabel} is completed but has unset results`);
                }
            });
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Count user's existing tournaments
 */
async function countUserTournaments(tableName: string, userId: string): Promise<number> {
    try {
        // Query by creatorId using the secondary index
        const result = await docClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byCreatorId',
            KeyConditionExpression: 'creatorId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId,
            },
            Select: 'COUNT',
        }));
        return result.Count || 0;
    } catch (error) {
        console.error('Error counting user tournaments:', error);
        return 0;
    }
}

/**
 * In-memory rate limiter for Lambda
 * Tracks request timestamps per user within the Lambda container lifespan
 */
const userRequestTimestamps: Map<string, number[]> = new Map();

function checkRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const windowStart = now - LIMITS.RATE_LIMIT_WINDOW_MS;

    // Get existing timestamps for this user
    let timestamps = userRequestTimestamps.get(userId) || [];

    // Filter to only keep timestamps within the window
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= LIMITS.MAX_REQUESTS_PER_WINDOW) {
        // Rate limit exceeded
        const oldestTimestamp = timestamps[0];
        const retryAfterMs = oldestTimestamp + LIMITS.RATE_LIMIT_WINDOW_MS - now;
        return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    // Record this request
    timestamps.push(now);
    userRequestTimestamps.set(userId, timestamps);

    // Cleanup old entries periodically (every 100 requests)
    if (userRequestTimestamps.size > 100) {
        for (const [uid, ts] of userRequestTimestamps.entries()) {
            const filtered = ts.filter(t => t > windowStart);
            if (filtered.length === 0) {
                userRequestTimestamps.delete(uid);
            } else {
                userRequestTimestamps.set(uid, filtered);
            }
        }
    }

    return { allowed: true };
}

/**
 * Lambda handler for validated tournament mutations
 * Validates data AND saves to DynamoDB
 */
export const handler: Handler<AppSyncEvent, TournamentInput> = async (event) => {
    console.log('Validate tournament event:', JSON.stringify(event, null, 2));

    const input = event.arguments.input;
    const fieldName = event.info?.fieldName || 'unknown';
    const isCreate = fieldName === 'createTournamentValidated';

    console.log(`Environment check: TOURNAMENT_TABLE_NAME=${process.env.TOURNAMENT_TABLE_NAME}, AWS_REGION=${process.env.AWS_REGION}`);
    if (!process.env.TOURNAMENT_TABLE_NAME) {
        console.error('CRITICAL: TOURNAMENT_TABLE_NAME is missing from environment variables!');
    }

    // Get authenticated user ID
    let userId: string | undefined;
    if (event.identity) {
        const identity = event.identity as Record<string, unknown>;
        userId = (identity.sub as string) ||
            (identity.username as string) ||
            ((identity.claims as Record<string, string>)?.sub) ||
            ((identity.claims as Record<string, string>)?.['cognito:username']);
    }

    if (!userId) {
        throw new Error('Unauthorized: User not authenticated');
    }

    // Check server-side rate limit
    const rateLimitResult = checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
        const retrySeconds = Math.ceil((rateLimitResult.retryAfterMs || 1000) / 1000);
        throw new Error(`Rate limit exceeded. Please wait ${retrySeconds} seconds before trying again.`);
    }

    // Verify user owns this tournament
    if (input.creatorId !== userId) {
        throw new Error('Unauthorized: You can only modify your own tournaments');
    }

    // Validate the tournament data
    const validation = validateTournamentData(input);
    if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    }

    const tableName = getTableName();
    if (!tableName) {
        console.error('TOURNAMENT_TABLE_NAME environment variable not set');
        throw new Error('Server configuration error');
    }

    try {
        // Check if tournament exists
        const { Item: existing } = await docClient.send(new GetCommand({
            TableName: tableName,
            Key: { id: input.id },
        }));

        // For new tournaments, check user's tournament count
        if (isCreate && !existing) {
            const currentCount = await countUserTournaments(tableName, userId);
            if (currentCount >= LIMITS.MAX_TOURNAMENTS_PER_USER) {
                throw new Error(`Tournament limit reached. Maximum ${LIMITS.MAX_TOURNAMENTS_PER_USER} tournaments per user.`);
            }
        }

        // For updates, verify ownership of existing record
        if (existing && existing.creatorId !== userId) {
            throw new Error('Unauthorized: You can only modify your own tournaments');
        }

        const now = new Date().toISOString();

        // Prepare item to save
        const item: Record<string, unknown> = {
            id: input.id,
            name: input.name,
            description: input.description || null,
            location: input.location || null,
            federation: input.federation || null,
            startDate: input.startDate || null,
            endDate: input.endDate || null,
            timeControl: input.timeControl || null,
            format: input.format || null,
            totalRounds: input.totalRounds || null,
            currentRound: input.currentRound || null,
            playerCount: input.playerCount || null,
            status: input.status || null,
            creatorId: input.creatorId,
            creatorName: input.creatorName || null,
            tournamentData: input.tournamentData || null,
            playerDatabase: input.playerDatabase || null,
            updatedAt: now,
            owner: userId, // Required for owner-based authorization
        };

        if (existing) {
            // Update existing tournament
            console.log(`Updating tournament: ${input.id}`);

            const updateExpressions: string[] = [];
            const expressionAttributeNames: Record<string, string> = {};
            const expressionAttributeValues: Record<string, unknown> = {};

            Object.entries(item).forEach(([key, value]) => {
                if (key !== 'id') {
                    updateExpressions.push(`#${key} = :${key}`);
                    expressionAttributeNames[`#${key}`] = key;
                    expressionAttributeValues[`:${key}`] = value;
                }
            });

            await docClient.send(new UpdateCommand({
                TableName: tableName,
                Key: { id: input.id },
                UpdateExpression: 'SET ' + updateExpressions.join(', '),
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
            }));
        } else {
            // Create new tournament
            console.log(`Creating tournament: ${input.id}`);
            item.createdAt = now;

            await docClient.send(new PutCommand({
                TableName: tableName,
                Item: item,
            }));
        }

        console.log(`Tournament ${isCreate ? 'created' : 'updated'}: ${input.id}`);
        return input;
    } catch (error) {
        console.error('Failed to save tournament:', error);
        if (error instanceof Error) {
            throw error; // Re-throw validation/auth errors as-is
        }
        throw new Error('Failed to save tournament');
    }
};

export { handler as validateTournament };
