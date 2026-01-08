"use client";

import { useEffect, useState } from "react";
import { publicClient } from "@/lib/graphql-client";
import { Loader2 } from "lucide-react";

export default function DebugDbPage() {
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                // Fetch all data in parallel
                const [users, tournaments] = await Promise.all([
                    publicClient.models.User.list(),
                    publicClient.models.Tournament.list()
                ]);

                setData({
                    users: users.data,
                    tournaments: tournaments.data
                });
            } catch (err: any) {
                console.error("Debug fetch failed", err);
                setError(err.message || "Failed to fetch data");
            } finally {
                setIsLoading(false);
            }
        };

        fetchAll();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-10 text-destructive">
                <h1 className="text-2xl font-bold mb-4">Error fetching DB</h1>
                <pre>{error}</pre>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-[100vw] overflow-auto">
            <h1 className="text-3xl font-bold mb-6">Database Dump</h1>
            <div className="bg-slate-950 text-emerald-400 p-6 rounded-lg font-mono text-xs whitespace-pre overflow-auto max-h-[90vh] shadow-2xl">
                {JSON.stringify(data, null, 2)}
            </div>
        </div>
    );
}
