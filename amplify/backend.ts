import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { validateTournament, validateUser, adminDeleteUser, adminDeleteTournament } from './function-definitions';
import * as lambda from 'aws-cdk-lib/aws-lambda';

// ============================================================================
// Backend Definition
// ============================================================================

/**
 * @see https://docs.amplify.aws/react/build-a-backend/
 */
const backend = defineBackend({
    auth,
    data,
    validateTournament,
    validateUser,
    adminDeleteUser,
    adminDeleteTournament,
});

// ============================================================================
// Lambda Permissions
// ============================================================================

// Get table references
const tournamentTable = backend.data.resources.tables['Tournament'];
const userTable = backend.data.resources.tables['User'];

// validateTournament permissions
const validateTournamentLambda = backend.validateTournament.resources.lambda as lambda.Function;
validateTournamentLambda.addEnvironment('TOURNAMENT_TABLE_NAME', tournamentTable.tableName);
tournamentTable.grantReadWriteData(validateTournamentLambda);

// validateUser permissions
const validateUserLambda = backend.validateUser.resources.lambda as lambda.Function;
validateUserLambda.addEnvironment('USER_TABLE_NAME', userTable.tableName);
userTable.grantReadWriteData(validateUserLambda);

// adminDeleteUser permissions (needs access to both tables)
const adminDeleteUserLambda = backend.adminDeleteUser.resources.lambda as lambda.Function;
adminDeleteUserLambda.addEnvironment('USER_TABLE_NAME', userTable.tableName);
adminDeleteUserLambda.addEnvironment('TOURNAMENT_TABLE_NAME', tournamentTable.tableName);
userTable.grantReadWriteData(adminDeleteUserLambda);
tournamentTable.grantReadWriteData(adminDeleteUserLambda);

// adminDeleteTournament permissions (needs access to both tables for admin check)
const adminDeleteTournamentLambda = backend.adminDeleteTournament.resources.lambda as lambda.Function;
adminDeleteTournamentLambda.addEnvironment('USER_TABLE_NAME', userTable.tableName);
adminDeleteTournamentLambda.addEnvironment('TOURNAMENT_TABLE_NAME', tournamentTable.tableName);
userTable.grantReadData(adminDeleteTournamentLambda); // Only needs read for admin check
tournamentTable.grantReadWriteData(adminDeleteTournamentLambda);
