import type { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ADMIN_USERNAMES } from '../../shared/constants';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

interface AppSyncEvent {
    arguments: {
        tournamentId: string;
    };
    identity?: {
        sub?: string;
        username?: string;
        claims?: {
            sub?: string;
            'cognito:username'?: string;
        };
    };
}

export const handler: Handler<AppSyncEvent, boolean> = async (event) => {
    console.log('Admin delete tournament event:', JSON.stringify(event, null, 2));

    // 1. Authenticate caller
    let callerSub: string | undefined;
    if (event.identity) {
        const identity = event.identity as Record<string, unknown>;
        callerSub = (identity.sub as string) ||
            (identity.username as string) ||
            ((identity.claims as Record<string, string>)?.sub) ||
            ((identity.claims as Record<string, string>)?.['cognito:username']);
    }

    if (!callerSub) {
        throw new Error("Unauthorized");
    }

    const userTableName = process.env.USER_TABLE_NAME;
    const tournamentTableName = process.env.TOURNAMENT_TABLE_NAME;

    if (!userTableName || !tournamentTableName) {
        console.error('Missing table configuration', { userTableName, tournamentTableName });
        throw new Error("Server configuration error");
    }

    // 2. Authorization Check (Is Caller an Admin?)
    const { Item: callerProfile } = await docClient.send(new GetCommand({
        TableName: userTableName,
        Key: { id: callerSub }
    }));

    if (!callerProfile || !callerProfile.username || !ADMIN_USERNAMES.includes(callerProfile.username)) {
        throw new Error("Unauthorized: Only admins can perform this action.");
    }

    const targetTournamentId = event.arguments.tournamentId;
    console.log(`Admin ${callerProfile.username} deleting tournament ${targetTournamentId}`);

    // 3. Delete Tournament
    try {
        await docClient.send(new DeleteCommand({
            TableName: tournamentTableName,
            Key: { id: targetTournamentId }
        }));
        console.log(`Deleted tournament ${targetTournamentId}`);
    } catch (e) {
        console.error('Error deleting tournament:', e);
        throw new Error("Failed to delete tournament");
    }

    return true;
};
