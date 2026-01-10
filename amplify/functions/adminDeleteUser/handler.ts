import type { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ADMIN_USERNAMES } from '../../../shared/constants';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

interface AppSyncEvent {
    arguments: {
        userId: string;
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
    console.log('Admin delete user event:', JSON.stringify(event, null, 2));

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

    const targetUserId = event.arguments.userId;

    // 2. Authorization Check (Admin or self)
    if (callerSub !== targetUserId) {
        // Fetch caller's profile to get username
        const { Item: callerProfile } = await docClient.send(new GetCommand({
            TableName: userTableName,
            Key: { id: callerSub }
        }));

        if (!callerProfile || !callerProfile.username || !ADMIN_USERNAMES.includes(callerProfile.username)) {
            throw new Error("Unauthorized: Only admins can perform this action.");
        }

        console.log(`Admin ${callerProfile.username} deleting user ${targetUserId}`);
    } else {
        console.log(`User ${callerSub} deleting own account`);
    }

    // 3. Delete Tournaments
    try {
        // Query all tournaments by creatorId
        let tournamentsToDelete: any[] = [];
        let nextToken: Record<string, any> | undefined = undefined; // Fix explicit type for LastEvaluatedKey

        do {
            // @ts-ignore - QueryCommand input types can be tricky with exact Match
            const result = await docClient.send(new QueryCommand({
                TableName: tournamentTableName,
                IndexName: 'byCreatorId',
                KeyConditionExpression: 'creatorId = :uid',
                ExpressionAttributeValues: {
                    ':uid': targetUserId
                },
                ExclusiveStartKey: nextToken
            }));

            if (result.Items) {
                tournamentsToDelete.push(...result.Items);
            }
            nextToken = result.LastEvaluatedKey;
        } while (nextToken);

        console.log(`Found ${tournamentsToDelete.length} tournaments to delete for user ${targetUserId}`);

        // Delete each tournament
        // We do this in parallel chunks to avoid throttling if there are many
        const CHUNK_SIZE = 5;
        for (let i = 0; i < tournamentsToDelete.length; i += CHUNK_SIZE) {
            const chunk = tournamentsToDelete.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(t =>
                docClient.send(new DeleteCommand({
                    TableName: tournamentTableName,
                    Key: { id: t.id }
                }))
            ));
        }
    } catch (e) {
        console.error('Error deleting user tournaments:', e);
        // We continue to delete the user record even if tournament deletion fails partially
        // to ensure we at least remove the user from the system
    }

    // 4. Delete User Profile
    try {
        await docClient.send(new DeleteCommand({
            TableName: userTableName,
            Key: { id: targetUserId }
        }));
        console.log(`Deleted user record ${targetUserId}`);
    } catch (e) {
        console.error('Error deleting user record:', e);
        throw new Error("Failed to delete user record");
    }

    return true;
};
