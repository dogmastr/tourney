"use strict";
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { UserLink } from "@/features/users/components/user-link";

export type UserWithStats = {
    id: string;
    username: string;
    tournamentCount: number;
};

export const columns: ColumnDef<UserWithStats>[] = [
    {
        accessorKey: "username",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Username
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            );
        },
        cell: ({ row }) => {
            const username = row.getValue("username") as string;

            return <UserLink username={username} />;
        },
    },
    {
        accessorKey: "tournamentCount",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Tournaments
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            );
        },
        cell: ({ row }) => {
            return <div className="pl-4">{row.getValue("tournamentCount")}</div>;
        },
    },
];
