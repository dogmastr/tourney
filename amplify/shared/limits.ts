/**
 * Shared Resource Limits
 * 
 * This file is the single source of truth for resource limits used by both
 * Lambda functions and the frontend application.
 * 
 * IMPORTANT: When modifying limits, consider the impact on both client and server.
 */

export const LIMITS = {
    // Tournament limits
    MAX_TOURNAMENTS_PER_USER: 10,
    MAX_TOURNAMENT_NAME_LENGTH: 100,
    MIN_TOURNAMENT_NAME_LENGTH: 1,

    // Round limits
    MAX_ROUNDS_PER_TOURNAMENT: 50,
    MIN_ROUNDS_PER_TOURNAMENT: 1,

    // Player limits
    MAX_PLAYERS_PER_TOURNAMENT: 300,
    MAX_PLAYER_NAME_LENGTH: 100,
    MIN_PLAYER_NAME_LENGTH: 1,
    MAX_RATING: 1000000,
    MIN_RATING: 0,
    MAX_TITLES_PER_PLAYER: 5,

    // Custom title limits
    MAX_CUSTOM_TITLES_PER_TOURNAMENT: 10,
    MAX_TITLE_NAME_LENGTH: 20,

    // Text field limits
    MAX_DESCRIPTION_LENGTH: 100,
    MAX_LOCATION_LENGTH: 100,
    MAX_TIME_CONTROL_LENGTH: 50,
    MAX_ORGANIZER_LENGTH: 100,
    MAX_ARBITER_LENGTH: 100,

    // Rate limiting
    MUTATIONS_PER_MINUTE: 30,
    RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS_PER_WINDOW: 30,

    // User profile limits
    MAX_USERNAME_LENGTH: 20,
    MIN_USERNAME_LENGTH: 3,
    MAX_BIO_LENGTH: 500,
    BIO_UPDATE_COOLDOWN_MS: 30 * 1000, // 30 seconds between bio updates

    // Import limits
    MAX_CSV_FILE_SIZE_BYTES: 100 * 1024, // 100KB
    MAX_TOURNAMENT_DATA_LENGTH: 200 * 1024, // 200KB
} as const;

/**
 * Validation error messages
 */
export const LIMIT_MESSAGES = {
    TOURNAMENT_LIMIT_REACHED: `You can create a maximum of ${LIMITS.MAX_TOURNAMENTS_PER_USER} tournaments.`,
    PLAYER_LIMIT_REACHED: `A tournament can have a maximum of ${LIMITS.MAX_PLAYERS_PER_TOURNAMENT} players.`,
    ROUND_LIMIT_REACHED: `A tournament can have a maximum of ${LIMITS.MAX_ROUNDS_PER_TOURNAMENT} rounds.`,
    TITLE_LIMIT_REACHED: `A tournament can have a maximum of ${LIMITS.MAX_CUSTOM_TITLES_PER_TOURNAMENT} custom titles.`,
    RATE_LIMIT_EXCEEDED: 'Too many requests. Please wait around 1 minute before trying again.',
    INVALID_TOURNAMENT_NAME: `Tournament name must be between ${LIMITS.MIN_TOURNAMENT_NAME_LENGTH} and ${LIMITS.MAX_TOURNAMENT_NAME_LENGTH} characters.`,
    INVALID_PLAYER_NAME: `Player name must be between ${LIMITS.MIN_PLAYER_NAME_LENGTH} and ${LIMITS.MAX_PLAYER_NAME_LENGTH} characters.`,
    INVALID_RATING: `Rating must be between ${LIMITS.MIN_RATING} and ${LIMITS.MAX_RATING}.`,
    INVALID_ROUNDS: `Rounds must be between ${LIMITS.MIN_ROUNDS_PER_TOURNAMENT} and ${LIMITS.MAX_ROUNDS_PER_TOURNAMENT}.`,
} as const;
