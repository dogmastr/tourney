"use client";

/**
 * useTournamentActions Hook
 * 
 * Provides tournament mutation operations that work with in-memory tournament
 * objects and sync to DynamoDB via the onTournamentUpdate callback.
 * 
 * Includes validation, resource limits, and rate limiting.
 */

import { useCallback } from "react";
import { type Tournament, type Player, type TiebreakType, type Round, type Pairing, type CustomTitle } from "@/features/tournaments/model";
import { generateFIDEDutchPairings, generateRoundRobinPairings } from "@/features/tournaments/pairing";
import {
    validatePlayerInput,
    validatePlayerName,
    validateRating,
    validateFideId,
    validatePlayerTitles,
    validateCustomTitleName,
    validateHexColor,
    validateTotalRounds,
    validateByeValue,
    validateRoundRobinConstraints
} from "@/features/tournaments/validation";
import { sanitizeString, sanitizeTextField } from "@/shared/validation";
import { getRoundRobinRequiredRounds } from "@shared/round-robin";
import {
    LIMITS,
    LIMIT_MESSAGES,
    canAddPlayer,
    canCreateRound,
    canAddCustomTitle
} from "@/features/tournaments/limits";
import { checkRateLimit } from "@/shared/rate-limiter";
import { calculatePairingRatingUpdates } from "@/features/tournaments/ratings";

interface UseTournamentActionsOptions {
    /** Current tournament data */
    tournament: Tournament;
    /** Callback to update tournament state (triggers cloud sync) */
    onTournamentUpdate: (tournament: Tournament) => void;
}

/**
 * Hook that provides tournament actions working with in-memory state.
 * All changes are synced to DynamoDB via onTournamentUpdate.
 * 
 * Includes validation, resource limits, and rate limiting.
 */
export function useTournamentActions({ tournament, onTournamentUpdate }: UseTournamentActionsOptions) {
    const getByeResult = (byeValue: number): Pairing["result"] => {
        if (byeValue === 1) return "1-0";
        if (byeValue === 0) return "0-1";
        return "1/2-1/2";
    };

    const swapResultForColorChange = (result: Pairing["result"]): Pairing["result"] => {
        if (!result) return result;
        switch (result) {
            case "1-0":
                return "0-1";
            case "0-1":
                return "1-0";
            case "1F-0F":
                return "0F-1F";
            case "0F-1F":
                return "1F-0F";
            default:
                return result;
        }
    };

    const getLastCountedRoundIndex = (rounds: Round[]): number => {
        if (rounds.length === 0) return -1;
        const firstIncompleteIndex = rounds.findIndex(round => !round.completed);
        if (firstIncompleteIndex === -1) return rounds.length - 1;
        return firstIncompleteIndex;
    };

    const recalculatePointsAndRoundStarts = (
        rounds: Round[],
        players: Player[],
        byeValue: number
    ): { updatedPlayers: Player[]; updatedRounds: Round[] } => {
        const updatedPlayers = players.map(p => ({ ...p, points: 0 }));
        if (rounds.length === 0) {
            return { updatedPlayers, updatedRounds: [] };
        }

        const lastCountedRoundIndex = getLastCountedRoundIndex(rounds);
        const updatedRounds: Round[] = [];

        for (let i = 0; i < rounds.length; i += 1) {
            const round = rounds[i];
            const playerPointsAtStart: Record<string, number> = {};
            updatedPlayers.forEach(player => {
                playerPointsAtStart[player.id] = player.points;
            });

            for (const pairing of round.pairings) {
                if (pairing.blackPlayerId) {
                    if (!pairing.result) continue;

                    const whiteIdx = updatedPlayers.findIndex(p => p.id === pairing.whitePlayerId);
                    const blackIdx = updatedPlayers.findIndex(p => p.id === pairing.blackPlayerId);

                    if (whiteIdx >= 0 && blackIdx >= 0) {
                        if (pairing.result === "1-0" || pairing.result === "1F-0F") {
                            updatedPlayers[whiteIdx].points += 1;
                        } else if (pairing.result === "0-1" || pairing.result === "0F-1F") {
                            updatedPlayers[blackIdx].points += 1;
                        } else if (pairing.result === "1/2-1/2") {
                            updatedPlayers[whiteIdx].points += 0.5;
                            updatedPlayers[blackIdx].points += 0.5;
                        }
                    }
                } else {
                    const whiteIdx = updatedPlayers.findIndex(p => p.id === pairing.whitePlayerId);
                    const shouldCountBye = pairing.result !== null && pairing.result !== undefined;
                    if (whiteIdx >= 0 && (shouldCountBye || i <= lastCountedRoundIndex)) {
                        updatedPlayers[whiteIdx].points += byeValue;
                    }
                }
            }

            updatedRounds.push({ ...round, playerPointsAtStart });
        }

        return { updatedPlayers, updatedRounds };
    };

    const buildRoundRobinRounds = (baseTournament: Tournament): Round[] => {
        if (baseTournament.totalRounds <= 0) return [];
        const playerPointsAtStart: Record<string, number> = {};
        baseTournament.players.forEach(player => {
            playerPointsAtStart[player.id] = player.points;
        });

        const rounds: Round[] = [];
        for (let i = 0; i < baseTournament.totalRounds; i += 1) {
            rounds.push({
                id: crypto.randomUUID(),
                roundNumber: i + 1,
                pairings: generateRoundRobinPairings(baseTournament, i),
                completed: false,
                playerPointsAtStart: { ...playerPointsAtStart },
            });
        }

        return rounds;
    };

    const assertRoundRobinPlayerLimit = (players: Player[]) => {
        if (tournament.system !== "round-robin") return;
        if (players.length > LIMITS.MAX_ROUND_ROBIN_PLAYERS) {
            throw new Error(LIMIT_MESSAGES.ROUND_ROBIN_PLAYER_LIMIT_REACHED);
        }
        const activePlayerCount = players.filter(p => p.active).length;
        const validation = validateRoundRobinConstraints(tournament.totalRounds, activePlayerCount, { checkRounds: false });
        if (!validation.valid) {
            throw new Error(validation.error || "Invalid round-robin settings.");
        }
    };

    const assertRoundRobinRoundCount = (players: Player[]) => {
        if (tournament.system !== "round-robin" || tournament.rounds.length === 0) return;
        const activePlayerCount = players.filter(p => p.active).length;
        const requiredRounds = getRoundRobinRequiredRounds(activePlayerCount);
        if (tournament.rounds.length > requiredRounds) {
            throw new Error("Delete existing rounds before reducing active players in a round-robin tournament.");
        }
    };

    const generateRoundRobinSchedule = useCallback(() => {
        checkRateLimit();

        if (tournament.system !== "round-robin") {
            throw new Error("Round-robin schedules are only available for round-robin tournaments.");
        }
        if (tournament.rounds.length > 0) {
            throw new Error("Delete existing rounds before generating a new round-robin schedule.");
        }
        if (tournament.players.length > LIMITS.MAX_ROUND_ROBIN_PLAYERS) {
            throw new Error(LIMIT_MESSAGES.ROUND_ROBIN_PLAYER_LIMIT_REACHED);
        }

        const activePlayers = tournament.players.filter(p => p.active);
        if (activePlayers.length < 2) {
            throw new Error("You need at least 2 active players to generate a schedule");
        }

        const requiredRounds = getRoundRobinRequiredRounds(activePlayers.length);
        const validation = validateRoundRobinConstraints(requiredRounds, activePlayers.length, { checkRounds: true });
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const nextTournament = { ...tournament, totalRounds: requiredRounds };
        const rounds = buildRoundRobinRounds(nextTournament);
        const { updatedPlayers, updatedRounds } = recalculatePointsAndRoundStarts(
            rounds,
            nextTournament.players,
            nextTournament.byeValue
        );

        const updated = {
            ...nextTournament,
            players: updatedPlayers,
            rounds: updatedRounds,
        };
        onTournamentUpdate(updated);
        return updatedRounds;
    }, [tournament, onTournamentUpdate]);

    // ============================================================================
    // Player Actions
    // ============================================================================

    /** Add a new player to the tournament */
    const addPlayer = useCallback(
        (player: Omit<Player, "id" | "createdAt" | "points" | "active">) => {
            // Check rate limit
            checkRateLimit();

            // Check player limit
            if (!canAddPlayer(tournament.players.length)) {
                throw new Error(LIMIT_MESSAGES.PLAYER_LIMIT_REACHED);
            }

            // Validate player input
            const validation = validatePlayerInput({
                name: player.name,
                rating: player.rating,
                fideId: player.fideId,
                titles: player.titles,
            });
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            const newPlayer: Player = {
                id: crypto.randomUUID(),
                name: sanitizeString(player.name),
                rating: player.rating,
                fideId: player.fideId,
                titles: player.titles || [],
                points: 0,
                active: true,
                createdAt: new Date().toISOString(),
            };

            const nextPlayers = [...tournament.players, newPlayer];
            assertRoundRobinPlayerLimit(nextPlayers);

            const updated = {
                ...tournament,
                players: nextPlayers,
            };
            onTournamentUpdate(updated);
            return newPlayer;
        },
        [tournament, onTournamentUpdate]
    );

    /** Remove a player from the tournament */
    const removePlayer = useCallback(
        (playerId: string) => {
            checkRateLimit();

            const nextPlayers = tournament.players.filter(p => p.id !== playerId);
            assertRoundRobinRoundCount(nextPlayers);

            const updated = {
                ...tournament,
                players: nextPlayers,
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    /** Update player details */
    const updatePlayerDetails = useCallback(
        (playerId: string, updates: { name?: string; rating?: number; titles?: string[]; fideId?: number | null }) => {
            checkRateLimit();

            // Validate each field if provided
            if (updates.name !== undefined) {
                const nameValidation = validatePlayerName(updates.name);
                if (!nameValidation.valid) throw new Error(nameValidation.error);
            }
            if (updates.rating !== undefined) {
                const ratingValidation = validateRating(updates.rating);
                if (!ratingValidation.valid) throw new Error(ratingValidation.error);
            }
            if ('fideId' in updates) {
                const fideValidation = validateFideId(updates.fideId);
                if (!fideValidation.valid) throw new Error(fideValidation.error);
            }
            if (updates.titles !== undefined) {
                const titlesValidation = validatePlayerTitles(updates.titles);
                if (!titlesValidation.valid) throw new Error(titlesValidation.error);
            }

            const updated = {
                ...tournament,
                players: tournament.players.map(p => {
                    if (p.id !== playerId) return p;
                    const updatedPlayer = { ...p };
                    if (updates.name !== undefined) updatedPlayer.name = sanitizeString(updates.name);
                    if (updates.rating !== undefined) updatedPlayer.rating = updates.rating;
                    if (updates.titles !== undefined) updatedPlayer.titles = updates.titles;
                    if ('fideId' in updates) {
                        updatedPlayer.fideId = updates.fideId === null ? undefined : updates.fideId;
                    }
                    return updatedPlayer;
                }),
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    /** Deactivate a player (soft delete) */
    const deactivatePlayerAction = useCallback(
        (playerId: string) => {
            checkRateLimit();

            const nextPlayers = tournament.players.map(p =>
                p.id === playerId ? { ...p, active: false } : p
            );
            assertRoundRobinRoundCount(nextPlayers);

            const updated = {
                ...tournament,
                players: nextPlayers,
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    /** Reactivate a deactivated player */
    const activatePlayerAction = useCallback(
        (playerId: string) => {
            checkRateLimit();

            const nextPlayers = tournament.players.map(p =>
                p.id === playerId ? { ...p, active: true } : p
            );
            assertRoundRobinPlayerLimit(nextPlayers);

            const updated = {
                ...tournament,
                players: nextPlayers,
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    // ============================================================================
    // Round Actions
    // ============================================================================

    /** Create a new round with automatic pairings */
    const createNewRound = useCallback(() => {
        checkRateLimit();

        if (tournament.system === "round-robin") {
            throw new Error("Round-robin schedules must be generated from the schedule button.");
        }

        // Check round limit
        if (!canCreateRound(tournament.rounds.length)) {
            throw new Error(LIMIT_MESSAGES.ROUND_LIMIT_REACHED);
        }

        const activePlayers = tournament.players.filter(p => p.active);
        if (activePlayers.length < 2) {
            throw new Error("You need at least 2 active players to create a round");
        }

        if (tournament.rounds.length > 0) {
            const lastRound = tournament.rounds[tournament.rounds.length - 1];
            if (!lastRound.completed) {
                throw new Error("Previous round must be completed before creating a new round");
            }
        }

        // Store player points and ratings at the start of this round
        const playerPointsAtStart: Record<string, number> = {};
        const playerRatingsAtStart: Record<string, number> = {};
        tournament.players.forEach(player => {
            playerPointsAtStart[player.id] = player.points;
            playerRatingsAtStart[player.id] = player.rating;
        });

        // Generate pairings
        const pairings = tournament.system === "round-robin"
            ? generateRoundRobinPairings(tournament)
            : generateFIDEDutchPairings(tournament);

        // Process bye results
        const updatedPlayers = [...tournament.players];
        for (const pairing of pairings) {
            if (pairing.blackPlayerId === null) {
                pairing.result = getByeResult(tournament.byeValue);

                const playerIdx = updatedPlayers.findIndex(p => p.id === pairing.whitePlayerId);
                if (playerIdx >= 0) {
                    updatedPlayers[playerIdx] = {
                        ...updatedPlayers[playerIdx],
                        points: updatedPlayers[playerIdx].points + tournament.byeValue,
                    };
                }
            }
        }

        const newRound: Round = {
            id: crypto.randomUUID(),
            roundNumber: tournament.rounds.length + 1,
            pairings,
            completed: false,
            playerPointsAtStart,
            playerRatingsAtStart,
        };

        const updated = {
            ...tournament,
            players: updatedPlayers,
            rounds: [...tournament.rounds, newRound],
        };
        onTournamentUpdate(updated);
        return newRound;
    }, [tournament, onTournamentUpdate]);

    /** Delete the most recent round */
    const deleteRound = useCallback(() => {
        checkRateLimit();

        if (tournament.rounds.length === 0) {
            throw new Error("No rounds to delete");
        }

        // Get the round being deleted to restore ratings
        const deletedRound = tournament.rounds[tournament.rounds.length - 1];
        const updatedRounds = tournament.rounds.slice(0, -1);

        // Recalculate points and restore ratings
        const resetPlayers = tournament.players.map(p => {
            // Restore rating from the deleted round's start state
            const ratingAtStart = deletedRound.playerRatingsAtStart?.[p.id];
            return {
                ...p,
                points: 0,
                rating: ratingAtStart !== undefined ? ratingAtStart : p.rating,
            };
        });
        const { updatedPlayers, updatedRounds: recalculatedRounds } = recalculatePointsAndRoundStarts(
            updatedRounds,
            resetPlayers,
            tournament.byeValue
        );

        const updated = {
            ...tournament,
            players: updatedPlayers,
            rounds: recalculatedRounds,
        };
        onTournamentUpdate(updated);
    }, [tournament, onTournamentUpdate]);

    /** Update the result of a pairing */
    const updateResult = useCallback(
        (
            roundId: string,
            pairingId: string,
            result: "1-0" | "0-1" | "1/2-1/2" | "1F-0F" | "0F-1F" | "0F-0F" | null
        ) => {
            checkRateLimit();

            const updatedRounds = tournament.rounds.map(round => {
                if (round.id !== roundId) return round;

                // Check if round is completed and results can't be changed
                if (round.completed) {
                    throw new Error("Cannot change results for completed rounds");
                }

                return {
                    ...round,
                    pairings: round.pairings.map(p => {
                        if (p.id !== pairingId) return p;

                        let finalResult = result;
                        // Handle bye result format
                        if (!p.blackPlayerId && result) {
                            if (tournament.byeValue === 1) finalResult = "1-0";
                            else if (tournament.byeValue === 0) finalResult = "0-1";
                            else finalResult = "1/2-1/2";
                        }

                        return { ...p, result: finalResult };
                    }),
                };
            });

            const { updatedPlayers, updatedRounds: recalculatedRounds } = recalculatePointsAndRoundStarts(
                updatedRounds,
                tournament.players,
                tournament.byeValue
            );

            const updated = {
                ...tournament,
                players: updatedPlayers,
                rounds: recalculatedRounds,
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    /** Mark a round as complete */
    const completeRound = useCallback(
        (roundId: string) => {
            checkRateLimit();

            const roundsWithByes = tournament.rounds.map(r => {
                if (r.id !== roundId) return r;
                const pairings = r.pairings.map(pairing => {
                    if (!pairing.blackPlayerId && (pairing.result === null || pairing.result === undefined)) {
                        return { ...pairing, result: getByeResult(tournament.byeValue) };
                    }
                    return pairing;
                });
                return { ...r, pairings };
            });

            const round = roundsWithByes.find(r => r.id === roundId);
            if (!round) throw new Error("Round not found");

            const allResultsEntered = round.pairings.every(p => p.result !== null && p.result !== undefined);
            if (!allResultsEntered) {
                throw new Error("All results must be entered before marking round as complete");
            }

            const roundRated = tournament.rated;

            // Apply rating changes for rated rounds
            let updatedPlayers = [...tournament.players];
            const ratingsAtStart = round.playerRatingsAtStart ?? updatedPlayers.reduce<Record<string, number>>((acc, player) => {
                acc[player.id] = player.rating;
                return acc;
            }, {});

            if (roundRated) {
                for (const pairing of round.pairings) {
                    if (!pairing.blackPlayerId) continue; // Skip byes

                    const whitePlayer = updatedPlayers.find(p => p.id === pairing.whitePlayerId);
                    const blackPlayer = updatedPlayers.find(p => p.id === pairing.blackPlayerId);

                    if (whitePlayer && blackPlayer && pairing.result) {
                        const updates = calculatePairingRatingUpdates(
                            whitePlayer.rating,
                            blackPlayer.rating,
                            whitePlayer.id,
                            blackPlayer.id,
                            pairing.result
                        );

                        if (updates) {
                            // Store initial rating if not set (first rated round)
                            if (whitePlayer.initialRating === undefined) {
                                whitePlayer.initialRating = whitePlayer.rating;
                            }
                            if (blackPlayer.initialRating === undefined) {
                                blackPlayer.initialRating = blackPlayer.rating;
                            }

                            whitePlayer.rating = updates.white.newRating;
                            blackPlayer.rating = updates.black.newRating;
                        }
                    }
                }
            }

            const updated = {
                ...tournament,
                players: updatedPlayers,
                rounds: roundsWithByes.map(r =>
                    r.id === roundId
                        ? { ...r, completed: true, rated: roundRated, playerRatingsAtStart: r.playerRatingsAtStart ?? ratingsAtStart }
                        : r
                ),
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    /** Add a manual pairing to a round */
    const addPairing = useCallback(
        (roundId: string, whitePlayerId: string, blackPlayerId: string | null) => {
            checkRateLimit();

            const round = tournament.rounds.find(r => r.id === roundId);
            if (!round) throw new Error("Round not found");
            if (round.completed) throw new Error("Cannot add pairings to a completed round");

            const isPlayerUsed = (playerId: string) =>
                round.pairings.some(p => p.whitePlayerId === playerId || p.blackPlayerId === playerId);

            if (isPlayerUsed(whitePlayerId)) {
                throw new Error("Player is already paired in this round");
            }
            if (blackPlayerId && isPlayerUsed(blackPlayerId)) {
                throw new Error("Player is already paired in this round");
            }
            if (whitePlayerId === blackPlayerId) {
                throw new Error("A player cannot be paired against themselves");
            }

            const newPairing: Pairing = {
                id: crypto.randomUUID(),
                whitePlayerId,
                blackPlayerId,
                result: null,
            };

            // If it's a bye, assign result immediately
            if (!blackPlayerId) {
                newPairing.result = getByeResult(tournament.byeValue);
            }

            const updatedRounds = tournament.rounds.map(r =>
                r.id === roundId ? { ...r, pairings: [...r.pairings, newPairing] } : r
            );

            const { updatedPlayers, updatedRounds: recalculatedRounds } = recalculatePointsAndRoundStarts(
                updatedRounds,
                tournament.players,
                tournament.byeValue
            );

            const updated = {
                ...tournament,
                players: updatedPlayers,
                rounds: recalculatedRounds,
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    /** Delete a pairing from a round */
    const deletePairing = useCallback(
        (roundId: string, pairingId: string) => {
            checkRateLimit();

            const round = tournament.rounds.find(r => r.id === roundId);
            if (!round) throw new Error("Round not found");
            if (round.completed) throw new Error("Cannot modify pairings for completed rounds");

            if (!round.pairings.some(p => p.id === pairingId)) {
                throw new Error("Pairing not found");
            }

            const updatedRounds = tournament.rounds.map(r =>
                r.id === roundId ? { ...r, pairings: r.pairings.filter(p => p.id !== pairingId) } : r
            );

            const { updatedPlayers, updatedRounds: recalculatedRounds } = recalculatePointsAndRoundStarts(
                updatedRounds,
                tournament.players,
                tournament.byeValue
            );

            const updated = {
                ...tournament,
                players: updatedPlayers,
                rounds: recalculatedRounds,
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    /** Swap colors within a pairing */
    const swapPairingColors = useCallback(
        (roundId: string, pairingId: string) => {
            checkRateLimit();

            const round = tournament.rounds.find(r => r.id === roundId);
            if (!round) throw new Error("Round not found");
            if (round.completed) throw new Error("Cannot modify pairings for completed rounds");

            const pairing = round.pairings.find(p => p.id === pairingId);
            if (!pairing) throw new Error("Pairing not found");
            if (!pairing.blackPlayerId) {
                throw new Error("Cannot swap colors for a bye pairing");
            }

            const updatedRounds = tournament.rounds.map(r => {
                if (r.id !== roundId) return r;
                return {
                    ...r,
                    pairings: r.pairings.map(p => {
                        if (p.id !== pairingId) return p;
                        if (!p.blackPlayerId) return p;
                        return {
                            ...p,
                            whitePlayerId: p.blackPlayerId,
                            blackPlayerId: p.whitePlayerId,
                            result: swapResultForColorChange(p.result),
                        };
                    }),
                };
            });

            const { updatedPlayers, updatedRounds: recalculatedRounds } = recalculatePointsAndRoundStarts(
                updatedRounds,
                tournament.players,
                tournament.byeValue
            );

            const updated = {
                ...tournament,
                players: updatedPlayers,
                rounds: recalculatedRounds,
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    /** Swap opponents between two pairings */
    const swapPairingOpponents = useCallback(
        (roundId: string, pairingIdA: string, pairingIdB: string, swapSide: "black" | "white") => {
            checkRateLimit();

            if (pairingIdA === pairingIdB) {
                throw new Error("Select two different pairings");
            }

            const round = tournament.rounds.find(r => r.id === roundId);
            if (!round) throw new Error("Round not found");
            if (round.completed) throw new Error("Cannot modify pairings for completed rounds");

            const pairingA = round.pairings.find(p => p.id === pairingIdA);
            const pairingB = round.pairings.find(p => p.id === pairingIdB);
            if (!pairingA || !pairingB) throw new Error("Pairing not found");

            if (swapSide === "black") {
                if (pairingA.whitePlayerId === pairingB.blackPlayerId || pairingB.whitePlayerId === pairingA.blackPlayerId) {
                    throw new Error("Swap would pair a player against themselves");
                }
            } else {
                if (pairingA.blackPlayerId === pairingB.whitePlayerId || pairingB.blackPlayerId === pairingA.whitePlayerId) {
                    throw new Error("Swap would pair a player against themselves");
                }
            }

            const byeResult = getByeResult(tournament.byeValue);

            const updatedRounds = tournament.rounds.map(r => {
                if (r.id !== roundId) return r;
                return {
                    ...r,
                    pairings: r.pairings.map(p => {
                        if (p.id === pairingIdA) {
                            const updated = swapSide === "black"
                                ? { ...p, blackPlayerId: pairingB.blackPlayerId }
                                : { ...p, whitePlayerId: pairingB.whitePlayerId };
                            return { ...updated, result: updated.blackPlayerId ? null : byeResult };
                        }
                        if (p.id === pairingIdB) {
                            const updated = swapSide === "black"
                                ? { ...p, blackPlayerId: pairingA.blackPlayerId }
                                : { ...p, whitePlayerId: pairingA.whitePlayerId };
                            return { ...updated, result: updated.blackPlayerId ? null : byeResult };
                        }
                        return p;
                    }),
                };
            });

            const { updatedPlayers, updatedRounds: recalculatedRounds } = recalculatePointsAndRoundStarts(
                updatedRounds,
                tournament.players,
                tournament.byeValue
            );

            const updated = {
                ...tournament,
                players: updatedPlayers,
                rounds: recalculatedRounds,
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    /** Move a pairing up or down for table order */
    const movePairing = useCallback(
        (roundId: string, pairingId: string, direction: "up" | "down") => {
            checkRateLimit();

            const round = tournament.rounds.find(r => r.id === roundId);
            if (!round) throw new Error("Round not found");
            if (round.completed) throw new Error("Cannot modify pairings for completed rounds");

            const index = round.pairings.findIndex(p => p.id === pairingId);
            if (index === -1) throw new Error("Pairing not found");

            const targetIndex = direction === "up" ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= round.pairings.length) return;

            const updatedPairings = [...round.pairings];
            const [moved] = updatedPairings.splice(index, 1);
            updatedPairings.splice(targetIndex, 0, moved);

            const updatedRounds = tournament.rounds.map(r =>
                r.id === roundId ? { ...r, pairings: updatedPairings } : r
            );

            const updated = {
                ...tournament,
                rounds: updatedRounds,
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    // ============================================================================
    // Settings Actions
    // ============================================================================

    /** Update tournament settings */
    const updateSettings = useCallback(
        (settings: {
            byeValue?: number;
            rated?: boolean;
            totalRounds?: number;
            tiebreakOrder?: TiebreakType[];
            organizers?: string;
            federation?: string;
            tournamentDirector?: string;
            chiefArbiter?: string;
            timeControl?: string;
            startDate?: string;
            startTime?: string;
            endDate?: string;
            endTime?: string;
            location?: string;
        }) => {
            checkRateLimit();

            // Validate specific fields
            if (settings.byeValue !== undefined) {
                const validation = validateByeValue(settings.byeValue);
                if (!validation.valid) throw new Error(validation.error);
            }
            if (settings.totalRounds !== undefined) {
                const validation = validateTotalRounds(settings.totalRounds);
                if (!validation.valid) throw new Error(validation.error);
                if (settings.totalRounds < tournament.rounds.length) {
                    throw new Error(`Total rounds cannot be less than current round count (${tournament.rounds.length})`);
                }
                if (tournament.system === "round-robin") {
                    const activePlayerCount = tournament.players.filter(p => p.active).length;
                    const roundRobinValidation = validateRoundRobinConstraints(
                        settings.totalRounds,
                        activePlayerCount,
                        { checkRounds: tournament.rounds.length > 0 }
                    );
                    if (!roundRobinValidation.valid) throw new Error(roundRobinValidation.error);
                }
            }

            // Sanitize text fields
            const sanitizedSettings = { ...settings };
            if (settings.organizers !== undefined) {
                sanitizedSettings.organizers = sanitizeTextField(settings.organizers, LIMITS.MAX_ORGANIZER_LENGTH);
            }
            if (settings.federation !== undefined) {
                sanitizedSettings.federation = sanitizeTextField(settings.federation, LIMITS.MAX_LOCATION_LENGTH);
            }
            if (settings.tournamentDirector !== undefined) {
                sanitizedSettings.tournamentDirector = sanitizeTextField(settings.tournamentDirector, LIMITS.MAX_ARBITER_LENGTH);
            }
            if (settings.chiefArbiter !== undefined) {
                sanitizedSettings.chiefArbiter = sanitizeTextField(settings.chiefArbiter, LIMITS.MAX_ARBITER_LENGTH);
            }
            if (settings.timeControl !== undefined) {
                sanitizedSettings.timeControl = sanitizeTextField(settings.timeControl, LIMITS.MAX_TIME_CONTROL_LENGTH);
            }
            if (settings.location !== undefined) {
                sanitizedSettings.location = sanitizeTextField(settings.location, LIMITS.MAX_LOCATION_LENGTH);
            }

            const updatedRounds =
                settings.rated !== undefined && settings.rated !== tournament.rated
                    ? tournament.rounds.map(round => {
                        if (!round.completed || round.rated !== undefined) return round;
                        return { ...round, rated: tournament.rated };
                    })
                    : tournament.rounds;

            const updated = { ...tournament, ...sanitizedSettings, rounds: updatedRounds };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    /** Update tournament name */
    const updateName = useCallback(
        (name: string) => {
            checkRateLimit();

            const sanitized = sanitizeTextField(name, LIMITS.MAX_TOURNAMENT_NAME_LENGTH);
            if (sanitized.length < LIMITS.MIN_TOURNAMENT_NAME_LENGTH) {
                throw new Error("Tournament name is required");
            }

            const updated = { ...tournament, name: sanitized };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    // ============================================================================
    // Custom Title Actions
    // ============================================================================

    /** Add a new custom title */
    const addTitle = useCallback(
        (title: { name: string; color: string }) => {
            checkRateLimit();

            // Check title limit
            if (!canAddCustomTitle(tournament.customTitles?.length || 0)) {
                throw new Error(LIMIT_MESSAGES.TITLE_LIMIT_REACHED);
            }

            // Validate
            const nameValidation = validateCustomTitleName(title.name);
            if (!nameValidation.valid) throw new Error(nameValidation.error);

            const colorValidation = validateHexColor(title.color);
            if (!colorValidation.valid) throw new Error(colorValidation.error);

            const newTitle: CustomTitle = {
                id: crypto.randomUUID(),
                name: sanitizeString(title.name),
                color: title.color,
            };

            const updated = {
                ...tournament,
                customTitles: [...(tournament.customTitles || []), newTitle],
            };
            onTournamentUpdate(updated);
            return newTitle;
        },
        [tournament, onTournamentUpdate]
    );

    /** Update an existing custom title */
    const updateTitle = useCallback(
        (titleId: string, updates: { name?: string; color?: string }) => {
            checkRateLimit();

            // Validate if provided
            if (updates.name !== undefined) {
                const validation = validateCustomTitleName(updates.name);
                if (!validation.valid) throw new Error(validation.error);
            }
            if (updates.color !== undefined) {
                const validation = validateHexColor(updates.color);
                if (!validation.valid) throw new Error(validation.error);
            }

            const updated = {
                ...tournament,
                customTitles: (tournament.customTitles || []).map(t => {
                    if (t.id !== titleId) return t;
                    return {
                        ...t,
                        name: updates.name !== undefined ? sanitizeString(updates.name) : t.name,
                        color: updates.color !== undefined ? updates.color : t.color,
                    };
                }),
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    /** Remove a custom title */
    const removeTitle = useCallback(
        (titleId: string) => {
            checkRateLimit();

            const titleToRemove = (tournament.customTitles || []).find(t => t.id === titleId);
            if (!titleToRemove) return;

            const updated = {
                ...tournament,
                customTitles: (tournament.customTitles || []).filter(t => t.id !== titleId),
                // Remove title from all players
                players: tournament.players.map(p => ({
                    ...p,
                    titles: (p.titles || []).filter(t => t !== titleToRemove.name),
                })),
            };
            onTournamentUpdate(updated);
        },
        [tournament, onTournamentUpdate]
    );

    const applyTournamentUpdate = useCallback(
        (nextTournament: Tournament) => {
            if (nextTournament.players.length > LIMITS.MAX_PLAYERS_PER_TOURNAMENT) {
                throw new Error(LIMIT_MESSAGES.PLAYER_LIMIT_REACHED);
            }
            if (nextTournament.system === "round-robin") {
                if (nextTournament.players.length > LIMITS.MAX_ROUND_ROBIN_PLAYERS) {
                    throw new Error(LIMIT_MESSAGES.ROUND_ROBIN_PLAYER_LIMIT_REACHED);
                }
                const validation = validateRoundRobinConstraints(
                    nextTournament.totalRounds,
                    nextTournament.players.filter(p => p.active).length,
                    { checkRounds: false }
                );
                if (!validation.valid) {
                    throw new Error(validation.error || "Invalid round-robin settings.");
                }
            }
            onTournamentUpdate(nextTournament);
        },
        [onTournamentUpdate]
    );

    // Dummy refresh function for compatibility (no-op since we work with in-memory state)
    const refreshTournament = useCallback(() => true, []);

    return {
        // Player actions
        addPlayer,
        removePlayer,
        updatePlayerDetails,
        deactivatePlayer: deactivatePlayerAction,
        activatePlayer: activatePlayerAction,

        // Round actions
        createRound: createNewRound,
        generateRoundRobinSchedule,
        deleteRound,
        updateResult,
        completeRound,
        addPairing,
        deletePairing,
        swapPairingColors,
        swapPairingOpponents,
        movePairing,

        // Settings actions
        updateSettings,
        updateName,

        // Title actions
        addTitle,
        updateTitle,
        removeTitle,
        applyTournamentUpdate,

        // Utility (no-op for compatibility)
        refreshTournament,
    };
}


