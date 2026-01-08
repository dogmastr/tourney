'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { icons } from 'lucide-react';
import { USER_TITLES } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface UserLinkProps {
    username: string;
    showTitle?: boolean;
    className?: string;
}

/**
 * A reusable component for displaying clickable usernames with optional title badges.
 * Similar to Lichess user links that show patron/title badges.
 * 
 * Titles are configured in amplify/shared/constants.ts
 */
export function UserLink({ username, showTitle = true, className }: UserLinkProps) {
    const lowerUsername = username.toLowerCase();

    // Get all titles that apply to this user
    const userTitles = Object.entries(USER_TITLES).filter(
        ([, title]) => title.usernames.includes(lowerUsername)
    );

    return (
        <span className={cn("inline-flex items-center gap-1.5", className)}>
            <Link
                href={`/user/${username}`}
                className="font-medium hover:underline text-primary"
            >
                {username}
            </Link>
            {showTitle && userTitles.map(([titleKey, title]) => {
                const IconComponent = icons[title.icon as keyof typeof icons];

                return (
                    <Badge
                        key={titleKey}
                        variant="secondary"
                        className={cn("gap-1 px-2 py-0.5", title.className)}
                    >
                        {IconComponent && <IconComponent className="h-3 w-3" />}
                        {title.label}
                    </Badge>
                );
            })}
        </span>
    );
}
