"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/shared/ui/data-table";
import { columns, UserWithStats } from "./columns";
import { publicClient } from "@/shared/services/graphql-client";
import { Loader2, Users } from "lucide-react";
import { Input } from "@/shared/ui/input";

export default function UsersPage() {
    const [data, setData] = useState<UserWithStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data: users } = await publicClient.models.User.list();
                const { data: tournaments } = await publicClient.models.Tournament.list();

                if (users) {
                    const processedUsers: UserWithStats[] = users
                        .filter(u => u.username) // Only show users with usernames (setup complete)
                        .map((user) => {
                            const userTournaments = tournaments
                                ? tournaments.filter((t) => t.creatorId === user.id)
                                : [];

                            return {
                                id: user.id,
                                username: user.username as string,
                                tournamentCount: userTournaments.length,
                            };
                        });

                    setData(processedUsers);
                }
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
