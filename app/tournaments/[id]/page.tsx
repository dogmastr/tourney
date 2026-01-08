"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { type Tournament, saveTournamentAsync, deleteTournamentAsync } from "@/lib/tournament-store";
import { loadTournamentFromCloud } from "@/lib/tournament-sync";
import { useAuth } from "@/lib/auth-context";
import { UserLink } from "@/components/user-link";
import { validateTournamentName, sanitizeString } from "@/lib/validation";
import { LIMITS } from "@/lib/limits";
import dynamic from "next/dynamic";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Trash2, MoreHorizontal, ChevronLeft, Calendar, MapPin, Clock, Users, LayoutDashboard, Settings, Swords, Loader2, LogIn, Cloud } from "lucide-react";

// Dynamically import tabs to reduce initial bundle size
const DashboardTab = dynamic(() => import("@/components/tournament/dashboard-tab").then(mod => ({ default: mod.DashboardTab })), {
  loading: () => <div className="text-center py-8">Loading...</div>,
});

const PlayersTab = dynamic(() => import("@/components/tournament/players-tab").then(mod => ({ default: mod.PlayersTab })), {
  loading: () => <div className="text-center py-8">Loading...</div>,
});

const RoundsTab = dynamic(() => import("@/components/tournament/rounds-tab").then(mod => ({ default: mod.RoundsTab })), {
  loading: () => <div className="text-center py-8">Loading...</div>,
});

const SettingsTab = dynamic(() => import("@/components/tournament/settings-tab").then(mod => ({ default: mod.SettingsTab })), {
  loading: () => <div className="text-center py-8">Loading...</div>,
});

export default function TournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tournamentName, setTournamentName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Determine if current user is the owner or an admin
  const isOwner = tournament?.creatorId && user?.userId === tournament.creatorId;
  const canManage = isOwner || isAdmin;
  const readOnly = !isOwner; // Still read-only for non-owners (except for delete)

  // Load tournament from cloud (works for both authenticated and unauthenticated users)
  useEffect(() => {
    async function loadTournament() {
      if (isAuthLoading) return;

      const tournamentId = params.id as string;
      try {
        const loadedTournament = await loadTournamentFromCloud(tournamentId);

        if (!loadedTournament) {
          router.push("/tournaments");
          return;
        }

        setTournament(loadedTournament);
        setTournamentName(loadedTournament.name);
      } catch (error) {
        console.error('Failed to load tournament:', error);
        router.push("/tournaments");
      } finally {
        setIsLoading(false);
      }
    }

    loadTournament();
  }, [params.id, router, isAuthLoading]);

  // Sync tournament changes to cloud (only for owner)
  const handleTournamentUpdate = useCallback(async (updatedTournament: Tournament) => {
    if (readOnly) return; // Prevent updates in read-only mode
    setTournament(updatedTournament);
    // Sync to cloud in background
    if (updatedTournament.creatorId) {
      await saveTournamentAsync(updatedTournament);
    }
  }, [readOnly]);

  useEffect(() => {
    if (tournament) {
      const length = tournament.name.length;
      let fontSize = 28;
      if (length > 30) {
        fontSize = Math.max(18, 28 - (length - 30) * 0.4);
      }
      const timer = setTimeout(() => {
        const input = document.getElementById('tournament-name-input') as HTMLInputElement;
        if (input) {
          input.style.fontSize = `${fontSize}px`;
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [tournament]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const newName = e.target.value;

    // Enforce max length
    if (newName.length > LIMITS.MAX_TOURNAMENT_NAME_LENGTH) return;

    setTournamentName(newName);
    setNameError(null); // Clear error on change

    const input = e.target;
    const length = newName.length;
    let fontSize = 28;
    if (length > 30) {
      fontSize = Math.max(18, 28 - (length - 30) * 0.4);
    }
    input.style.fontSize = `${fontSize}px`;
  };

  const handleNameBlur = async () => {
    if (readOnly) return;

    const trimmedName = sanitizeString(tournamentName);

    // Validate the name
    const validation = validateTournamentName(trimmedName);
    if (!validation.valid) {
      setNameError(validation.error || 'Invalid tournament name');
      return;
    }

    if (tournament && trimmedName && trimmedName !== tournament.name) {
      const updatedTournament = { ...tournament, name: trimmedName };
      setTournamentName(trimmedName); // Update to sanitized version
      await handleTournamentUpdate(updatedTournament);
    } else if (!trimmedName) {
      setTournamentName(tournament?.name || "");
      setNameError(null);
    }
  };

  const handleDelete = () => {
    if (!tournament || !canManage) return;
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!tournament || !canManage) return;
    setIsDeleting(true);
    try {
      await deleteTournamentAsync(tournament.id, tournament.creatorId);
      router.push("/tournaments");
    } catch (error) {
      console.error('Failed to delete tournament:', error);
      setIsDeleting(false);
    }
  };

  const formatDateRange = () => {
    if (!tournament?.startDate && !tournament?.endDate) return null;
    const start = tournament.startDate ? new Date(tournament.startDate).toLocaleDateString() : "";
    const end = tournament.endDate ? new Date(tournament.endDate).toLocaleDateString() : "";
    if (start && end && start !== end) return `${start} – ${end}`;
    return start || end;
  };

  const getTournamentStatus = () => {
    if (!tournament) return null;
    if (tournament.rounds.length === 0) return { label: "Not Started", class: "bg-gray-500/10 text-gray-500" };
    const allComplete = tournament.rounds.every(r => r.completed);
    const isLastRound = tournament.rounds.length >= tournament.totalRounds;
    if (allComplete && isLastRound) return { label: "Completed", class: "bg-green-500/10 text-green-600" };
    return { label: "In Progress", class: "bg-yellow-500/10 text-yellow-600" };
  };

  if (isLoading || isAuthLoading) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading tournament...</p>
        </div>
      </main>
    );
  }

  if (!tournament) {
    return null;
  }

  const status = getTournamentStatus();
  const dateRange = formatDateRange();

  return (
    <main className="container mx-auto px-4 py-6">
      {/* Compact Header */}
      <div className="mb-6">
        {/* Back button + Actions */}
        <div className="flex items-center justify-between mb-3">
          <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2">
            <Link href="/tournaments">
              <ChevronLeft className="h-4 w-4" />
              Tournaments
            </Link>
          </Button>
          {/* Only show actions menu for owner or admin */}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Tournament
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Tournament Name - editable only for owner */}
        <div className="flex items-center gap-3 mb-2">
          {isOwner ? (
            <Input
              id="tournament-name-input"
              value={tournamentName}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              className="font-bold h-auto py-1 border-none bg-transparent focus-visible:ring-2 focus-visible:ring-ring px-0 flex-1"
              style={{ fontSize: '28px' }}
            />
          ) : (
            <h1
              id="tournament-name-input"
              className="font-bold flex-1 py-1 px-0"
              style={{ fontSize: '28px' }}
            >
              {tournament.name}
            </h1>
          )}
          {status && (
            <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${status.class}`}>
              {status.label}
            </span>
          )}
        </div>

        {/* Info Bar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {tournament.players.filter(p => p.active).length} players
          </span>
          <span>•</span>
          <span>
            {tournament.rounds.filter(r => r.completed).length}/{tournament.totalRounds} rounds
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {dateRange || new Date().toLocaleDateString()}
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {tournament.location || "Singapore"}
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {tournament.timeControl || "10+0"}
          </span>
          {/* Show creator info */}
          {tournament.creatorName && (
            <>
              <span>•</span>
              <span className="text-muted-foreground/70">
                by <UserLink username={tournament.creatorName} />
              </span>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="w-full flex-1 flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-48 lg:w-56 flex-shrink-0">
          <TabsList className="flex flex-row md:flex-col h-auto p-1 bg-muted/50 rounded-lg w-full justify-start gap-1">
            <TabsTrigger value="dashboard" className="flex-1 md:flex-none md:w-full justify-center md:justify-start gap-1 sm:gap-2 px-2 md:px-3 py-2 text-xs sm:text-sm min-w-0">
              <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="players" className="flex-1 md:flex-none md:w-full justify-center md:justify-start gap-1 sm:gap-2 px-2 md:px-3 py-2 text-xs sm:text-sm min-w-0">
              <Users className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Players</span>
            </TabsTrigger>
            <TabsTrigger value="rounds" className="flex-1 md:flex-none md:w-full justify-center md:justify-start gap-1 sm:gap-2 px-2 md:px-3 py-2 text-xs sm:text-sm min-w-0">
              <Swords className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Rounds</span>
            </TabsTrigger>
            {/* Only show settings tab for owner */}
            {isOwner && (
              <TabsTrigger value="settings" className="flex-1 md:flex-none md:w-full justify-center md:justify-start gap-1 sm:gap-2 px-2 md:px-3 py-2 text-xs sm:text-sm min-w-0">
                <Settings className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">Settings</span>
              </TabsTrigger>
            )}
          </TabsList>
        </aside>

        <div className="flex-1 w-full min-w-0">
          <TabsContent value="dashboard" className="mt-0">
            <DashboardTab tournament={tournament} onTournamentUpdate={handleTournamentUpdate} readOnly={readOnly} />
          </TabsContent>

          <TabsContent value="players" className="mt-0">
            <PlayersTab tournament={tournament} onTournamentUpdate={handleTournamentUpdate} readOnly={readOnly} />
          </TabsContent>

          <TabsContent value="rounds" className="mt-0">
            <RoundsTab tournament={tournament} onTournamentUpdate={handleTournamentUpdate} readOnly={readOnly} />
          </TabsContent>

          {isOwner && (
            <TabsContent value="settings" className="mt-0">
              <SettingsTab tournament={tournament} onTournamentUpdate={handleTournamentUpdate} />
            </TabsContent>
          )}
        </div>
      </Tabs>

      {/* Delete dialog - only for owner or admin */}
      {canManage && (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Tournament</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{tournament?.name}&quot;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </main>
  );
}
