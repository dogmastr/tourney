"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/auth-context";
import { client } from "@/shared/services/graphql-client";
import { Loader2 } from "lucide-react";

export default function DebugDbPage() {
    const router = useRouter();
    const { isAdmin, isLoading: isAuthLoading } = useAuth();
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isAuthLoading) return;
        if (!isAdmin) {
            router.replace("/tournaments");
        }
    }, [isAuthLoading, isAdmin, router]);

    useEffect(() => {
        if (isAuthLoading || !isAdmin) return;

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

        const fetchAll = async () => {
            try {
                // Fetch all data in parallel
                const [users, tournaments] = await Promise.all([
                    listAll((params) => client.models.User.list(params)),
                    listAll((params) => client.models.Tournament.list(params))
                ]);

                setData({
                    users,
                    tournaments
                });
            } catch (err: any) {
                console.error("Debug fetch failed", err);
                setError(err.message || "Failed to fetch data");
            } finally {
                setIsLoading(false);
            }
        };

        fetchAll();
    }, [isAuthLoading, isAdmin]);

    if (isAuthLoading || (isLoading && isAdmin)) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (!isAdmin) {
        return null;
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

