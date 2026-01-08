'use client';

import { client, publicClient } from './graphql-client';
import type { Tournament } from './tournament-store';

/**
 * Tournament Sync Service
 * Handles synchronization between local Tournament objects and DynamoDB
 */

// Convert local Tournament to DynamoDB format
function tournamentToDbFormat(tournament: Tournament, userId: string, userName?: string) {
    // Determine status based on rounds
    let status: 'DRAFT' | 'ONGOING' | 'COMPLETED' = 'DRAFT';
    if (tournament.rounds.length > 0) {
        const allComplete = tournament.rounds.every(r => r.completed);
        const isLastRound = tournament.rounds.length >= tournament.totalRounds;
        if (allComplete && isLastRound) {
            status = 'COMPLETED';
        } else {
            status = 'ONGOING';
        }
    }

    return {
        id: tournament.id,
        name: tournament.name,
        description: tournament.system === 'normal-swiss' ? 'Swiss System' : 'Round Robin',
        location: tournament.location || null,
        federation: tournament.federation || null,
        startDate: tournament.startDate || null,
        endDate: tournament.endDate || null,
        timeControl: tournament.timeControl || null,
        format: tournament.system,
        totalRounds: tournament.totalRounds,
        currentRound: tournament.rounds.length,
        playerCount: tournament.players.length,
        status,
        creatorId: userId,
        creatorName: userName || null,
        // Store the full tournament data as JSON for complex structures
        tournamentData: JSON.stringify(tournament),
        playerDatabase: JSON.stringify(tournament.playerDatabase || []),
    };
}

// Convert DynamoDB format back to local Tournament
function dbToTournamentFormat(dbTournament: any): Tournament {
    // If we have tournamentData JSON, parse and return it
    if (dbTournament.tournamentData) {
        try {
            const parsed = JSON.parse(dbTournament.tournamentData);
            // Ensure the ID matches
            parsed.id = dbTournament.id;
            // Add cloud-specific fields
            parsed.creatorId = dbTournament.creatorId;
            parsed.creatorName = dbTournament.creatorName;

            // Parse player database if it exists
            if (dbTournament.playerDatabase) {
                try {
                    parsed.playerDatabase = JSON.parse(dbTournament.playerDatabase);
                } catch (e) {
                    console.error('Failed to parse playerDatabase:', e);
                    parsed.playerDatabase = [];
                }
            }

            return parsed as Tournament;
        } catch (e) {
            console.error('Failed to parse tournamentData:', e);
        }
    }

    // Fallback: construct from flat fields (minimal data)
    return {
        id: dbTournament.id,
        name: dbTournament.name,
        system: dbTournament.format || 'normal-swiss',
        byeValue: 1,
        totalRounds: dbTournament.totalRounds || 7,
        allowChangingResults: false,
        createdAt: dbTournament.createdAt || new Date().toISOString(),
        players: [],
        rounds: [],
        location: dbTournament.location || undefined,
        federation: dbTournament.federation || undefined,
        timeControl: dbTournament.timeControl || undefined,
        startDate: dbTournament.startDate || undefined,
        endDate: dbTournament.endDate || undefined,
        creatorId: dbTournament.creatorId,
        creatorName: dbTournament.creatorName,
    } as Tournament;
}

/**
 * Save or update a tournament in DynamoDB using validated mutations
 * These mutations pass through Lambda validation and save to DynamoDB
 */
export async function syncTournamentToCloud(
    tournament: Tournament,
    userId: string,
    userName?: string
): Promise<boolean> {
    try {
        const dbData = tournamentToDbFormat(tournament, userId, userName);
        console.log('[Sync] Starting sync for tournament:', tournament.id);
        console.log('[Sync] Client model:', client.models.Tournament);

        // Check if tournament exists to determine create vs update
        const { data: existing } = await client.models.Tournament.get({ id: tournament.id });
        console.log('[Sync] Existing tournament check result:', existing);

        if (existing) {
            // Update existing tournament via validated mutation
            console.log('[Sync] Updating existing tournament...');
            await (client as any).mutations.updateTournamentValidated({ input: dbData });
        } else {
            // Create new tournament via validated mutation
            console.log('[Sync] Creating new tournament...');
            const result = await (client as any).mutations.createTournamentValidated({ input: dbData });
            console.log('[Sync] Create result:', JSON.stringify(result, null, 2));
        }

        console.log('Tournament synced to cloud:', tournament.id);
        return true;
    } catch (error) {
        console.error('Failed to sync tournament to cloud:', error);
        throw error; // Re-throw to let caller handle the error
    }
}


/**
 * Delete a tournament from DynamoDB (owner-only)
 */
export async function deleteTournamentFromCloud(tournamentId: string): Promise<boolean> {
    console.log('[deleteTournament] Starting delete for tournament:', tournamentId);
    try {
        const { data, errors } = await client.models.Tournament.delete({ id: tournamentId });
        console.log('[deleteTournament] Delete result:', data);
        if (errors) {
            console.error('[deleteTournament] Delete errors:', JSON.stringify(errors, null, 2));
            return false;
        }
        console.log('[deleteTournament] Tournament deleted from cloud:', tournamentId);
        return true;
    } catch (error) {
        console.error('[deleteTournament] Failed to delete tournament from cloud:', error);
        return false;
    }
}

/**
 * Admin-only delete tournament from DynamoDB (bypasses owner check)
 */
export async function adminDeleteTournamentFromCloud(tournamentId: string): Promise<boolean> {
    console.log('[adminDeleteTournament] Admin deleting tournament:', tournamentId);
    try {
        const result = await (client as any).mutations.adminDeleteTournament({
            tournamentId
        });
        console.log('[adminDeleteTournament] Result:', result);
        if (result.errors) {
            console.error('[adminDeleteTournament] Errors:', JSON.stringify(result.errors, null, 2));
            return false;
        }
        console.log('[adminDeleteTournament] Tournament deleted by admin:', tournamentId);
        return true;
    } catch (error) {
        console.error('[adminDeleteTournament] Failed to delete tournament:', error);
        return false;
    }
}

/**
 * Load all tournaments for a specific user from DynamoDB
 */
export async function loadUserTournaments(userId: string): Promise<Tournament[]> {
    try {
        console.log('[Sync] Loading tournaments for user:', userId);
        const { data } = await client.models.Tournament.list({
            filter: { creatorId: { eq: userId } }
        });
        console.log('[Sync] Loaded tournaments count:', data?.length);

        if (!data) return [];

        return data.map(dbToTournamentFormat);
    } catch (error) {
        console.error('Failed to load tournaments from cloud:', error);
        return [];
    }
}

/**
 * Load all tournaments from DynamoDB (all users)
 * Uses public client (API key auth) to allow unauthenticated access
 */
export async function loadAllTournaments(): Promise<Tournament[]> {
    try {
        const { data } = await publicClient.models.Tournament.list();

        if (!data) return [];

        return data.map(dbToTournamentFormat);
    } catch (error) {
        console.error('Failed to load all tournaments from cloud:', error);
        return [];
    }
}

/**
 * Load a single tournament from DynamoDB by ID
 * Uses public client (API key auth) to allow unauthenticated access
 */
export async function loadTournamentFromCloud(tournamentId: string): Promise<Tournament | null> {
    try {
        // Use publicClient for reads - allows unauthenticated access
        const { data } = await publicClient.models.Tournament.get({ id: tournamentId });

        if (!data) return null;

        return dbToTournamentFormat(data);
    } catch (error) {
        console.error('Failed to load tournament from cloud:', error);
        return null;
    }
}
