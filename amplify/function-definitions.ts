/**
 * Lambda Function Definitions
 * 
 * Defines all Lambda functions used in the data schema.
 * These are referenced by the GraphQL mutations in data/resource.ts.
 */

import { defineFunction } from '@aws-amplify/backend';

/**
 * Validates tournament data and saves to DynamoDB.
 * Enforces resource limits like max players, rounds, etc.
 */
export const validateTournament = defineFunction({
    name: 'validateTournament',
    entry: './functions/validateTournament/handler.ts',
    resourceGroupName: 'data',
});

/**
 * Validates user profile data and saves to DynamoDB.
 * Enforces username uniqueness and bio length limits.
 */
export const validateUser = defineFunction({
    name: 'validateUser',
    entry: './functions/validateUser/handler.ts',
    resourceGroupName: 'data',
});

/**
 * Admin-only function to delete any user account.
 * Deletes the user's profile and all their tournaments.
 */
export const adminDeleteUser = defineFunction({
    name: 'adminDeleteUser',
    entry: './functions/adminDeleteUser/handler.ts',
    resourceGroupName: 'data',
});

/**
 * Admin-only function to delete any tournament.
 * Bypasses owner-only authorization.
 */
export const adminDeleteTournament = defineFunction({
    name: 'adminDeleteTournament',
    entry: './functions/adminDeleteTournament/handler.ts',
    resourceGroupName: 'data',
});
