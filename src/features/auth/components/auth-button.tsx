'use client';

import { useAuth } from '@/features/auth/auth-context';
import { Button } from '@/shared/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { LogIn, LogOut, User, Trophy, Loader2, Settings } from 'lucide-react';
import Link from 'next/link';

export function AuthButton() {
    const { user, username, isLoading, isAuthenticated, signInWithGoogle, logout } = useAuth();

    if (isLoading) {
        return (
            <Button variant="ghost" size="sm" disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
            </Button>
        );
    }

    if (!isAuthenticated) {
        return (
            <Button onClick={signInWithGoogle} variant="outline" size="sm" className="gap-2">
                <LogIn className="h-4 w-4" />
                Sign in with Google
            </Button>
        );
    }

    const displayLabel = username || user?.signInDetails?.loginId?.split('@')[0] || 'Account';

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    {displayLabel}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                {username && (
                    <DropdownMenuItem asChild>
                        <Link href={`/user/${username}`} className="cursor-pointer">
                            <User className="mr-2 h-4 w-4" />
                            View Profile
                        </Link>
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                    <Link href="/account" className="cursor-pointer">
                        <Settings className="mr-2 h-4 w-4" />
                        Account Settings
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/tournaments" className="cursor-pointer">
                        <Trophy className="mr-2 h-4 w-4" />
                        My Tournaments
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
