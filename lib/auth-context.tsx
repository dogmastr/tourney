'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    signInWithRedirect,
    signOut,
    getCurrentUser,
    fetchAuthSession,
    deleteUser,
    AuthUser
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { ADMIN_USERNAMES } from './constants';

interface AuthContextType {
    user: AuthUser | null;
    username: string | null; // Permanent profile username
    needsSetup: boolean; // True if user hasn't set a username yet
    isLoading: boolean;
    isAuthenticated: boolean;
    isAdmin: boolean;
    signInWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    getAccessToken: () => Promise<string | undefined>;
    refreshUser: () => Promise<void>; // Trigger re-check of user data
    deleteAccount: () => Promise<void>; // Delete User from DB and Cognito
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [needsSetup, setNeedsSetup] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        checkUser();

        // Listen for auth events
        const unsubscribe = Hub.listen('auth', ({ payload }) => {
            switch (payload.event) {
                case 'signInWithRedirect':
                    checkUser();
                    break;
                case 'signedOut':
                    setUser(null);
                    setUsername(null);
                    setNeedsSetup(false);
                    break;
                case 'signInWithRedirect_failure':
                    console.error('Sign in failure:', payload.data);
                    break;
            }
        });

        return () => unsubscribe();
    }, []);

    async function checkUser() {
        try {
            const currentUser = await getCurrentUser();
            setUser(currentUser);

            // Import client dynamically to avoid circular dependencies
            const { client } = await import('./graphql-client');

            // Try to get user profile from DynamoDB
            try {
                const { data } = await client.models.User.get({ id: currentUser.userId });

                if (data?.username) {
                    setUsername(data.username);
                    setNeedsSetup(false);
                } else {
                    // User exists but hasn't set username
                    setNeedsSetup(true);
                }

                // If we got user data, we're done
                if (data) {
                    setIsLoading(false);
                    return;
                }
            } catch {
                // User record might not exist yet
            }

            // New user - needs setup
            setNeedsSetup(true);
        } catch {
            setUser(null);
            setUsername(null);
            setNeedsSetup(false);
        } finally {
            setIsLoading(false);
        }
    }

    async function signInWithGoogle() {
        try {
            await signInWithRedirect({ provider: 'Google' });
        } catch (error) {
            console.error('Error signing in with Google:', error);
            throw error;
        }
    }

    async function logout() {
        try {
            await signOut();
            setUser(null);
            setUsername(null);
            setNeedsSetup(false);
        } catch (error) {
            console.error('Error signing out:', error);
            throw error;
        }
    }

    async function getAccessToken(): Promise<string | undefined> {
        try {
            const session = await fetchAuthSession();
            return session.tokens?.accessToken?.toString();
        } catch {
            return undefined;
        }
    }

    async function refreshUser() {
        await checkUser();
    }

    async function deleteAccount() {
        console.log('[deleteAccount] Starting account deletion...');
        try {
            const currentUser = await getCurrentUser();
            console.log('[deleteAccount] Current user ID:', currentUser.userId);

            const { client } = await import('./graphql-client');

            // 1. Fetch and delete all tournaments created by this user
            try {
                console.log('[deleteAccount] Fetching user tournaments...');
                const { data: userTournaments, errors: tournamentErrors } = await client.models.Tournament.list({
                    filter: { creatorId: { eq: currentUser.userId } }
                });

                if (tournamentErrors) {
                    console.error('[deleteAccount] Error fetching tournaments:', tournamentErrors);
                }

                if (userTournaments && userTournaments.length > 0) {
                    console.log(`[deleteAccount] Found ${userTournaments.length} tournaments to delete`);
                    await Promise.all(
                        userTournaments.map(t => client.models.Tournament.delete({ id: t.id }))
                    );
                    console.log(`[deleteAccount] Deleted ${userTournaments.length} tournaments`);
                } else {
                    console.log('[deleteAccount] No tournaments to delete');
                }
            } catch (error) {
                console.error('[deleteAccount] Error deleting user tournaments:', error);
            }

            // 2. Delete user profile from DynamoDB
            console.log('[deleteAccount] Deleting user profile from DynamoDB...');
            try {
                const { data: deleteResult, errors: deleteErrors } = await client.models.User.delete({ id: currentUser.userId });
                console.log('[deleteAccount] Delete result:', deleteResult);
                if (deleteErrors) {
                    console.error('[deleteAccount] Delete errors:', deleteErrors);
                    throw new Error(`Failed to delete user: ${JSON.stringify(deleteErrors)}`);
                }
                console.log('[deleteAccount] User record deleted from DynamoDB');
            } catch (error) {
                console.error('[deleteAccount] Error deleting user record from DynamoDB:', error);
                throw new Error('Failed to delete user data. Please try again.');
            }

            // 3. Delete Cognito user (only after successful DynamoDB deletion)
            console.log('[deleteAccount] Deleting Cognito user...');
            await deleteUser();
            console.log('[deleteAccount] Cognito user deleted');

            // 4. Reset state
            setUser(null);
            setUsername(null);
            setNeedsSetup(false);
            console.log('[deleteAccount] Account deletion complete!');
        } catch (error) {
            console.error('[deleteAccount] Error deleting account:', error);
            throw error;
        }
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                username,
                needsSetup,
                isLoading,
                isAuthenticated: !!user,
                isAdmin: !!username && ADMIN_USERNAMES.includes(username),
                signInWithGoogle,
                logout,
                getAccessToken,
                refreshUser,
                deleteAccount
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
