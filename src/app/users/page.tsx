"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/shared/ui/data-table";
import { columns, UserWithStats } from "./_components/columns";
import { publicClient } from "@/shared/services/graphql-client";
import { Loader2, Users } from "lucide-react";
import { Input } from "@/shared/ui/input";

export default function UsersPage() {
    const [data, setData] = useState<UserWithStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const fetchData = async () => {
            const listAll = async (listFn: (params: { nextToken?: string | null }) => Promise<{ data?: any[]; nextToken?: string | null }>) => {
                const items: any[] = [];
                let nextToken: string | null | undefined = undefined;

                do {
                    const { data, nextToken: token } = await listFn({ nextToken });
                    if (data) items.push(...data);
                    nextToken = token;
                } while (nextToken);

                return items;
            };

            try {
                const [users, tournaments] = await Promise.all([
                    listAll((params) => publicClient.models.User.list(params)),
                    listAll((params) => publicClient.models.Tournament.list(params)),
                ]);

                const tournamentCounts = new Map<string, number>();
                tournaments.forEach((tournament) => {
                    if (!tournament?.creatorId) return;
                    tournamentCounts.set(
                        tournament.creatorId,
                        (tournamentCounts.get(tournament.creatorId) ?? 0) + 1
                    );
                });

                const processedUsers: UserWithStats[] = users
                    .filter((user) => user?.username) // Only show users with usernames (setup complete)
                    .map((user) => ({
                        id: user.id,
                        username: user.username as string,
                        tournamentCount: tournamentCounts.get(user.id) ?? 0,
                    }));

                setData(processedUsers);
            } catch (error) {
                console.error("Failed to fetch users", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading users...</p>
                </div>
            </div>
        );
    }

    const filteredData = data.filter((user) =>
        user.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="container mx-auto py-10">
            <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Users</h1>
                </div>
            </div>

            <div className="flex items-center mb-4">
                <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="max-w-sm"
                />
            </div>

            <DataTable columns={columns} data={filteredData} />
        </div>
    );
}
