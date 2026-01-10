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
import { ADMIN_USERNAMES } from '@shared/constants';

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
            const { client } = await import('@/shared/services/graphql-client');

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

            const { client } = await import('@/shared/services/graphql-client');

            // 1. Delete user data (tournaments + user profile) via backend mutation
            console.log('[deleteAccount] Deleting user data via adminDeleteUser...');
            try {
                const result = await (client as any).mutations.adminDeleteUser({
                    userId: currentUser.userId
                });
                console.log('[deleteAccount] Delete result:', result);
                if (result?.errors) {
                    throw new Error(JSON.stringify(result.errors));
                }
                const didDelete =
                    result?.data?.adminDeleteUser ??
                    result?.adminDeleteUser ??
                    result === true;
                if (!didDelete) {
                    throw new Error('Failed to delete user data');
                }
                console.log('[deleteAccount] User data deleted');
            } catch (error) {
                console.error('[deleteAccount] Error deleting user data:', error);
                throw new Error('Failed to delete user data. Please try again.');
            }

            // 2. Delete Cognito user (only after successful DynamoDB deletion)
            console.log('[deleteAccount] Deleting Cognito user...');
            await deleteUser();
            console.log('[deleteAccount] Cognito user deleted');

            // 3. Reset state
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
