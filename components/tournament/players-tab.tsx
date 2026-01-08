"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { DataTable } from "@/components/ui/data-table";
import { getPlayerColumns } from "@/components/tournament/player-columns";
import { type Tournament, type Player } from "@/lib/tournament-store";
import { useTournamentActions } from "@/hooks/use-tournament-actions";
import { getAllTitles } from "@/lib/title-utils";
import { Search, Loader2, Download, Upload, HelpCircle, Plus, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { RateLimitAlert } from "@/components/rate-limit-alert";
import { LIMITS, canAddPlayer, getRemainingPlayers, LIMIT_MESSAGES } from "@/lib/limits";

interface PlayersTabProps {
  tournament: Tournament;
  onTournamentUpdate: (tournament: Tournament) => void;
  readOnly?: boolean;
}

export function PlayersTab({ tournament, onTournamentUpdate, readOnly }: PlayersTabProps) {
  // Use tournament actions hook for state management
  const {
    addPlayer,
    removePlayer,
    updatePlayerDetails,
    deactivatePlayer,
    activatePlayer,
    refreshTournament,
  } = useTournamentActions({ tournament, onTournamentUpdate });
  // Database integration state
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const [dbPlayers, setDbPlayers] = useState<Array<{ name: string, titles: string[], rating: number }>>([]);
  const [isLoadingDbPlayers, setIsLoadingDbPlayers] = useState(false);

  const [selectedDbPlayerNames, setSelectedDbPlayerNames] = useState<string[]>([]);

  // Add player form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [playerTitles, setPlayerTitles] = useState<string[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [playerRating, setPlayerRating] = useState("1000");
  const [playerFideId, setPlayerFideId] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Dialog state
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [statusTitle, setStatusTitle] = useState("Status");
  const [statusMessage, setStatusMessage] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  const [showImportConfirmDialog, setShowImportConfirmDialog] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");

  // Rate limit state
  const [rateLimitState, setRateLimitState] = useState<{ isLimited: boolean; retryAfterMs: number }>({
    isLimited: false,
    retryAfterMs: 0,
  });



  // Use a ref to track if we're currently loading to prevent duplicate requests
  const isLoadingRef = useRef(false);

  // Load database players
  const loadDbPlayers = useCallback(() => {
    if (tournament.playerDatabase) {
      setDbPlayers(tournament.playerDatabase);
    } else {
      setDbPlayers([]);
    }
    // No async loading needed anymore as it's part of the tournament object
  }, [tournament.playerDatabase]);



  // Load players when Add form opens
  useEffect(() => {
    if (showAddForm) {
      loadDbPlayers();
    }
  }, [showAddForm, loadDbPlayers]);

  // Handle adding selected database players to tournament
  const handleAddSelectedDbPlayers = useCallback(() => {
    if (selectedDbPlayerNames.length === 0) return;

    const duplicates: string[] = [];
    const playersToAdd: Player[] = [];

    selectedDbPlayerNames.forEach(playerName => {
      const dbPlayer = dbPlayers.find(p => p.name === playerName);
      if (!dbPlayer) return;

      const normalizedName = dbPlayer.name.toLowerCase();
      const existingPlayer = tournament.players.find(
        p => p.name.toLowerCase() === normalizedName
      );

      if (existingPlayer) {
        duplicates.push(dbPlayer.name);
        return;
      }

      // Create new player object
      playersToAdd.push({
        id: crypto.randomUUID(),
        name: dbPlayer.name,
        titles: dbPlayer.titles || [],
        rating: dbPlayer.rating,
        points: 0,
        active: true,
        createdAt: new Date().toISOString(),
      });
    });

    // Add all players in one atomic update
    if (playersToAdd.length > 0) {
      const updated = {
        ...tournament,
        players: [...tournament.players, ...playersToAdd],
      };
      onTournamentUpdate(updated);
    }

    setSelectedDbPlayerNames([]);

    if (playersToAdd.length > 0 || duplicates.length > 0) {
      let message = "";
      if (playersToAdd.length > 0) {
        message += `Added ${playersToAdd.length} player${playersToAdd.length > 1 ? "s" : ""} to tournament.`;
      }
      if (duplicates.length > 0) {
        message += `${playersToAdd.length > 0 ? "\n" : ""}Skipped ${duplicates.length} duplicate${duplicates.length > 1 ? "s" : ""}: ${duplicates.join(", ")}`;
      }
      setStatusTitle("Import Complete");
      setStatusMessage(message);
      setShowStatusDialog(true);
    }
  }, [selectedDbPlayerNames, dbPlayers, tournament, onTournamentUpdate]);

  // Update and Export database to CSV
  const handleUpdateAndExport = useCallback(async () => {
    setIsSavingToDb(true);
    try {
      // 1. Update the internal database with current tournament players
      // Merge current tournament players into existing DB players
      const existingDb = tournament.playerDatabase || [];
      const currentPlayers = tournament.players.map(p => ({
        name: p.name,
        titles: p.titles || [],
        rating: p.rating
      }));

      // Create a map for easy merging (key: lowercase name)
      const dbMap = new Map<string, { name: string, titles: string[], rating: number }>();

      // Add existing DB players first
      existingDb.forEach(p => dbMap.set(p.name.toLowerCase(), p));

      // Overwrite/Add current players
      currentPlayers.forEach(p => dbMap.set(p.name.toLowerCase(), p));

      const newDbPlayers = Array.from(dbMap.values()).sort((a, b) => a.name.localeCompare(b.name));

      // Size Limit Check
      const jsonString = JSON.stringify(newDbPlayers);
      const sizeInBytes = new Blob([jsonString]).size;
      const MAX_DB_SIZE = LIMITS.MAX_TOURNAMENT_DATA_LENGTH;

      if (sizeInBytes > MAX_DB_SIZE) {
        throw new Error(`Database limit exceeded. Current size: ${(sizeInBytes / 1024).toFixed(1)}KB. Max: ${(MAX_DB_SIZE / 1024).toFixed(0)}KB.`);
      }

      // Update tournament object
      const updatedTournament = {
        ...tournament,
        playerDatabase: newDbPlayers
      };

      // Sync update to cloud
      onTournamentUpdate(updatedTournament);

      // Update local state
      setDbPlayers(newDbPlayers);

      // 2. Export to CSV
      if (newDbPlayers.length === 0) {
        setStatusTitle("Error");
        setStatusMessage("No players to export");
        setShowStatusDialog(true);
        return;
      }

      const csvContent = [
        ['Name', 'Titles', 'Rating'].join(','),
        ...newDbPlayers.map((p: any) => {
          const titlesStr = p.titles ? p.titles.join(';') : '';
          return `"${p.name.replace(/"/g, '""')}","${titlesStr}",${p.rating}`;
        })
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      const timestamp = new Date().toISOString().split('T')[0];
      const safeName = tournament.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeName}_players_db_${timestamp}.csv`;
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setStatusTitle("Success");
      setStatusMessage("Database updated and exported successfully!");
      setShowStatusDialog(true);
    } catch (error) {
      console.error("Export failed", error);
      setStatusTitle("Error");
      setStatusMessage(error instanceof Error ? error.message : "Failed to update and export database");
      setShowStatusDialog(true);
    } finally {
      setIsSavingToDb(false);
    }
  }, [tournament, onTournamentUpdate]);

  // Process the actual upload after confirmation
  const processDatabaseUpload = useCallback(async (file: File) => {
    // Check file size immediately
    if (file.size > LIMITS.MAX_CSV_FILE_SIZE_BYTES) {
      setStatusTitle("Error");
      setStatusMessage(`File is too large using > ${(LIMITS.MAX_CSV_FILE_SIZE_BYTES / 1024).toFixed(0)}KB. Please use a smaller database file.`);
      setShowStatusDialog(true);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
          setStatusTitle("Error");
          setStatusMessage("CSV file is empty or invalid");
          setShowStatusDialog(true);
          return;
        }

        const dataLines = lines.slice(1);
        const playersToImport: Array<{ name: string, titles: string[], rating: number }> = [];

        dataLines.forEach(line => {
          const parts: string[] = [];
          let current = '';
          let inQuotes = false;

          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              parts.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          parts.push(current.trim());

          if (parts.length >= 3) {
            const name = parts[0].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
            const titlesStr = parts[1].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
            const rating = parseInt(parts[2], 10);

            if (name && !isNaN(rating)) {
              playersToImport.push({
                name,
                titles: titlesStr ? titlesStr.split(';').map(t => t.trim()).filter(Boolean) : [],
                rating
              });
            }
          }
        });

        if (playersToImport.length > 0) {
          // Also check final JSON size
          const jsonString = JSON.stringify(playersToImport);
          if (new Blob([jsonString]).size > LIMITS.MAX_TOURNAMENT_DATA_LENGTH) {
            throw new Error(`Imported data exceeds ${(LIMITS.MAX_TOURNAMENT_DATA_LENGTH / 1024).toFixed(0)}KB storage limit.`);
          }

          setIsSavingToDb(true);

          // Update tournament object directly
          const updatedTournament = {
            ...tournament,
            playerDatabase: playersToImport
          };

          onTournamentUpdate(updatedTournament);

          // Update local state
          setDbPlayers(playersToImport);

          setStatusTitle("Success");
          setStatusMessage(`Database replaced successfully!\nLoaded ${playersToImport.length} players.`);
          setShowStatusDialog(true);
        } else {
          setStatusTitle("Error");
          setStatusMessage("No valid players found in CSV");
          setShowStatusDialog(true);
        }
      } catch (error) {
        console.error("Import failed", error);
        setStatusTitle("Error");
        setStatusMessage(error instanceof Error ? error.message : "Failed to process CSV upload");
        setShowStatusDialog(true);
      } finally {
        setIsSavingToDb(false);
      }
    };
    reader.readAsText(file);
  }, [tournament, onTournamentUpdate]);

  // Initial upload handler that shows confirmation
  const handleDatabaseUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPendingImportFile(file);
    setShowImportConfirmDialog(true);
    event.target.value = '';
  }, []);

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);

    try {
      const ratingValue = parseInt(playerRating, 10);

      if (isNaN(ratingValue) || ratingValue <= 0) {
        setStatusTitle("Error");
        setStatusMessage("Rating must be greater than 0");
        setShowStatusDialog(true);
        setIsAdding(false);
        return;
      }

      const normalizedName = playerName.trim().toLowerCase();
      const existingPlayer = tournament.players.find(
        p => p.name.toLowerCase() === normalizedName
      );

      if (existingPlayer) {
        setStatusTitle("Error");
        setStatusMessage(`Player "${existingPlayer.name}" already exists in the tournament.`);
        setShowStatusDialog(true);
        setIsAdding(false);
        return;
      }

      // Validate FideID if provided
      let fideIdValue: number | undefined = undefined;
      if (playerFideId.trim()) {
        const parsedFideId = parseInt(playerFideId, 10);
        if (isNaN(parsedFideId) || parsedFideId <= 0 || !Number.isInteger(parsedFideId)) {
          setStatusTitle("Error");
          setStatusMessage("FIDE ID must be a positive integer");
          setShowStatusDialog(true);
          setIsAdding(false);
          return;
        }
        fideIdValue = parsedFideId;
      }

      addPlayer({
        name: playerName,
        titles: playerTitles,
        rating: ratingValue,
        fideId: fideIdValue,
      });

      // Refresh is handled by addPlayer

      setPlayerTitles([]);
      setPlayerName("");
      setPlayerRating("1000");
      setPlayerFideId("");
      // Keep federation as is for easier batch entry from same country

    } catch (error) {
      console.error("Failed to add player:", error);
      if (error instanceof Error && error.message.includes('Too many requests')) {
        const match = error.message.match(/(\d+) second/);
        const seconds = match ? parseInt(match[1], 10) : 60;
        setRateLimitState({ isLimited: true, retryAfterMs: seconds * 1000 });
      } else {
        setStatusTitle("Error");
        setStatusMessage(error instanceof Error ? error.message : "Failed to add player");
        setShowStatusDialog(true);
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeactivatePlayer = useCallback((playerId: string) => {
    try {
      deactivatePlayer(playerId);
    } catch (error) {
      console.error("Failed to deactivate player:", error);
      if (error instanceof Error && error.message.includes('Too many requests')) {
        const match = error.message.match(/(\d+) second/);
        const seconds = match ? parseInt(match[1], 10) : 60;
        setRateLimitState({ isLimited: true, retryAfterMs: seconds * 1000 });
      }
    }
  }, [deactivatePlayer]);

  const handleActivatePlayer = useCallback((playerId: string) => {
    try {
      activatePlayer(playerId);
    } catch (error) {
      console.error("Failed to activate player:", error);
      if (error instanceof Error && error.message.includes('Too many requests')) {
        const match = error.message.match(/(\d+) second/);
        const seconds = match ? parseInt(match[1], 10) : 60;
        setRateLimitState({ isLimited: true, retryAfterMs: seconds * 1000 });
      }
    }
  }, [activatePlayer]);

  const hasPlayedRounds = useCallback((playerId: string): boolean => {
    return tournament.rounds.some(round =>
      round.pairings.some(pairing =>
        pairing.whitePlayerId === playerId || pairing.blackPlayerId === playerId
      )
    );
  }, [tournament.rounds]);

  const handleDeletePlayer = useCallback((playerId: string) => {
    setPlayerToDelete(playerId);
    setShowDeleteDialog(true);
  }, []);

  const confirmDeletePlayer = () => {
    if (!playerToDelete) return;

    try {
      removePlayer(playerToDelete);
    } catch (error) {
      console.error("Failed to delete player:", error);
      setStatusTitle("Error");
      setStatusMessage("Failed to delete player");
      setShowStatusDialog(true);
    } finally {
      setShowDeleteDialog(false);
      setPlayerToDelete(null);
    }
  };

  // Handle inline player updates
  const handlePlayerUpdate = useCallback((playerId: string, updates: Partial<Pick<Player, 'name' | 'rating' | 'titles' | 'fideId'>>) => {
    try {
      // Validate name if provided
      if (updates.name !== undefined && !updates.name.trim()) {
        return; // Don't update with empty name
      }

      // Validate rating if provided
      if (updates.rating !== undefined && (isNaN(updates.rating) || updates.rating <= 0)) {
        return; // Don't update with invalid rating
      }

      // Handle fideId - allow undefined to clear, validate if number
      if (updates.fideId !== undefined && updates.fideId !== null) {
        if (isNaN(updates.fideId) || updates.fideId <= 0 || !Number.isInteger(updates.fideId)) {
          return; // Don't update with invalid fideId
        }
      }

      updatePlayerDetails(playerId, updates);
    } catch (error) {
      console.error("Failed to update player:", error);
      setStatusTitle("Error");
      setStatusMessage(error instanceof Error ? error.message : "Failed to update player");
      setShowStatusDialog(true);
    }
  }, [updatePlayerDetails]);

  // Get filtered players (all players, both active and inactive)
  const allPlayers = useMemo(() => {
    let players = [...tournament.players];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      players = players.filter(p =>
        p.name.toLowerCase().includes(query) ||
        (p.titles && p.titles.some(title => title.toLowerCase().includes(query)))
      );
    }

    return players;
  }, [tournament.players, searchQuery]);

  // Single column definitions for all players
  const columns = useMemo(
    () =>
      getPlayerColumns({
        tournament,
        onPlayerUpdate: handlePlayerUpdate,
        onDeactivate: handleDeactivatePlayer,
        onActivate: handleActivatePlayer,
        onDelete: handleDeletePlayer,
        hasPlayedRounds,
        allTitles: getAllTitles(tournament),
        allPlayers: tournament.players,
        readOnly,
      }),
    [tournament, handlePlayerUpdate, handleDeactivatePlayer, handleActivatePlayer, handleDeletePlayer, hasPlayedRounds, readOnly]
  );

  // Row styling - dim deactivated players
  const getRowClassName = (row: any) => {
    const player = row.original as Player;
    return !player.active ? "opacity-50" : "";
  };

  // Player limit calculations
  const playerCount = tournament.players.length;
  const canAddMore = canAddPlayer(playerCount);
  const remainingPlayers = getRemainingPlayers(playerCount);
  const showPlayerLimitWarning = remainingPlayers <= 20 && remainingPlayers > 0;

  return (
    <div className="space-y-4">
      {/* Rate Limit Alert */}
      <RateLimitAlert
        isLimited={rateLimitState.isLimited}
        retryAfterMs={rateLimitState.retryAfterMs}
        onCooldownComplete={() => setRateLimitState({ isLimited: false, retryAfterMs: 0 })}
      />

      {/* Player Limit Warning */}
      {!canAddMore && !readOnly && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {LIMIT_MESSAGES.PLAYER_LIMIT_REACHED}
        </div>
      )}
      {showPlayerLimitWarning && !readOnly && (
        <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-600">
          {remainingPlayers} player slot{remainingPlayers === 1 ? '' : 's'} remaining (max {LIMITS.MAX_PLAYERS_PER_TOURNAMENT})
        </div>
      )}
      {/* Search and Add Player Section */}
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="relative flex-1 min-w-0">
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 h-6 w-6"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs text-xs">
                  <p>
                    <strong>Database:</strong> Import a CSV and search players.
                    <br /><br />
                    <strong>Export:</strong> Save players for future tournaments.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="flex items-center gap-1 sm:gap-2">
              <label className="cursor-pointer">
                <input
                  id="uploadDbInput"
                  type="file"
                  accept=".csv"
                  onChange={handleDatabaseUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 sm:gap-2 px-2 sm:px-3"
                  disabled={isSavingToDb}
                  asChild
                >
                  <span>
                    <Upload className="h-4 w-4" />
                    <span className="hidden sm:inline">Import</span>
                  </span>
                </Button>
              </label>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 sm:gap-2 px-2 sm:px-3"
                onClick={handleUpdateAndExport}
                disabled={isSavingToDb}
              >
                {isSavingToDb ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Export</span>
              </Button>
            </div>
            <Collapsible open={showAddForm} onOpenChange={setShowAddForm}>
              <CollapsibleTrigger asChild>
                <Button variant="default" size="sm" className="gap-1 sm:gap-2 px-2 sm:px-3">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Player</span>
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>
        )}
      </div>

      {/* Add Player Form */}
      <Collapsible open={showAddForm} onOpenChange={setShowAddForm}>
        <CollapsibleContent>
          <div className="bg-card border rounded-lg">
            <div className="px-4 pb-3 pt-3 space-y-3">
              {/* Database Player Selection */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From database</Label>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Combobox
                      options={dbPlayers
                        .map(p => ({
                          value: p.name,
                          label: `${p.name}${p.titles?.length ? ` (${p.titles.join(", ")})` : ""} - ${p.rating}`,
                          disabled: tournament.players.some(tp => tp.name.toLowerCase() === p.name.toLowerCase()),
                        }))}
                      selected={selectedDbPlayerNames}
                      onChange={setSelectedDbPlayerNames}
                      placeholder={isLoadingDbPlayers ? "Loading..." : (dbPlayers.length === 0 ? "No database loaded" : "Select players from database...")}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-10"
                    disabled={selectedDbPlayerNames.length === 0}
                    onClick={handleAddSelectedDbPlayers}
                  >
                    Add {selectedDbPlayerNames.length > 0 ? `(${selectedDbPlayerNames.length})` : ""}
                  </Button>
                </div>
              </div>

              {/* Add Player Form */}
              <form onSubmit={handleAddPlayer} className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[120px]">
                  <Label htmlFor="playerTitle" className="text-xs text-muted-foreground">Title</Label>
                  <Combobox
                    options={getAllTitles(tournament).map(({ name }) => {
                      const customTitle = tournament.customTitles?.find(t => t.name === name);
                      return {
                        value: name,
                        label: name,
                        color: customTitle?.color,
                      };
                    })}
                    selected={playerTitles}
                    onChange={setPlayerTitles}
                    placeholder="Select"
                  />
                </div>
                <div className="flex-[2] min-w-[180px]">
                  <Label htmlFor="playerName" className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    id="playerName"
                    type="text"
                    placeholder="Player name"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    maxLength={50}
                    required
                    className="h-9"
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor="playerRating" className="text-xs text-muted-foreground">Rating</Label>
                  <Input
                    id="playerRating"
                    type="number"
                    min="1"
                    placeholder="Rating"
                    value={playerRating}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "" || (parseInt(value, 10) > 0)) {
                        setPlayerRating(value);
                      }
                    }}
                    required
                    className="h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div className="w-28">
                  <Label htmlFor="playerFideId" className="text-xs text-muted-foreground">FIDE ID</Label>
                  <Input
                    id="playerFideId"
                    type="number"
                    min="1"
                    placeholder="Optional"
                    value={playerFideId}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "" || (parseInt(value, 10) > 0)) {
                        setPlayerFideId(value);
                      }
                    }}
                    className="h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <Button type="submit" disabled={isAdding || !playerName.trim()} size="sm" className="h-9">
                  {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
              </form>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Players Table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        {/* Players Data Table */}
        {allPlayers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {searchQuery ? (
              <>
                <Search className="h-8 w-8 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No players found</p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-1">No players yet</p>
                <p className="text-sm text-muted-foreground">Click &quot;Add Player&quot; to get started</p>
              </>
            )}
          </div>
        ) : (
          <DataTable columns={columns} data={allPlayers} getRowClassName={getRowClassName} compact />
        )}
      </div>


      {/* Status Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{statusTitle}</DialogTitle>
            <DialogDescription>{statusMessage}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Import Confirm Dialog */}
      <ConfirmDialog
        open={showImportConfirmDialog}
        onOpenChange={(open) => {
          if (!open) {
            setPendingImportFile(null);
          }
          setShowImportConfirmDialog(open);
        }}
        title="Replace Player Database?"
        description="Importing a new file will completely replace the loaded database for this tournament."
        confirmLabel="Replace Database"
        onConfirm={() => {
          if (pendingImportFile) {
            processDatabaseUpload(pendingImportFile);
          }
          setShowImportConfirmDialog(false);
        }}
      />

      {/* Delete Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Player"
        description="Permanently delete this player? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDeletePlayer}
        variant="destructive"
      />
    </div>
  );
}
