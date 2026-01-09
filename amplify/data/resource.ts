import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { validateTournament, validateUser, adminDeleteUser, adminDeleteTournament } from '../function-definitions';

/**
 * Tournament Manager Data Schema
 * @see https://docs.amplify.aws/gen2/build-a-backend/data/data-modeling
 */
const schema = a.schema({
    // Tournament status enum
    TournamentStatus: a.enum([
        'DRAFT',
        'REGISTRATION_OPEN',
        'ONGOING',
        'COMPLETED',
        'CANCELLED',
    ]),

    // Registration status enum
    RegistrationStatus: a.enum([
        'PENDING',
        'APPROVED',
        'REJECTED',
        'CANCELLED',
    ]),

    // Tournament input type for validated mutations
    TournamentInput: a.customType({
        id: a.id().required(),
        name: a.string().required(),
        description: a.string(),
        location: a.string(),
        federation: a.string(),
        startDate: a.date(),
        endDate: a.date(),
        timeControl: a.string(),
        format: a.string(),
        totalRounds: a.integer(),
        currentRound: a.integer(),
        playerCount: a.integer(),
        status: a.string(),
        creatorId: a.id().required(),
        creatorName: a.string(),
        tournamentData: a.json(),
        playerDatabase: a.json(),
    }),

    // User input type for validated mutations
    UserInput: a.customType({
        id: a.id().required(),
        email: a.string(),
        username: a.string(),
        bio: a.string(),
    }),

    // User model
    User: a
        .model({
            email: a.string().required(),
            // Username is permanent and unique - set during first login
            username: a.string(),
            // Bio/description for public profile (max 500 chars)
            bio: a.string(),
            // Timestamp of last bio update for rate limiting
            lastBioUpdate: a.datetime(),
            tournaments: a.hasMany('Tournament', 'creatorId'),
            registrations: a.hasMany('Registration', 'userId'),
            owner: a.string().authorization((allow) => [allow.owner().to(['read'])]),
        })
        .secondaryIndexes((index) => [
            index('username').name('byUsername'),
        ])
        .authorization((allow) => [
            // Owner can read and delete (updates must go through updateUserValidated)
            allow.owner().to(['read', 'delete']),
            allow.publicApiKey().to(['read']),
            allow.authenticated().to(['read']),
        ]),

    // Tournament model
    Tournament: a
        .model({
            name: a.string().required(),
            description: a.string(),
            location: a.string(),
            federation: a.string(),
            startDate: a.date(),
            endDate: a.date(),
            timeControl: a.string(),
            format: a.string(),
            totalRounds: a.integer(),
            currentRound: a.integer(),
            playerCount: a.integer(),
            status: a.ref('TournamentStatus'),
            creatorId: a.id().required(),
            creatorName: a.string(),
            // Store full tournament data as JSON for complex nested structures
            // This includes players, rounds, pairings, etc.
            tournamentData: a.json(),
            // Player database for import/export feature
            playerDatabase: a.json(),
            // Relationships
            creator: a.belongsTo('User', 'creatorId'),
            registrations: a.hasMany('Registration', 'tournamentId'),
        })
        .secondaryIndexes((index) => [
            index('creatorId').name('byCreatorId'),
        ])
        .authorization((allow) => [
            // Creator can read and delete (updates must go through validated mutations)
            allow.ownerDefinedIn('creatorId').to(['read', 'delete']),
            allow.publicApiKey().to(['read']),
            allow.authenticated().to(['read']),
        ]),

    // Registration model
    Registration: a
        .model({
            userId: a.id().required(),
            userName: a.string().required(),
            tournamentId: a.id().required(),
            tournamentName: a.string(),
            status: a.ref('RegistrationStatus'),
            registeredAt: a.datetime(),
            user: a.belongsTo('User', 'userId'),
            tournament: a.belongsTo('Tournament', 'tournamentId'),
            owner: a.string().authorization((allow) => [allow.owner().to(['read'])]),
        })
        .authorization((allow) => [
            allow.owner(),
            allow.publicApiKey().to(['read']),
        ]),

    // Validated tournament mutations - Lambda validates and saves to DynamoDB
    createTournamentValidated: a
        .mutation()
        .arguments({
            input: a.ref('TournamentInput').required(),
        })
        .returns(a.ref('TournamentInput'))
        .handler(a.handler.function(validateTournament))
        .authorization((allow) => [allow.authenticated()]),

    updateTournamentValidated: a
        .mutation()
        .arguments({
            input: a.ref('TournamentInput').required(),
        })
        .returns(a.ref('TournamentInput'))
        .handler(a.handler.function(validateTournament))
        .authorization((allow) => [allow.authenticated()]),

    // Validated user mutations - Lambda validates username/bio and saves to DynamoDB
    updateUserValidated: a
        .mutation()
        .arguments({
            input: a.ref('UserInput').required(),
        })
        .returns(a.ref('UserInput'))
        .handler(a.handler.function(validateUser))
        .authorization((allow) => [allow.authenticated()]),

    // Admin mutation to delete any user account
    adminDeleteUser: a
        .mutation()
        .arguments({
            userId: a.id().required(),
        })
        .returns(a.boolean())
        .handler(a.handler.function(adminDeleteUser))
        .authorization((allow) => [allow.authenticated()]),

    // Admin mutation to delete any tournament
    adminDeleteTournament: a
        .mutation()
        .arguments({
            tournamentId: a.id().required(),
        })
        .returns(a.boolean())
        .handler(a.handler.function(adminDeleteTournament))
        .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
    schema,
    authorizationModes: {
        defaultAuthorizationMode: 'userPool',
        apiKeyAuthorizationMode: {
            expiresInDays: 365,
        },
    },
});
