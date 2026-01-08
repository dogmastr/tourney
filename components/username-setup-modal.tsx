'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { client, publicClient } from '@/lib/graphql-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogPortal,
    DialogOverlay,
} from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { User, Check, X, Loader2, AtSign, LogOut } from 'lucide-react';
import { validateUsername } from '@/lib/validation';
import { LIMITS } from '@/lib/limits';
import { cn } from '@/lib/utils';

/**
 * A blocking modal that forces new users to set up their username.
 * This modal cannot be dismissed - users must either complete setup or sign out.
 */
export function UsernameSetupModal() {
    const { user, isLoading, isAuthenticated, needsSetup, logout, refreshUser } = useAuth();

    const [username, setUsername] = useState('');
    const [isChecking, setIsChecking] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

    // Set default username suggestion from email
    useEffect(() => {
        if (user && !username && needsSetup) {
            // Try to extract a username suggestion from email
            const email = user.signInDetails?.loginId || '';
            const emailPrefix = email.split('@')[0] || '';
            // Clean it to only valid characters
            const suggestion = emailPrefix.replace(/[^a-zA-Z0-9_]/g, '').slice(0, LIMITS.MAX_USERNAME_LENGTH);
            if (suggestion.length >= LIMITS.MIN_USERNAME_LENGTH && !/^[0-9]/.test(suggestion)) {
                setUsername(suggestion);
            }
        }
    }, [user, needsSetup]);

    // Debounced username availability check
    useEffect(() => {
        if (!needsSetup) return;

        const timer = setTimeout(async () => {
            if (username.length >= LIMITS.MIN_USERNAME_LENGTH) {
                const validation = validateUsername(username);
                if (validation.valid) {
                    await checkUsernameAvailability(username);
                } else {
                    setIsAvailable(null);
                    setError(validation.error || null);
                }
            } else {
                setIsAvailable(null);
                setError(null);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [username, needsSetup]);

    const checkUsernameAvailability = async (usernameToCheck: string) => {
        setIsChecking(true);
        setError(null);
        try {
            // Query by username to check availability
            const { data } = await publicClient.models.User.list({
                filter: { username: { eq: usernameToCheck.toLowerCase() } }
            });

            const available = !data || data.length === 0;
            setIsAvailable(available);
            if (!available) {
                setError('This username is already taken.');
            }
        } catch (error) {
            console.error('Error checking username:', error);
            setError('Failed to check username availability');
            setIsAvailable(null);
        } finally {
            setIsChecking(false);
        }
    };

    const handleUsernameChange = (value: string) => {
        // Only allow valid characters while typing
        const cleaned = value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, LIMITS.MAX_USERNAME_LENGTH);
        setUsername(cleaned);
        setError(null);
        setIsAvailable(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !isAvailable) return;

        // Final validation
        const validation = validateUsername(username);
        if (!validation.valid) {
            setError(validation.error || 'Invalid username');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            // Get user email
            const userEmail = user.signInDetails?.loginId || user.username || '';

            // Create/update user record via validated mutation
            await (client as any).mutations.updateUserValidated({
                input: {
                    id: user.userId,
                    email: userEmail,
                    username: username.toLowerCase(),
                }
            });

            // Refresh auth context to clear needsSetup flag
            await refreshUser();

            // Refresh the page to ensure all components update
            window.location.reload();
        } catch (error: any) {
            console.error('Error saving username:', error);
            // Check for specific error messages from the lambda
            const message = error?.message || error?.errors?.[0]?.message || 'Failed to save username. Please try again.';
            setError(message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    // Don't render if not needed
    if (isLoading || !isAuthenticated || !needsSetup) {
        return null;
    }

    return (
        <Dialog open={true}>
            <DialogPortal>
                <DialogOverlay />
                <DialogPrimitive.Content
                    className={cn(
                        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
                    )}
                    // Prevent closing on escape or pointer down outside
                    onEscapeKeyDown={(e) => e.preventDefault()}
                    onPointerDownOutside={(e) => e.preventDefault()}
                    onInteractOutside={(e) => e.preventDefault()}
                >
                    {/* Header */}
                    <div className="text-center">
                        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-6 w-6 text-primary" />
                        </div>
                        <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
                            Choose Your Username
                        </DialogPrimitive.Title>
                        <DialogPrimitive.Description className="text-sm text-muted-foreground mt-2">
                            Pick a unique username for your profile. This cannot be changed later.
                        </DialogPrimitive.Description>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="username" className="flex items-center gap-2">
                                <AtSign className="h-4 w-4" />
                                Username
                            </Label>
                            <div className="relative">
                                <Input
                                    id="username"
                                    value={username}
                                    onChange={(e) => handleUsernameChange(e.target.value)}
                                    placeholder="your_username"
                                    maxLength={LIMITS.MAX_USERNAME_LENGTH}
                                    className={`pr-10 ${isAvailable === true ? 'border-green-500 focus-visible:ring-green-500' :
                                        isAvailable === false ? 'border-destructive focus-visible:ring-destructive' : ''
                                        }`}
                                    disabled={isSaving}
                                    autoFocus
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    {isChecking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                    {!isChecking && isAvailable === true && <Check className="h-4 w-4 text-green-500" />}
                                    {!isChecking && isAvailable === false && <X className="h-4 w-4 text-destructive" />}
                                </div>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Letters, numbers, and underscores only</span>
                                <span>{username.length}/{LIMITS.MAX_USERNAME_LENGTH}</span>
                            </div>
                            {error && (
                                <p className="text-xs text-destructive">{error}</p>
                            )}
                            {isAvailable === true && !error && (
                                <p className="text-xs text-green-600">Username is available!</p>
                            )}
                        </div>

                        <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
                            <p className="font-medium">Your profile will be at:</p>
                            <p className="font-mono text-muted-foreground">
                                /user/{username || 'username'}
                            </p>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={!isAvailable || isChecking || isSaving || username.length < LIMITS.MIN_USERNAME_LENGTH}
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Setting up...
                                    </>
                                ) : (
                                    'Continue'
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full text-muted-foreground"
                                onClick={handleSignOut}
                                disabled={isSaving}
                            >
                                <LogOut className="h-4 w-4 mr-2" />
                                Sign Out Instead
                            </Button>
                        </div>
                    </form>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
