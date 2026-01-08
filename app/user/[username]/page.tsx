'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { publicClient, client } from '@/lib/graphql-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ADMIN_USERNAMES } from '@/lib/constants';
import { UserLink } from '@/components/user-link';
import { User, Trophy, Edit2, Save, X, Loader2, ArrowLeft, ExternalLink, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { validateBio } from '@/lib/validation';
import { LIMITS } from '@/lib/limits';
import { RateLimitAlert, useBioRateLimitState } from '@/components/rate-limit-alert';

interface UserProfile {
    id: string;
    email: string;
    username: string | null;
    bio: string | null;
    createdAt?: string;
}

interface TournamentSummary {
    id: string;
    name: string;
    playerCount: number | null;
    status: string | null;
}

export default function ProfilePage() {
    const params = useParams();
    const router = useRouter();
    const { user, isAuthenticated, isLoading: isAuthLoading, isAdmin } = useAuth();

    const profileUsername = params.username as string;

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    // Edit mode
    const [isEditing, setIsEditing] = useState(false);
    const [editBio, setEditBio] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Admin deletion state
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Bio update rate limiting
    const bioRateLimit = useBioRateLimitState();

    // Is this the current user's profile?
    const isOwner = isAuthenticated && user && profile?.id === user.userId;

    useEffect(() => {
        if (profileUsername) {
            loadProfile(profileUsername);
        }
    }, [profileUsername]);

    const loadProfile = async (username: string) => {
        setIsLoading(true);
        setNotFound(false);
        try {
            const { data: users } = await publicClient.models.User.list({
                filter: { username: { eq: username.toLowerCase() } }
            });

            if (!users || users.length === 0) {
                setNotFound(true);
                return;
            }

            const userData = users[0];
            setProfile({
                id: userData.id,
                email: userData.email,
                username: userData.username || null,
                bio: userData.bio || null,
                createdAt: userData.createdAt,
            });
            setEditBio(userData.bio || '');

            const { data: tournamentData } = await publicClient.models.Tournament.list({
                filter: { creatorId: { eq: userData.id } }
            });

            if (tournamentData) {
                setTournaments(tournamentData.map(t => ({
                    id: t.id,
                    name: t.name,
                    playerCount: t.playerCount,
                    status: t.status,
                })));
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            setNotFound(true);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveBio = async () => {
        if (!isOwner || !user) return;

        // Check client-side rate limit first
        if (!bioRateLimit.checkAndSetLimit()) {
            return;
        }

        const validation = validateBio(editBio);
        if (!validation.valid) {
            setSaveError(validation.error || 'Invalid bio');
            return;
        }

        setIsSaving(true);
        setSaveError(null);

        try {
            // Use validated mutation for bio update
            await (client as any).mutations.updateUserValidated({
                input: {
                    id: user.userId,
                    bio: editBio.trim(),
                }
            });

            setProfile(prev => prev ? { ...prev, bio: editBio.trim() } : null);
            setIsEditing(false);
            bioRateLimit.recordUpdate();
        } catch (error) {
            console.error('Error saving bio:', error);
            setSaveError('Failed to save. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAdminDeleteUser = async () => {
        if (!isAdmin || !profile) return;
        console.log('[adminDeleteUser] Starting admin user deletion...');
        console.log('[adminDeleteUser] Target user ID:', profile.id);
        setIsDeleting(true);
        try {
            const result = await (client as any).mutations.adminDeleteUser({
                userId: profile.id
            });
            console.log('[adminDeleteUser] Result:', result);
            router.push('/tournaments');
        } catch (error: any) {
            console.error('[adminDeleteUser] Error deleting user:', error);
            console.error('[adminDeleteUser] Error details:', JSON.stringify(error, null, 2));
            setIsDeleting(false);
        }
    };

    const handleCancelEdit = () => {
        setEditBio(profile?.bio || '');
        setIsEditing(false);
        setSaveError(null);
    };

    if (isLoading || isAuthLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading profile...</p>
                </div>
            </div>
        );
    }

    if (notFound) {
        return (
            <main className="container mx-auto px-4 py-16 max-w-2xl text-center">
                <div className="mb-6">
                    <User className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                    <h1 className="text-2xl font-bold mb-2">User Not Found</h1>
                    <p className="text-muted-foreground mb-6">
                        The user @{profileUsername} doesn&apos;t exist.
                    </p>
                    <Button asChild>
                        <Link href="/tournaments">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Tournaments
                        </Link>
                    </Button>
                </div>
            </main>
        );
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

            <Card className="mb-6">
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div>
                                <CardTitle className="text-xl flex items-center gap-2">
                                    {profile?.username && (
                                        <UserLink username={profile.username} />
                                    )}
                                </CardTitle>
                                <CardDescription className="text-base">
                                    @{profile?.username}
                                </CardDescription>
                            </div>
                        </div>
                        {isOwner && !isEditing && (
                            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit Bio
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Rate Limit Alert */}
                    <RateLimitAlert
                        isLimited={bioRateLimit.isLimited}
                        retryAfterMs={bioRateLimit.retryAfterMs}
                        onCooldownComplete={bioRateLimit.clearLimit}
                    />

                    {isEditing ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="bio">Bio</Label>
                                <Textarea
                                    id="bio"
                                    value={editBio}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditBio(e.target.value)}
                                    placeholder="Tell others about yourself..."
                                    maxLength={LIMITS.MAX_BIO_LENGTH}
                                    rows={4}
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>{saveError && <span className="text-destructive">{saveError}</span>}</span>
                                    <span>{editBio.length}/{LIMITS.MAX_BIO_LENGTH}</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleSaveBio} disabled={isSaving}>
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4 mr-2" />
                                    )}
                                    Save
                                </Button>
                                <Button variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
                                    <X className="h-4 w-4 mr-2" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-muted-foreground">
                            {profile?.bio || 'No bio yet.'}
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Trophy className="h-5 w-5" />
                        Tournaments ({tournaments.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {tournaments.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No tournaments created yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {tournaments.map((tournament) => (
                                <Link
                                    key={tournament.id}
                                    href={`/tournaments/${tournament.id}`}
                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                                >
                                    <div>
                                        <p className="font-medium group-hover:text-primary transition-colors">
                                            {tournament.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {tournament.playerCount || 0} players
                                            {tournament.status && ` • ${tournament.status}`}
                                        </p>
                                    </div>
                                    <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
            {/* Admin Actions */}
            {isAdmin && profile && (
                <Card className="mt-6 border-destructive/50">
                    <CardHeader>
                        <CardTitle className="text-destructive flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5" />
                            Admin
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-4">
                            <div className="rounded-md bg-destructive/10 p-4">
                                <h4 className="font-semibold text-destructive mb-1">Delete User Account</h4>
                                <p className="text-sm text-destructive/80 mb-3">
                                    Permanently delete this user and all their tournaments.
                                </p>
                                <Button
                                    variant="destructive"
                                    onClick={() => setShowDeleteDialog(true)}
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                                    Delete User
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete User Account</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete the user <strong>@{profile?.username}</strong>?
                            <br /><br />
                            This will permanently delete:
                        </AlertDialogDescription>
                        <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground">
                            <li>Their user profile and bio</li>
                            <li>All {tournaments.length} tournaments they created</li>
                        </ul>
                        <div className="mt-2 text-sm text-muted-foreground">
                            This action cannot be undone.
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleAdminDeleteUser();
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={isDeleting}
                        >
                            {isDeleting ? "Deleting..." : "Delete User"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}
