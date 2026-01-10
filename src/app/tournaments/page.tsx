"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { Progress } from "@/shared/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import Link from "next/link";
import type { Tournament } from "@/features/tournaments/model";
import { deleteTournamentAsync } from "@/features/tournaments/storage";
import { UserLink } from "@/features/users/components/user-link";
import { useCloudTournaments } from "@/features/tournaments/hooks/use-cloud-tournaments";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/shared/utils";
import {
  Plus,
  Search,
  Trophy,
  Users,
  Calendar,
  MapPin,
  Target,
  Trash2,
  ArrowUpDown,
  PlusCircle,
  Clock,
  Loader2,
  User
} from "lucide-react";

export default function TournamentsPage() {
  const { user, isAdmin, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { tournaments: cloudTournaments, isLoading: isCloudLoading, refresh } = useCloudTournaments();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [showMyTournaments, setShowMyTournaments] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all"); // all, ongoing, completed
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Sync cloud tournaments to local state and fetch creator names
  useEffect(() => {
    setTournaments(cloudTournaments);

    // Fetch creator names from User table (only for missing creatorName values)
    const fetchCreatorNames = async () => {
      const uniqueCreatorIds = [...new Set(cloudTournaments.map(t => t.creatorId).filter(Boolean))] as string[];
      if (uniqueCreatorIds.length === 0) return;

      const missingCreatorIds = uniqueCreatorIds.filter((creatorId) =>
        !cloudTournaments.some((t) => t.creatorId === creatorId && t.creatorName)
      );
      if (missingCreatorIds.length === 0) return;

      try {
        const { publicClient } = await import('@/shared/services/graphql-client');
        const names: Record<string, string> = {};
        const missingSet = new Set(missingCreatorIds);
        const users: any[] = [];
        let nextToken: string | null | undefined = undefined;

        do {
          const response = await publicClient.models.User.list({ nextToken });
          if (response.data) users.push(...response.data);
          nextToken = response.nextToken;
        } while (nextToken);

        users.forEach((user) => {
          if (user?.id && user?.username && missingSet.has(user.id)) {
            names[user.id] = user.username;
          }
        });

        setCreatorNames((prev) => ({ ...prev, ...names }));
      } catch (error) {
        console.error('Failed to fetch creator names:', error);
      }
    };

    fetchCreatorNames();
  }, [cloudTournaments]);

  const handleDelete = async (id: string, creatorId?: string) => {
    console.log('[handleDelete] Attempting to delete tournament:', id);
    console.log('[handleDelete] User isAdmin:', isAdmin, 'userId:', user?.userId, 'creatorId:', creatorId);

    const isOwner = user?.userId === creatorId;

    if (!isAdmin && !isOwner) {
      console.log('[handleDelete] BLOCKED: User is not admin and not creator');
      return;
    }
    setIsDeleting(id);
    try {
      // If user is admin but NOT owner, use admin mutation
      if (isAdmin && !isOwner && creatorId) {
        console.log('[handleDelete] Using adminDeleteTournament mutation...');
        const { adminDeleteTournamentFromCloud } = await import('@/features/tournaments/services/cloud-sync');
        await adminDeleteTournamentFromCloud(id);
      } else {
        // Owner can use regular delete
        console.log('[handleDelete] Using regular deleteTournamentAsync...');
        await deleteTournamentAsync(id, creatorId);
      }
      console.log('[handleDelete] Delete successful, refreshing...');
      refresh(); // Reload from cloud
    } catch (error) {
      console.error('[handleDelete] Failed to delete tournament:', error);
    } finally {
      setIsDeleting(null);
    }
  };

  // Helper to check if current user can manage a tournament
  const canManage = (tournament: Tournament) => {
    return isAdmin || (isAuthenticated && user?.userId === tournament.creatorId);
  };

  // Filtering and Sorting
  const filteredAndSortedTournaments = useMemo(() => {
    let result = tournaments.filter((t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Filter to my tournaments if toggle is active
    if (showMyTournaments && isAuthenticated) {
      result = result.filter((t) => t.creatorId === user?.userId);
    }

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((t) => {
        const status = getStatus(t);
        if (statusFilter === "ongoing") return status.label === "Ongoing";
        if (statusFilter === "completed") return status.label === "Completed";
        if (statusFilter === "draft") return status.label === "Draft";
        return true;
      });
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name":
          return a.name.localeCompare(b.name);
        case "players":
          return b.players.length - a.players.length;
        default:
          return 0;
      }
    });

    return result;
  }, [tournaments, searchQuery, sortBy, showMyTournaments, statusFilter, isAuthenticated, user?.userId]);

  const getStatus = (tournament: Tournament) => {
    const playedRounds = tournament.rounds.length;
    if (playedRounds === 0) return { label: "Draft", variant: "secondary" };
    if (playedRounds >= tournament.totalRounds) return { label: "Completed", variant: "default" };
    return { label: "Ongoing", variant: "outline" };
  };

  // Show loading state
  if (isAuthLoading || isCloudLoading) {
    return (
      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading tournaments...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-6 max-w-6xl animate-in fade-in duration-300">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            Tournaments
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Browse and manage chess events</p>
        </div>
        {isAuthenticated && (
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/tournaments/new">
              <PlusCircle className="h-4 w-4" />
              New Tournament
            </Link>
          </Button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tournaments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAuthenticated && (
            <Button
              variant={showMyTournaments ? "default" : "outline"}
              size="sm"
              onClick={() => setShowMyTournaments(!showMyTournaments)}
              className="gap-1.5 h-9"
            >
              <User className="h-3.5 w-3.5" />
              My Tournaments
            </Button>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="ongoing">Ongoing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px] h-9 gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Recent First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="name">Alphabetical</SelectItem>
              <SelectItem value="players">Most Players</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tournaments Grid */}
      {tournaments.length === 0 ? (
        <Card className="border-dashed bg-muted/20 py-10">
          <CardContent className="flex flex-col items-center text-center">
            <div className="p-3 bg-background rounded-full shadow-sm mb-3">
              <Trophy className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <CardTitle className="text-xl mb-1.5">No tournaments yet</CardTitle>
            <CardDescription className="max-w-xs mb-4 text-sm">
              Start by creating your first tournament.
            </CardDescription>
            <Button asChild size="sm">
              <Link href="/tournaments/new">
                <Plus className="h-4 w-4 mr-1.5" />
                Create Tournament
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : filteredAndSortedTournaments.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg bg-muted/10">
          <p className="text-muted-foreground text-sm">No tournaments match your search.</p>
          <Button variant="link" size="sm" onClick={() => { setSearchQuery(""); setShowMyTournaments(false); }}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedTournaments.map((tournament) => {
            const status = getStatus(tournament);
            const creatorName = (tournament.creatorId ? creatorNames[tournament.creatorId] : null) || tournament.creatorName;
            const currentCanManage = canManage(tournament);
            return (
              <Card key={tournament.id} className="group hover:shadow-md hover:border-primary/30 transition-all duration-200 relative flex flex-col overflow-hidden">
                {/* Delete Button */}
                {currentCanManage && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Tournament?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete <span className="font-semibold text-foreground">&quot;{tournament.name}&quot;</span>?
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(tournament.id, tournament.creatorId)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={isDeleting === tournament.id}
                          >
                            {isDeleting === tournament.id ? (
                              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Deleting...</>
                            ) : (
                              'Delete'
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}

                {/* Clickable Card Link Overlay */}
                <Link
                  href={`/tournaments/${tournament.id}`}
                  className="absolute inset-0 z-0"
                >
                  <span className="sr-only">View {tournament.name}</span>
                </Link>

                <div className="flex flex-col flex-grow relative z-10 pointer-events-none">
                  {/* Card Header */}
                  <CardHeader className="pb-3 pt-4 px-4">
                    {/* Title */}
                    <CardTitle className="text-lg font-semibold group-hover:text-primary transition-colors line-clamp-1 pr-8">
                      {tournament.name}
                    </CardTitle>
                    {/* Creator */}
                    {creatorName && (
                      <div className="mt-1 text-sm text-muted-foreground relative z-20 w-fit pointer-events-auto">
                        <UserLink username={creatorName} />
                      </div>
                    )}
                    {/* System type */}
                    <div className="text-xs text-muted-foreground mt-1">
                      {tournament.system === "normal-swiss" ? "Swiss System" : "Round Robin"}
                    </div>
                  </CardHeader>

                  <CardContent className="pb-4 px-4 flex-grow space-y-3">
                    {/* Stats & Progress */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{tournament.players.length}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {tournament.rounds.length}<span className="text-muted-foreground font-normal">/{tournament.totalRounds}</span>
                          </span>
                        </div>
                      </div>
                      <Badge
                        variant={status.variant as any}
                        className={cn(
                          "text-[10px] px-2 py-0.5",
                          status.label === "Completed" && "bg-green-500/10 text-green-600 border-green-500/20",
                          status.label === "Ongoing" && "bg-amber-500/10 text-amber-600 border-amber-500/20",
                          status.label === "Draft" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {status.label}
                      </Badge>
                    </div>

                    {/* Progress Bar */}
                    <Progress
                      value={(tournament.rounds.length / tournament.totalRounds) * 100}
                      className={cn(
                        "h-1.5",
                        status.label === "Completed" && "[&>div]:bg-green-500",
                        status.label === "Ongoing" && "[&>div]:bg-amber-500"
                      )}
                    />

                    {/* Info Row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {tournament.startDate
                          ? tournament.startDate === tournament.endDate || !tournament.endDate
                            ? new Date(tournament.startDate).toLocaleDateString()
                            : `${new Date(tournament.startDate).toLocaleDateString()} - ${new Date(tournament.endDate!).toLocaleDateString()}`
                          : new Date(tournament.createdAt).toLocaleDateString()}
                      </span>
                      {tournament.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate max-w-[100px]">{tournament.location}</span>
                        </span>
                      )}
                      {tournament.timeControl && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {tournament.timeControl}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}

