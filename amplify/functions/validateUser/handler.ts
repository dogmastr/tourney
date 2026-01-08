import type { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LIMITS } from '../../shared/limits';

interface UserInput {
    id: string;
    email?: string;
    username?: string;
    bio?: string;
}

interface ValidationResult {
    valid: boolean;
    errors: string[];
}

interface AppSyncEvent {
    arguments: {
        input: UserInput;
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
    return process.env.USER_TABLE_NAME || '';
};

/**
 * Validate username
 */
function validateUsername(username: string): ValidationResult {
    const errors: string[] = [];

    if (!username || typeof username !== 'string') {
        errors.push('Username is required');
        return { valid: false, errors };
    }

    const trimmed = username.trim();

    if (trimmed.length < LIMITS.MIN_USERNAME_LENGTH) {
        errors.push(`Username must be at least ${LIMITS.MIN_USERNAME_LENGTH} characters`);
    }

    if (trimmed.length > LIMITS.MAX_USERNAME_LENGTH) {
        errors.push(`Username cannot exceed ${LIMITS.MAX_USERNAME_LENGTH} characters`);
    }

    // Alphanumeric and underscore only
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(trimmed)) {
        errors.push('Username can only contain letters, numbers, and underscores');
    }

    // Cannot start with a number
    if (/^[0-9]/.test(trimmed)) {
        errors.push('Username cannot start with a number');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate bio
 */
function validateBio(bio: string): ValidationResult {
    const errors: string[] = [];

    if (bio && bio.length > LIMITS.MAX_BIO_LENGTH) {
        errors.push(`Bio cannot exceed ${LIMITS.MAX_BIO_LENGTH} characters`);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Check if username is already taken by another user
 */
async function isUsernameTaken(tableName: string, username: string, currentUserId: string): Promise<boolean> {
    try {
        const result = await docClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byUsername',
            KeyConditionExpression: 'username = :username',
            ExpressionAttributeValues: {
                ':username': username,
            },
        }));

        // Check if any results belong to a different user
        if (result.Items && result.Items.length > 0) {
            return result.Items.some(item => item.id !== currentUserId);
        }
        return false;
    } catch (error) {
        console.error('Error checking username availability:', error);
        return false; // Allow on error to not block legitimate requests
    }
}

/**
 * In-memory rate limiter for Lambda
 */
const userRequestTimestamps: Map<string, number[]> = new Map();
const bioUpdateTimestamps: Map<string, number> = new Map();

function checkRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const windowStart = now - LIMITS.RATE_LIMIT_WINDOW_MS;

    let timestamps = userRequestTimestamps.get(userId) || [];
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= LIMITS.MAX_REQUESTS_PER_WINDOW) {
        const oldestTimestamp = timestamps[0];
        const retryAfterMs = oldestTimestamp + LIMITS.RATE_LIMIT_WINDOW_MS - now;
        return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    timestamps.push(now);
    userRequestTimestamps.set(userId, timestamps);

    return { allowed: true };
}

function checkBioRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const lastUpdate = bioUpdateTimestamps.get(userId) || 0;

    if (now - lastUpdate < LIMITS.BIO_UPDATE_COOLDOWN_MS) {
        const retryAfterMs = LIMITS.BIO_UPDATE_COOLDOWN_MS - (now - lastUpdate);
        return { allowed: false, retryAfterMs };
    }

    bioUpdateTimestamps.set(userId, now);
    return { allowed: true };
}

/**
 * Lambda handler for validated user mutations
 */
export const handler: Handler<AppSyncEvent, UserInput> = async (event) => {
    console.log('Validate user event:', JSON.stringify(event, null, 2));

    const input = event.arguments.input;
    const fieldName = event.info?.fieldName || 'unknown';

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

    // Verify user is modifying their own record
    if (input.id !== userId) {
        throw new Error('Unauthorized: You can only modify your own profile');
    }

    // Check general rate limit
    const rateLimitResult = checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
        const retrySeconds = Math.ceil((rateLimitResult.retryAfterMs || 1000) / 1000);
        throw new Error(`Rate limit exceeded. Please wait ${retrySeconds} seconds.`);
    }

    const tableName = getTableName();
    if (!tableName) {
        console.error('USER_TABLE_NAME environment variable not set');
        throw new Error('Server configuration error');
    }

    try {
        // Get existing user record
        const { Item: existing } = await docClient.send(new GetCommand({
            TableName: tableName,
            Key: { id: input.id },
        }));

        const now = new Date().toISOString();
        const updateExpressions: string[] = [];
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, unknown> = {};

        // Validate and prepare username update
        if (input.username !== undefined) {
            // Check if user already has a username (username is permanent once set)
            if (existing?.username && existing.username !== input.username) {
                throw new Error('Username cannot be changed once set');
            }

            const usernameValidation = validateUsername(input.username);
            if (!usernameValidation.valid) {
                throw new Error(`Username validation failed: ${usernameValidation.errors.join('; ')}`);
            }

            // Check uniqueness
            const taken = await isUsernameTaken(tableName, input.username.trim(), input.id);
            if (taken) {
                throw new Error('Username is already taken');
            }

            updateExpressions.push('#username = :username');
            expressionAttributeNames['#username'] = 'username';
            expressionAttributeValues[':username'] = input.username.trim();
        }

        // Validate and prepare bio update
        if (input.bio !== undefined) {
            // Check bio-specific rate limit
            const bioRateLimitResult = checkBioRateLimit(userId);
            if (!bioRateLimitResult.allowed) {
                const retrySeconds = Math.ceil((bioRateLimitResult.retryAfterMs || 1000) / 1000);
                throw new Error(`Please wait ${retrySeconds} seconds before updating your bio again.`);
            }

            const bioValidation = validateBio(input.bio);
            if (!bioValidation.valid) {
                throw new Error(`Bio validation failed: ${bioValidation.errors.join('; ')}`);
            }

            updateExpressions.push('#bio = :bio');
            expressionAttributeNames['#bio'] = 'bio';
            expressionAttributeValues[':bio'] = input.bio;

            updateExpressions.push('#lastBioUpdate = :lastBioUpdate');
            expressionAttributeNames['#lastBioUpdate'] = 'lastBioUpdate';
            expressionAttributeValues[':lastBioUpdate'] = now;
        }

        // Always update updatedAt
        updateExpressions.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = now;

        if (existing) {
            // Update existing user
            await docClient.send(new UpdateCommand({
                TableName: tableName,
                Key: { id: input.id },
                UpdateExpression: 'SET ' + updateExpressions.join(', '),
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
            }));
        } else {
            // Create new user record
            const item: Record<string, unknown> = {
                id: input.id,
                email: input.email || '',
                username: input.username?.trim() || null,
                bio: input.bio || null,
                createdAt: now,
                updatedAt: now,
                owner: userId,
            };

            await docClient.send(new PutCommand({
                TableName: tableName,
                Item: item,
            }));
        }

        console.log(`User ${fieldName} completed: ${input.id}`);
        return input;
    } catch (error) {
        console.error('Failed to save user:', error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('Failed to save user');
    }
};

export { handler as validateUser };