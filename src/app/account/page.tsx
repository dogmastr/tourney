'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/auth-context';
import { client } from '@/shared/services/graphql-client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/shared/ui/card';
import { User, Mail, Loader2, ArrowLeft, AtSign, ExternalLink, Trash2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';

interface UserProfile {
    id: string;
    username: string | null;
    bio: string | null;
}

export default function AccountPage() {
    const { user, isLoading, isAuthenticated, needsSetup, refreshUser, deleteAccount } = useAuth();
    const router = useRouter();

    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(true);
    const [email, setEmail] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const handleDeleteAccount = async () => {
        setIsDeleting(true);
        try {
            await deleteAccount();
            // Use location.href for a full page refresh to clear all cached state
            window.location.href = '/';
        } catch (error) {
            console.error('Failed to delete account:', error);
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/');
        }
    }, [isLoading, isAuthenticated, router]);

    useEffect(() => {
        if (user && !needsSetup) {
            loadUserProfile();
        }
    }, [user, needsSetup]);

    const loadUserProfile = async () => {
        if (!user) return;

        setIsLoadingProfile(true);
        const userEmail = user.signInDetails?.loginId || user.username || '';
        setEmail(userEmail);

        try {
            const { data } = await client.models.User.get({ id: user.userId });

            if (data) {
                setUserProfile({
                    id: data.id,
                    username: data.username || null,
                    bio: data.bio || null,
                });
            }
        } catch (error: any) {
            console.error('Error loading profile:', error);
        } finally {
            setIsLoadingProfile(false);
        }
    };



    if (isLoading || isLoadingProfile || needsSetup) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading profile...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <main className="container mx-auto px-4 py-8 max-w-2xl">
            <div className="mb-6">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/tournaments">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Tournaments
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5" />
                                Account Settings
                            </CardTitle>
                        </div>
                        {userProfile?.username && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={`/user/${userProfile.username}`}>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    View Profile
                                </Link>
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Username (read-only) */}
                    {userProfile?.username && (
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <AtSign className="h-4 w-4" />
                                Username
                            </Label>
                            <Input
                                value={userProfile.username}
                                disabled
                                className="bg-muted font-mono"
                            />
                            <p className="text-xs text-muted-foreground">
                                Your username cannot be changed
                            </p>
                        </div>
                    )}

                    {/* Email (read-only) */}
                    <div className="space-y-2">
                        <Label htmlFor="email" className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Email
                        </Label>
                        <Input
                            id="email"
                            value={email}
                            disabled
                            className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground">
                            Email is managed by your Google account
                        </p>
                    </div>

                    {/* User ID */}
                    <div className="pt-4 border-t space-y-2">
                        <Label className="text-muted-foreground text-xs">User ID</Label>
                        <p className="text-xs font-mono text-muted-foreground bg-muted p-2 rounded">
                            {user?.userId}
                        </p>
                    </div>

                    {/* Caution */}
                    <div className="pt-8 border-t">
                        <div className="flex items-center gap-2 text-destructive font-medium">
                            <AlertTriangle className="h-4 w-4" />
                            Caution!
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                            All your profile and tournament data will be removed.
                        </p>
                        <Button
                            variant="destructive"
                            className="w-full sm:w-auto gap-2"
                            onClick={() => setShowDeleteDialog(true)}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Trash2 className="h-4 w-4" />
                            )}
                            Delete Account
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <ConfirmDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                title="Delete Account?"
                description="Are you sure you want to delete your account? All your profile and tournament data will be lost."
                confirmLabel="Delete Account"
                onConfirm={handleDeleteAccount}
                variant="destructive"
            />
        </main>
    );
}


