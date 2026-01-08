/**
 * Shared Constants
 * 
 * This file is the single source of truth for constants used by both
 * Lambda functions and the frontend application.
 */

/**
 * User Title Configuration
 * 
 * To add a new title:
 * 1. Add a new entry to USER_TITLES with a unique key
 * 2. Set icon (lucide icon name), label, className, and usernames
 * 
 * Available icons: ShieldCheck, Wrench, Heart, Star, Crown, etc.
 */
export interface UserTitle {
    icon: string;
    label: string;
    className: string;
    usernames: readonly string[];
}

export const USER_TITLES: Record<string, UserTitle> = {
    admin: {
        icon: "ShieldCheck",
        label: "Admin",
        className: "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20",
        usernames: ["dogmaster"],
    },
    dev: {
        icon: "Wrench",
        label: "Dev",
        className: "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20",
        usernames: ["dogmaster"],
    },
    patron: {
        icon: "Heart",
        label: "Patron",
        className: "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20",
        usernames: ["dogmaster"],
    },
};

// Legacy exports for backwards compatibility (used by Lambda admin checks)
export const ADMIN_USERNAMES = USER_TITLES.admin.usernames;
