"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Plus, Loader2, ChevronLeft, ChevronRight, Trash2, Check, MoreHorizontal, ChevronFirst, ChevronLast, Delete, ArrowDown, ArrowUp, ArrowRightLeft, Shuffle } from "lucide-react";
import { type Tournament } from "@/features/tournaments/model";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/utils";
import { TitleBadges } from "./title-badges";
import { useTournamentActions } from "@/features/tournaments/hooks/use-tournament-actions";
import { getResultStyles, isUpset as checkIsUpset } from "@/features/tournaments/results";
import { calculatePairingRatingUpdates } from "@/features/tournaments/ratings";
import { RESULT_KEYBOARD_SHORTCUTS } from "@/features/tournaments/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/shared/ui/pagination";
import { RateLimitAlert } from "@/shared/components/rate-limit-alert";
import { Progress } from "@/shared/ui/progress";
import { LIMITS, canCreateRound, getRemainingRounds, LIMIT_MESSAGES } from "@/features/tournaments/limits";

interface RoundsTabProps {
  tournament: Tournament;
  onTournamentUpdate: (tournament: Tournament) => void;
  readOnly?: boolean;
}

export function RoundsTab({ tournament, onTournamentUpdate, readOnly }: RoundsTabProps) {
  // Use the tournament actions hook for state management
  const { updateResult, completeRound, addPairing, deleteRound, createRound, generateRoundRobinSchedule, deletePairing, swapPairingColors, swapPairingOpponents, movePairing } = useTournamentActions({
    tournament,
    onTournamentUpdate,
  });

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(() => {
    if (tournament.rounds.length === 0) return null;
    const firstIncomplete = tournament.rounds.find(r => !r.completed);
    return firstIncomplete?.id ?? tournament.rounds[tournament.rounds.length - 1].id;
  });
  const [showDeleteRoundDialog, setShowDeleteRoundDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState("");

  // Manual Pairing State
  const [showManualPairingDialog, setShowManualPairingDialog] = useState(false);
  const [whitePlayerId, setWhitePlayerId] = useState<string>("");
  const [blackPlayerId, setBlackPlayerId] = useState<string>("bye");
  const [pairingToDelete, setPairingToDelete] = useState<{ roundId: string; pairingId: string } | null>(null);
  const [swapContext, setSwapContext] = useState<{ roundId: string; pairingId: string } | null>(null);
  const [swapTargetPairingId, setSwapTargetPairingId] = useState<string>("");
  const [swapSide, setSwapSide] = useState<"black" | "white">("black");

  // Focused pairing for keyboard shortcuts
  const [focusedPairingId, setFocusedPairingId] = useState<string | null>(null);

  // Rate limit state
  const [rateLimitState, setRateLimitState] = useState<{ isLimited: boolean; retryAfterMs: number }>({
    isLimited: false,
    retryAfterMs: 0,
  });

  const isRoundRobin = tournament.system === "round-robin";
  const activePlayerCount = useMemo(
    () => tournament.players.filter(p => p.active).length,
    [tournament.players]
  );

  // Update selected round when tournament changes
  useEffect(() => {
    if (tournament.rounds.length === 0) {
      if (selectedRoundId) setSelectedRoundId(null);
      return;
    }

    const selectedRound = tournament.rounds.find(r => r.id === selectedRoundId);
    if (!selectedRound) {
      const firstIncomplete = tournament.rounds.find(r => !r.completed);
      const fallbackRound = firstIncomplete ?? tournament.rounds[tournament.rounds.length - 1];
      setSelectedRoundId(fallbackRound.id);
    }
  }, [tournament.rounds, selectedRoundId]);

  const canCreateNextRound = useMemo(() => {
    if (isRoundRobin) return false;
    if (tournament.rounds.length === 0) {
      return activePlayerCount >= 2;
    }
    const lastRound = tournament.rounds[tournament.rounds.length - 1];
    return lastRound.completed && tournament.rounds.length < tournament.totalRounds && activePlayerCount >= 2;
  }, [isRoundRobin, tournament.rounds, tournament.totalRounds, activePlayerCount]);

  const canGenerateRoundRobin = useMemo(() => {
    return isRoundRobin && tournament.rounds.length === 0 && activePlayerCount >= 2;
  }, [isRoundRobin, tournament.rounds.length, activePlayerCount]);

  const handleCreateRound = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const newRound = createRound();
      // Select the newly created round
      setSelectedRoundId(newRound.id);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Too many requests')) {
        const match = err.message.match(/(\d+) second/);
        const seconds = match ? parseInt(match[1], 10) : 60;
        setRateLimitState({ isLimited: true, retryAfterMs: seconds * 1000 });
      } else {
        setError(err instanceof Error ? err.message : "Failed to create round");
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerateRoundRobin = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const generatedRounds = generateRoundRobinSchedule();
      if (generatedRounds.length > 0) {
        setSelectedRoundId(generatedRounds[0].id);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Too many requests')) {
        const match = err.message.match(/(\d+) second/);
        const seconds = match ? parseInt(match[1], 10) : 60;
        setRateLimitState({ isLimited: true, retryAfterMs: seconds * 1000 });
      } else {
        setError(err instanceof Error ? err.message : "Failed to generate round-robin schedule");
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleResultChange = useCallback((roundId: string, pairingId: string, result: "1-0" | "0-1" | "1/2-1/2" | "1F-0F" | "0F-1F" | "0F-0F" | "empty") => {
    try {
      const resultValue = result === "empty" ? null : result;
      updateResult(roundId, pairingId, resultValue);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Too many requests')) {
        const match = err.message.match(/(\d+) second/);
        const seconds = match ? parseInt(match[1], 10) : 60;
        setRateLimitState({ isLimited: true, retryAfterMs: seconds * 1000 });
      } else {
        console.error("Failed to update result:", err);
      }
    }
  }, [updateResult]);

  // Keyboard shortcuts for entering results (1-6) - only when dropdown is open
  useEffect(() => {
    const selectedRound = tournament.rounds.find(r => r.id === selectedRoundId);
    if (!selectedRound || selectedRound.completed || !focusedPairingId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const result = RESULT_KEYBOARD_SHORTCUTS[e.key];
      if (!result) return;

      const targetPairing = selectedRound.pairings.find(p => p.id === focusedPairingId && p.blackPlayerId);
      if (targetPairing) {
        e.preventDefault();
        handleResultChange(selectedRound.id, targetPairing.id, result);
        setFocusedPairingId(null); // Close dropdown after selection
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRoundId, tournament.rounds, focusedPairingId, handleResultChange]);

  const handleMarkComplete = (roundId: string) => {
    try {
      completeRound(roundId);
    } catch (err) {
      console.error("Failed to mark round as complete:", err);
    }
  };

  const handleDeleteLastRound = () => {
    setShowDeleteRoundDialog(true);
  };

  const handlePairingActionError = (err: unknown, fallbackMessage: string) => {
    if (err instanceof Error && err.message.includes('Too many requests')) {
      const match = err.message.match(/(\d+) second/);
      const seconds = match ? parseInt(match[1], 10) : 60;
      setRateLimitState({ isLimited: true, retryAfterMs: seconds * 1000 });
      return;
    }
    setErrorDialogMessage(err instanceof Error ? err.message : fallbackMessage);
    setShowErrorDialog(true);
  };

  const handleManualPairing = () => {
    if (!selectedRoundId || !whitePlayerId) return;

    try {
      const bId = blackPlayerId === "bye" ? null : blackPlayerId;
      addPairing(selectedRoundId, whitePlayerId, bId);

      setWhitePlayerId("");
      setBlackPlayerId("bye");
      setShowManualPairingDialog(false);
    } catch (err) {
      handlePairingActionError(err, "Failed to add manual pairing");
    }
  };

  const openSwapDialog = (roundId: string, pairingId: string) => {
    const round = tournament.rounds.find(r => r.id === roundId);
    const firstCandidate = round?.pairings.find(p => p.id !== pairingId);
    setSwapSide("black");
    setSwapContext({ roundId, pairingId });
    setSwapTargetPairingId(firstCandidate ? firstCandidate.id : "");
  };

  const closeSwapDialog = () => {
    setSwapContext(null);
    setSwapTargetPairingId("");
  };

  const handleSwapColors = (roundId: string, pairingId: string) => {
    try {
      swapPairingColors(roundId, pairingId);
    } catch (err) {
      handlePairingActionError(err, "Failed to swap colors");
    }
  };

  const handleMovePairing = (roundId: string, pairingId: string, direction: "up" | "down") => {
    try {
      movePairing(roundId, pairingId, direction);
    } catch (err) {
      handlePairingActionError(err, "Failed to move pairing");
    }
  };

  const handleSwapOpponents = () => {
    if (!swapContext || !swapTargetPairingId) return;
    try {
      swapPairingOpponents(swapContext.roundId, swapContext.pairingId, swapTargetPairingId, swapSide);
      closeSwapDialog();
    } catch (err) {
      handlePairingActionError(err, "Failed to swap opponents");
    }
  };

  const confirmDeletePairing = () => {
    if (!pairingToDelete) return;
    try {
      deletePairing(pairingToDelete.roundId, pairingToDelete.pairingId);
    } catch (err) {
      handlePairingActionError(err, "Failed to delete pairing");
    } finally {
      setPairingToDelete(null);
    }
  };

  const confirmDeleteRound = () => {
    try {
      deleteRound();
      // After deletion, select the last remaining round or null
      if (tournament.rounds.length > 1) {
        setSelectedRoundId(tournament.rounds[tournament.rounds.length - 2].id);
      } else {
        setSelectedRoundId(null);
      }
    } catch (err) {
      console.error("Failed to delete round:", err);
      setErrorDialogMessage(err instanceof Error ? err.message : "Failed to delete round");
      setShowErrorDialog(true);
    } finally {
      setShowDeleteRoundDialog(false);
    }
  };

  const canMarkRoundComplete = (round: Tournament["rounds"][0]) => {
    if (round.completed) return false;
    return round.pairings.every(p => !p.blackPlayerId || (p.result !== null && p.result !== undefined));
  };

  const getPlayerDisplay = (playerId: string | null) => {
    if (!playerId) return { titles: [], name: "Bye", rating: "-" };
    const player = tournament.players.find(p => p.id === playerId);
    if (!player) return { titles: [], name: "Unknown", rating: "-" };
    return {
      titles: player.titles || [],
      name: player.name,
      rating: player.rating.toString(),
    };
  };

  const getPairingLabel = (pairing: Tournament["rounds"][0]["pairings"][0], index: number) => {
    const white = getPlayerDisplay(pairing.whitePlayerId).name;
    const black = getPlayerDisplay(pairing.blackPlayerId).name;
    return `Table ${index + 1}: ${white} vs ${black}`;
  };

  const swapRound = swapContext ? tournament.rounds.find(r => r.id === swapContext.roundId) : null;
  const swapSourcePairing = swapRound?.pairings.find(p => p.id === swapContext?.pairingId) ?? null;
  const swapCandidates = swapRound ? swapRound.pairings.filter(p => p.id !== swapContext?.pairingId) : [];
  const swapSourceIndex = swapSourcePairing && swapRound
    ? swapRound.pairings.findIndex(p => p.id === swapSourcePairing.id)
    : -1;
  const swapSourceLabel = swapSourcePairing && swapSourceIndex >= 0
    ? getPairingLabel(swapSourcePairing, swapSourceIndex)
    : "this pairing";
  const deletePairingRound = pairingToDelete ? tournament.rounds.find(r => r.id === pairingToDelete.roundId) : null;
  const deletePairingItem = deletePairingRound?.pairings.find(p => p.id === pairingToDelete?.pairingId) ?? null;
  const deletePairingIndex = deletePairingItem && deletePairingRound
    ? deletePairingRound.pairings.findIndex(p => p.id === deletePairingItem.id)
    : -1;
  const deletePairingLabel = deletePairingItem && deletePairingIndex >= 0
    ? getPairingLabel(deletePairingItem, deletePairingIndex)
    : "this pairing";

  const getPlayerPointsAtRoundStart = (playerId: string | null, round: Tournament["rounds"][0]) => {
    if (!playerId) return "-";
    const pointsAtStart = round.playerPointsAtStart?.[playerId];
    return pointsAtStart !== undefined ? pointsAtStart : "-";
  };

  const getPlayerRatingAtRoundStart = (playerId: string | null, round: Tournament["rounds"][0]) => {
    if (!playerId) return "-";
    // Use playerRatingsAtStart if available, otherwise fall back to current rating
    const ratingAtStart = round.playerRatingsAtStart?.[playerId];
    if (ratingAtStart !== undefined) return ratingAtStart;
    // Fallback for older rounds without playerRatingsAtStart
    const player = tournament.players.find(p => p.id === playerId);
    return player ? player.rating : "-";
  };

  const getPlayerRating = (playerId: string | null): number => {
    if (!playerId) return 0;
    const player = tournament.players.find(p => p.id === playerId);
    return player ? player.rating : 0;
  };

  const isRatedRound = (round: Tournament["rounds"][0]) => {
    if (round.completed) {
      return round.rated ?? tournament.rated;
    }
    return tournament.rated;
  };

  // Calculate rating change for a pairing (for display)
  const getRatingChange = (pairing: Tournament["rounds"][0]["pairings"][0], round: Tournament["rounds"][0]) => {
    if (!isRatedRound(round) || !pairing.result || !pairing.blackPlayerId) {
      return { white: null, black: null };
    }

    const whiteRating = round.playerRatingsAtStart?.[pairing.whitePlayerId] ?? getPlayerRating(pairing.whitePlayerId);
    const blackRating = round.playerRatingsAtStart?.[pairing.blackPlayerId] ?? getPlayerRating(pairing.blackPlayerId);

    const updates = calculatePairingRatingUpdates(
      whiteRating,
      blackRating,
      pairing.whitePlayerId,
      pairing.blackPlayerId,
      pairing.result
    );

    if (!updates) return { white: null, black: null };

    return {
      white: updates.white.change,
      black: updates.black.change,
    };
  };

  /**
   * Check if a pairing result is an upset using shared utility.
   */
  const isUpset = (pairing: Tournament["rounds"][0]["pairings"][0]): boolean => {
    if (!pairing.result || !pairing.blackPlayerId) return false;
    const whiteRating = getPlayerRating(pairing.whitePlayerId);
    const blackRating = getPlayerRating(pairing.blackPlayerId);
    return checkIsUpset(pairing.result, whiteRating, blackRating);
  };

  const calculateRoundStatistics = (round: Tournament["rounds"][0]) => {
    const completedPairings = round.pairings.filter(p => p.result && p.blackPlayerId);
    const totalGames = completedPairings.length;

    if (totalGames === 0) {
      return { totalGames: 0, upsets: 0, draws: 0, forfeits: 0 };
    }

    let upsets = 0, draws = 0, forfeits = 0;

    completedPairings.forEach(pairing => {
      if (isUpset(pairing)) upsets++;
      if (pairing.result === "1/2-1/2") draws++;
      if (pairing.result?.includes("F")) forfeits++;
    });

    return { totalGames, upsets, draws, forfeits };
  };

  const selectedRound = tournament.rounds.find(r => r.id === selectedRoundId);
  const selectedRoundIndex = tournament.rounds.findIndex(r => r.id === selectedRoundId);
  const completedPairingsCount = selectedRound
    ? selectedRound.pairings.filter(p => p.result || !p.blackPlayerId).length
    : 0;

  const navigateRound = (direction: "prev" | "next") => {
    if (direction === "prev" && selectedRoundIndex > 0) {
      setSelectedRoundId(tournament.rounds[selectedRoundIndex - 1].id);
    } else if (direction === "next" && selectedRoundIndex < tournament.rounds.length - 1) {
      setSelectedRoundId(tournament.rounds[selectedRoundIndex + 1].id);
    }
  };

  // Memoized list of available players for manual pairing (not already paired in current round)
  const availablePlayers = useMemo(() => {
    if (!selectedRound) return [];
    const pairedPlayerIds = new Set(
      selectedRound.pairings.flatMap(p => [p.whitePlayerId, p.blackPlayerId].filter(id => id !== null))
    );
    return tournament.players
      .filter(player => !pairedPlayerIds.has(player.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedRound, tournament.players]);


  return (
    <div className="space-y-4">
      {/* Rate Limit Alert */}
      <RateLimitAlert
        isLimited={rateLimitState.isLimited}
        retryAfterMs={rateLimitState.retryAfterMs}
        onCooldownComplete={() => setRateLimitState({ isLimited: false, retryAfterMs: 0 })}
      />

      {/* Round Limit Warning */}
      {(() => {
        if (isRoundRobin) return null;
        const roundCount = tournament.rounds.length;
        const canCreate = canCreateRound(roundCount);
        const remaining = getRemainingRounds(roundCount);
        const showWarning = remaining <= 5 && remaining > 0 && !readOnly;

        if (!canCreate && !readOnly) {
          return (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {LIMIT_MESSAGES.ROUND_LIMIT_REACHED}
            </div>
          );
        }
        if (showWarning) {
          return (
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-600">
              {remaining} round{remaining === 1 ? '' : 's'} remaining (max {LIMITS.MAX_ROUNDS_PER_TOURNAMENT})
            </div>
          );
        }
        return null;
      })()}
      {/* Search and Round Navigation Section */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
          {tournament.rounds.length > 0 ? (
            <>
              <Pagination className="justify-start sm:justify-center">
                <PaginationContent className="flex-wrap sm:flex-nowrap">
                  <PaginationItem>
                    <PaginationLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedRoundId(tournament.rounds[0].id);
                      }}
                      size="icon"
                      className={cn(
                        "rounded-full",
                        selectedRoundIndex <= 0 ? "pointer-events-none opacity-50" : "cursor-pointer"
                      )}
                      aria-label="Go to first round"
                    >
                      <ChevronFirst className="h-4 w-4" />
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        navigateRound("prev");
                      }}
                      size="icon"
                      className={cn(
                        "rounded-full",
                        selectedRoundIndex <= 0 ? "pointer-events-none opacity-50" : "cursor-pointer"
                      )}
                      aria-label="Go to previous round"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </PaginationLink>
                  </PaginationItem>

                  <PaginationItem>
                    <Select
                      value={selectedRoundId || ""}
                      onValueChange={(val) => setSelectedRoundId(val)}
                    >
                      <SelectTrigger className="w-fit gap-2 sm:gap-3 h-8 px-2 sm:px-3 whitespace-nowrap text-xs sm:text-sm">
                        <SelectValue placeholder="Select round" />
                      </SelectTrigger>
                      <SelectContent>
                        {tournament.rounds.map((round) => (
                          <SelectItem key={round.id} value={round.id}>
                            Round {round.roundNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </PaginationItem>

                  <PaginationItem>
                    <PaginationLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        navigateRound("next");
                      }}
                      size="icon"
                      className={cn(
                        "rounded-full",
                        selectedRoundIndex >= tournament.rounds.length - 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                      )}
                      aria-label="Go to next round"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedRoundId(tournament.rounds[tournament.rounds.length - 1].id);
                      }}
                      size="icon"
                      className={cn(
                        "rounded-full",
                        selectedRoundIndex >= tournament.rounds.length - 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                      )}
                      aria-label="Go to last round"
                    >
                      <ChevronLast className="h-4 w-4" />
                    </PaginationLink>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">No rounds yet</span>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center justify-start gap-1 sm:w-auto sm:justify-end sm:gap-2">
          {selectedRound && (
            <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap hidden sm:inline-block ${selectedRound.completed
              ? "bg-green-500/10 text-green-600"
              : "bg-muted text-muted-foreground"
              }`}>
              {selectedRound.completed ? "Complete" : "In Progress"}
            </span>
          )}
          {selectedRound && !selectedRound.completed && !readOnly && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManualPairingDialog(true)}
                className="h-8 gap-1 sm:gap-1.5 px-2 sm:px-3"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Pair</span>
              </Button>
              <Button
                size="sm"
                onClick={() => handleMarkComplete(selectedRound.id)}
                disabled={!canMarkRoundComplete(selectedRound)}
                className="h-8 gap-1 sm:gap-1.5 px-2 sm:px-3"
              >
                <Check className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Complete</span>
              </Button>
            </>
          )}
          {canGenerateRoundRobin && !readOnly && (
            <Button onClick={handleGenerateRoundRobin} disabled={isCreating} size="sm" className="h-8 gap-1 sm:gap-1.5 px-2 sm:px-3">
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Generate Pairings</span>
                </>
              )}
            </Button>
          )}
          {canCreateNextRound && !readOnly && (
            <Button onClick={handleCreateRound} disabled={isCreating} size="sm" className="h-8 gap-1 sm:gap-1.5 px-2 sm:px-3">
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Round {tournament.rounds.length + 1}</span>
                </>
              )}
            </Button>
          )}
          {tournament.rounds.length > 0 && !readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleDeleteLastRound}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Last Round
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {error && (
        <div className="p-2 bg-destructive/10 text-destructive rounded text-sm">
          {error}
        </div>
      )}

      {/* Round Content */}
          {tournament.rounds.length === 0 ? (
        <div className="bg-card border rounded-lg py-16 text-center">
          <p className="text-muted-foreground mb-2">No rounds created yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            {isRoundRobin
              ? activePlayerCount < 2
                ? "Add at least 2 players to generate the round-robin schedule"
                : "Click Generate Pairings to create the round-robin schedule"
              : activePlayerCount < 2
                ? "Add at least 2 players to start"
                : "Click the button above to create Round 1"
            }
          </p>
          {isRoundRobin && activePlayerCount >= 2 && !readOnly && (
            <Button onClick={handleGenerateRoundRobin} disabled={isCreating}>
              <Plus className="h-4 w-4 mr-2" />
              Generate Pairings
            </Button>
          )}
          {!isRoundRobin && activePlayerCount >= 2 && (
            <Button onClick={handleCreateRound} disabled={isCreating}>
              <Plus className="h-4 w-4 mr-2" />
              Create Round 1
            </Button>
          )}
        </div>
      ) : selectedRound && (
        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="bg-card border rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Progress
                value={(completedPairingsCount / selectedRound.pairings.length) * 100}
                className="flex-1 h-1.5"
              />
              <span className="text-xs text-muted-foreground tabular-nums">
                {completedPairingsCount}/{selectedRound.pairings.length}
              </span>
            </div>
          </div>

          {/* Pairings */}
          <div className="bg-card border rounded-lg divide-y overflow-hidden">
            {selectedRound.pairings.map((pairing, index) => {
              const whitePlayer = getPlayerDisplay(pairing.whitePlayerId);
              const blackPlayer = getPlayerDisplay(pairing.blackPlayerId);
              const upset = isUpset(pairing);
              const canEdit = !readOnly && !selectedRound.completed;
              const isFirst = index === 0;
              const isLast = index === selectedRound.pairings.length - 1;

              return (
                <div
                  key={pairing.id}
                  className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-stretch sm:gap-0 ${upset ? "bg-orange-500/5" : ""}`}
                >
                  <div className="flex flex-col gap-2 min-w-0 sm:flex-1 sm:flex-row sm:items-center sm:gap-2">
                    {/* Table Number */}
                    <span className="text-xs text-muted-foreground w-6 text-center tabular-nums self-start sm:self-auto">
                      {index + 1}
                    </span>

                  {/* White Player */}
                  <div className="flex-1 min-w-0 w-full sm:w-auto">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <span className="text-sm truncate">{whitePlayer.name}</span>
                      {whitePlayer.titles.length > 0 && (
                        <TitleBadges
                          tournament={tournament}
                          titles={whitePlayer.titles}
                          size="sm"
                        />
                      )}
                      {upset && (pairing.result === "1-0" || pairing.result === "1F-0F") && (
                        <span className="text-orange-500 text-xs" title="Upset">⚡</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1">
                      <span>{getPlayerRatingAtRoundStart(pairing.whitePlayerId, selectedRound)}</span>
                      {(() => {
                        const changes = getRatingChange(pairing, selectedRound);
                        if (changes.white !== null) {
                          const sign = changes.white >= 0 ? "+" : "";
                          const colorClass = changes.white > 0 ? "text-green-600" : changes.white < 0 ? "text-red-500" : "text-muted-foreground";
                          return <span className={colorClass}>({sign}{changes.white})</span>;
                        }
                        return null;
                      })()}
                      <span>| {getPlayerPointsAtRoundStart(pairing.whitePlayerId, selectedRound)} pts</span>
                    </div>
                  </div>

                  {/* Result */}
                  <div className="w-full sm:w-28 flex-shrink-0">
                    {pairing.blackPlayerId ? (
                      <DropdownMenu
                        open={focusedPairingId === pairing.id}
                        onOpenChange={(open) => setFocusedPairingId(open ? pairing.id : null)}
                      >
                        <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className={`h-7 w-full justify-center px-2 text-xs tabular-nums ${getResultStyles(pairing.result)}`}
                              disabled={readOnly || selectedRound.completed}
                            >
                            <span>{pairing.result ? pairing.result : "-"}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="min-w-[8rem]">
                          <DropdownMenuItem onClick={() => handleResultChange(selectedRound.id, pairing.id, "1-0")} className="flex justify-between">
                            <span>1-0</span>
                            <kbd className="ml-2 size-4 text-[10px] font-mono bg-muted rounded border inline-flex items-center justify-center">1</kbd>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResultChange(selectedRound.id, pairing.id, "0-1")} className="flex justify-between">
                            <span>0-1</span>
                            <kbd className="ml-2 size-4 text-[10px] font-mono bg-muted rounded border inline-flex items-center justify-center">2</kbd>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResultChange(selectedRound.id, pairing.id, "1/2-1/2")} className="flex justify-between">
                            <span>1/2-1/2</span>
                            <kbd className="ml-2 size-4 text-[10px] font-mono bg-muted rounded border inline-flex items-center justify-center">3</kbd>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleResultChange(selectedRound.id, pairing.id, "1F-0F")} className="flex justify-between">
                            <span>1F-0F</span>
                            <kbd className="ml-2 size-4 text-[10px] font-mono bg-muted rounded border inline-flex items-center justify-center">4</kbd>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResultChange(selectedRound.id, pairing.id, "0F-1F")} className="flex justify-between">
                            <span>0F-1F</span>
                            <kbd className="ml-2 size-4 text-[10px] font-mono bg-muted rounded border inline-flex items-center justify-center">5</kbd>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResultChange(selectedRound.id, pairing.id, "0F-0F")} className="flex justify-between">
                            <span>0F-0F</span>
                            <kbd className="ml-2 size-4 text-[10px] font-mono bg-muted rounded border inline-flex items-center justify-center">6</kbd>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleResultChange(selectedRound.id, pairing.id, "empty")} className="flex justify-between">
                            <span className="text-muted-foreground">Clear</span>
                            <kbd className="ml-2 size-4 text-[10px] font-mono bg-muted rounded border inline-flex items-center justify-center"><Delete className="h-2.5 w-2.5" /></kbd>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="block text-center text-sm text-muted-foreground">Bye</span>
                    )}
                  </div>

                  {/* Black Player */}
                  <div className="flex-1 min-w-0 w-full text-left sm:text-right">
                    {pairing.blackPlayerId ? (
                      <>
                        <div className="flex items-center justify-start sm:justify-end gap-1 sm:gap-2">
                          <span className="text-sm truncate">{blackPlayer.name}</span>
                          {blackPlayer.titles.length > 0 && (
                            <TitleBadges
                              tournament={tournament}
                              titles={blackPlayer.titles}
                              size="sm"
                              className="justify-end"
                            />
                          )}
                          {upset && (pairing.result === "0-1" || pairing.result === "0F-1F") && (
                            <span className="text-orange-500 text-xs" title="Upset">⚡</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums flex items-center justify-start sm:justify-end gap-1">
                          <span>{getPlayerPointsAtRoundStart(pairing.blackPlayerId, selectedRound)} pts |</span>
                          <span>{getPlayerRatingAtRoundStart(pairing.blackPlayerId, selectedRound)}</span>
                          {(() => {
                            const changes = getRatingChange(pairing, selectedRound);
                            if (changes.black !== null) {
                              const sign = changes.black >= 0 ? "+" : "";
                              const colorClass = changes.black > 0 ? "text-green-600" : changes.black < 0 ? "text-red-500" : "text-muted-foreground";
                              return <span className={colorClass}>({sign}{changes.black})</span>;
                            }
                            return null;
                          })()}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center justify-end border-t border-border/60 pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-2 sm:ml-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleSwapColors(selectedRound.id, pairing.id)}
                            disabled={!pairing.blackPlayerId}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />
                            Swap Colors
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openSwapDialog(selectedRound.id, pairing.id)}
                            disabled={selectedRound.pairings.length < 2}
                          >
                            <Shuffle className="h-3.5 w-3.5 mr-2" />
                            Swap Opponents
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleMovePairing(selectedRound.id, pairing.id, "up")}
                            disabled={isFirst}
                          >
                            <ArrowUp className="h-3.5 w-3.5 mr-2" />
                            Move Up
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleMovePairing(selectedRound.id, pairing.id, "down")}
                            disabled={isLast}
                          >
                            <ArrowDown className="h-3.5 w-3.5 mr-2" />
                            Move Down
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setPairingToDelete({ roundId: selectedRound.id, pairingId: pairing.id })}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete Pairing
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Compact Stats */}
          {(() => {
            const stats = calculateRoundStatistics(selectedRound);
            if (stats.totalGames === 0) return null;

            return (
              <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground py-2">
                <span>{stats.totalGames} games</span>
                {stats.upsets > 0 && (
                  <span className="text-orange-500">{stats.upsets} upset{stats.upsets !== 1 && 's'}</span>
                )}
                {stats.draws > 0 && (
                  <span className="text-yellow-600">{stats.draws} draw{stats.draws !== 1 && 's'}</span>
                )}
                {stats.forfeits > 0 && (
                  <span className="text-gray-500">{stats.forfeits} forfeit{stats.forfeits !== 1 && 's'}</span>
                )}
              </div>
            );
          })()}
        </div>
      )
      }

      {/* Dialogs */}
      <AlertDialog open={showDeleteRoundDialog} onOpenChange={setShowDeleteRoundDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Round</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the most recent round? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRound} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pairingToDelete} onOpenChange={(open) => { if (!open) setPairingToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pairing</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deletePairingLabel}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeletePairing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!swapContext} onOpenChange={(open) => { if (!open) closeSwapDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Swap Opponents</DialogTitle>
            <DialogDescription>
              Swap opponents for {swapSourceLabel}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Swap With</Label>
              <Select value={swapTargetPairingId} onValueChange={setSwapTargetPairingId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={swapCandidates.length > 0 ? "Select pairing" : "No other pairings"} />
                </SelectTrigger>
                <SelectContent>
                  {swapCandidates.map((pairing) => {
                    const pairingIndex = swapRound ? swapRound.pairings.findIndex(p => p.id === pairing.id) : -1;
                    return (
                      <SelectItem key={pairing.id} value={pairing.id}>
                        {pairingIndex >= 0 ? getPairingLabel(pairing, pairingIndex) : "Pairing"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Swap Side</Label>
              <Select value={swapSide} onValueChange={(value) => setSwapSide(value as "black" | "white")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="black">Swap Black players</SelectItem>
                  <SelectItem value="white">Swap White players</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">Results for both pairings will be cleared.</p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={closeSwapDialog}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSwapOpponents} disabled={!swapTargetPairingId || swapCandidates.length === 0}>
                Swap
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showManualPairingDialog} onOpenChange={setShowManualPairingDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Manual Pairing</DialogTitle>
            <DialogDescription>
              Add a pairing to Round {selectedRound?.roundNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">White</Label>
              <Select value={whitePlayerId} onValueChange={setWhitePlayerId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select player" />
                </SelectTrigger>
                <SelectContent>
                  {availablePlayers.map(player => (
                    <SelectItem key={player.id} value={player.id} disabled={!player.active}>
                      {player.name} {!player.active && "(inactive)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Black</Label>
              <Select value={blackPlayerId} onValueChange={setBlackPlayerId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select player" />
                </SelectTrigger>
                <SelectContent>
                  {availablePlayers.map(player => (
                    <SelectItem key={player.id} value={player.id} disabled={!player.active}>
                      {player.name} {!player.active && "(inactive)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowManualPairingDialog(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleManualPairing} disabled={!whitePlayerId}>
                Add Pairing
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
            <DialogDescription>{errorDialogMessage}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div >
  );
}
