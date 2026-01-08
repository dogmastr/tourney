'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { loadAllTournaments } from '@/lib/tournament-sync';
import type { Tournament } from '@/lib/tournament-store';

/**
 * Hook for loading all tournaments from DynamoDB cloud storage
 */
export function useCloudTournaments() {
    const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadTournaments = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const cloudTournaments = await loadAllTournaments();
            setTournaments(cloudTournaments);
        } catch (err) {
            console.error('Failed to load cloud tournaments:', err);
            setError('Failed to load tournaments from cloud');
            setTournaments([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isAuthLoading) {
            loadTournaments();
        }
    }, [isAuthLoading, loadTournaments]);

    const refresh = useCallback(() => {
        loadTournaments();
    }, [loadTournaments]);

    return {
        tournaments,
        isLoading: isAuthLoading || isLoading,
        error,
        refresh,
        isAuthenticated,
    };
}
