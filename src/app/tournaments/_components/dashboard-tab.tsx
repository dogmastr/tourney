"use client";

import { useMemo, useState } from "react";
import { type Tournament, TIEBREAK_LABELS, DEFAULT_TIEBREAK_ORDER, type TiebreakType } from "@/features/tournaments/model";
import { Users, Eye, TrendingUp } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { calculateTiebreaks, compareTiebreaks, type TiebreakResult } from "@/features/tournaments/tiebreaks";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/shared/ui/data-table";
import { getCrosstableResultStyles, isUpset as checkIsUpset } from "@/features/tournaments/results";
import { TIEBREAK_SHORT_LABELS, CHART_COLORS, RATING_RANGES } from "@/features/tournaments/constants";
import { TitleBadges } from "./title-badges";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DashboardTabProps {
  tournament: Tournament;
  onTournamentUpdate: (tournament: Tournament) => void;
  readOnly?: boolean;
}

interface RoundResult {
  result: "W" | "L" | "D" | "B" | "-"; // Win, Loss, Draw, Bye, Not played
  opponentRank: number | null;
  isWhite: boolean;
  isForfeit: boolean;
}

interface PlayerStanding {
  playerId: string;
  rank: number;
  name: string;
  titles?: string[];
  rating: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  active: boolean;
  // Tiebreak values
  buchholzCut1: number;
  buchholz: number;
  sonnebornBerger: number;
  progressive: number;
  winsWithBlack: number;
  avgRatingCut1: number;
  // Round results for crosstable
  roundResults: RoundResult[];
}


export function DashboardTab({ tournament, readOnly }: DashboardTabProps) {
  // View toggle state
  const [showCrosstable, setShowCrosstable] = useState(true);
  const [showTiebreaks, setShowTiebreaks] = useState(true);

  // Calculate standings with full tiebreak support and round results
  const standings = useMemo(() => {
    const allPlayers = tournament.players;
    const playerStats: Map<string, PlayerStanding> = new Map();

    // Initialize player stats
    allPlayers.forEach(player => {
      const tiebreaks = calculateTiebreaks(tournament, player.id);

      playerStats.set(player.id, {
        playerId: player.id,
        rank: 0,
        name: player.name,
        titles: player.titles,
        rating: player.rating,
        points: player.points,
        wins: tiebreaks.wins,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
        active: player.active,
        buchholzCut1: tiebreaks.buchholzCut1,
        buchholz: tiebreaks.buchholz,
        sonnebornBerger: tiebreaks.sonnebornBerger,
        progressive: tiebreaks.progressive,
        winsWithBlack: tiebreaks.winsWithBlack,
        avgRatingCut1: tiebreaks.avgRatingCut1,
        roundResults: [],
      });
    });

    // Calculate games played, losses, draws from rounds
    tournament.rounds.forEach(round => {
      round.pairings.forEach(pairing => {
        if (!pairing.result || !pairing.blackPlayerId) return;

        const whiteStats = playerStats.get(pairing.whitePlayerId);
        const blackStats = playerStats.get(pairing.blackPlayerId);

        if (!whiteStats || !blackStats) return;

        whiteStats.gamesPlayed++;
        blackStats.gamesPlayed++;

        if (pairing.result === "1-0" || pairing.result === "1F-0F") {
          blackStats.losses++;
        } else if (pairing.result === "0-1" || pairing.result === "0F-1F") {
          whiteStats.losses++;
        } else if (pairing.result === "1/2-1/2") {
          whiteStats.draws++;
          blackStats.draws++;
        }
      });
    });

    // Sort using full tiebreak comparison
    const standingsArray = Array.from(playerStats.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;

      const aTiebreaks: TiebreakResult = {
        buchholzCut1: a.buchholzCut1,
        buchholz: a.buchholz,
        sonnebornBerger: a.sonnebornBerger,
        progressive: a.progressive,
        wins: a.wins,
        winsWithBlack: a.winsWithBlack,
        avgRatingCut1: a.avgRatingCut1,
      };
      const bTiebreaks: TiebreakResult = {
        buchholzCut1: b.buchholzCut1,
        buchholz: b.buchholz,
        sonnebornBerger: b.sonnebornBerger,
        progressive: b.progressive,
        wins: b.wins,
        winsWithBlack: b.winsWithBlack,
        avgRatingCut1: b.avgRatingCut1,
      };

      return compareTiebreaks(aTiebreaks, bTiebreaks, tournament, a.playerId, b.playerId);
    });

    // Assign ranks
    standingsArray.forEach((standing, index) => {
      if (index === 0) {
        standing.rank = 1;
      } else {
        const prev = standingsArray[index - 1];
        if (prev.points === standing.points &&
          prev.buchholzCut1 === standing.buchholzCut1 &&
          prev.buchholz === standing.buchholz &&
          prev.sonnebornBerger === standing.sonnebornBerger &&
          prev.progressive === standing.progressive &&
          prev.wins === standing.wins &&
          prev.winsWithBlack === standing.winsWithBlack &&
          prev.avgRatingCut1 === standing.avgRatingCut1) {
          standing.rank = prev.rank;
        } else {
          standing.rank = index + 1;
        }
      }
    });

    // Create a map of playerId to rank for crosstable
    const playerRankMap = new Map<string, number>();
    standingsArray.forEach(s => playerRankMap.set(s.playerId, s.rank));

    // Calculate round results for each player
    standingsArray.forEach(standing => {
      const results: RoundResult[] = [];

      tournament.rounds.forEach(round => {
        let foundResult: RoundResult = { result: "-", opponentRank: null, isWhite: false, isForfeit: false };

        for (const pairing of round.pairings) {
          const isWhite = pairing.whitePlayerId === standing.playerId;
          const isBlack = pairing.blackPlayerId === standing.playerId;

          if (!isWhite && !isBlack) continue;

          // Bye
          if (!pairing.blackPlayerId && isWhite) {
            foundResult = { result: "B", opponentRank: null, isWhite: true, isForfeit: false };
            break;
          }

          if (!pairing.result) {
            foundResult = { result: "-", opponentRank: null, isWhite, isForfeit: false };
            break;
          }

          const opponentId = isWhite ? pairing.blackPlayerId : pairing.whitePlayerId;
          const opponentRank = opponentId ? playerRankMap.get(opponentId) || 0 : null;
          const isForfeit = pairing.result.includes("F");

          let result: "W" | "L" | "D" = "D";
          if (pairing.result === "1-0" || pairing.result === "1F-0F") {
            result = isWhite ? "W" : "L";
          } else if (pairing.result === "0-1" || pairing.result === "0F-1F") {
            result = isBlack ? "W" : "L";
          } else if (pairing.result === "0F-0F") {
            result = "L"; // Both forfeits count as loss
          }

          foundResult = { result, opponentRank, isWhite, isForfeit };
          break;
        }

        results.push(foundResult);
      });

      standing.roundResults = results;
    });

    return standingsArray;
  }, [tournament]);

  // Get the tiebreaks to display (all configured)
  const displayTiebreaks = useMemo(() => {
    return tournament.tiebreakOrder || DEFAULT_TIEBREAK_ORDER;
  }, [tournament.tiebreakOrder]);

  // Helper to get tiebreak value
  const getTiebreakValue = (standing: PlayerStanding, tb: TiebreakType): number => {
    const valueMap: Record<string, number> = {
      buchholzCut1: standing.buchholzCut1,
      buchholz: standing.buchholz,
      sonnebornBerger: standing.sonnebornBerger,
      progressive: standing.progressive,
      wins: standing.wins,
      winsWithBlack: standing.winsWithBlack,
      avgRatingCut1: standing.avgRatingCut1,
    };
    return valueMap[tb] ?? 0;
  };

  // Generate columns for the standings DataTable
  const standingsColumns = useMemo((): ColumnDef<PlayerStanding>[] => {
    const columns: ColumnDef<PlayerStanding>[] = [
      // Rank column
      {
        accessorKey: "rank",
        header: "#",
        cell: ({ row }) => {
          const rank = row.original.rank;
          const isTopThree = rank <= 3 && row.original.active;

          if (isTopThree) {
            const colorClass = rank === 1
              ? "text-yellow-600"
              : rank === 2
                ? "text-gray-500"
                : "text-orange-600";
            return (
              <span className={`text-xs font-semibold tabular-nums ${colorClass}`}>
                {rank}
              </span>
            );
          }
          return (
            <span className="text-xs text-muted-foreground tabular-nums">{rank}</span>
          );
        },
        size: 40,
      },
      // Player name and titles
      {
        accessorKey: "name",
        header: "Player",
        cell: ({ row }) => {
          const standing = row.original;
          return (
            <div className={`flex items-center gap-1.5 whitespace-nowrap w-max ${!standing.active ? "opacity-50" : ""}`}>
              <span className="text-sm">{standing.name}</span>
              <TitleBadges
                tournament={tournament}
                titles={standing.titles}
                maxVisible={3}
                size="sm"
                className="flex-shrink-0"
              />
            </div>
          );
        },
        minSize: 150,
      },
      // Rating
      {
        accessorKey: "rating",
        header: "Rtg",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground/70">{row.original.rating}</span>
        ),
        size: 50,
      },
      // Points
      {
        accessorKey: "points",
        header: "Pts",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{row.original.points}</span>
        ),
        size: 45,
      },
    ];

    // Add round columns for crosstable (if enabled)
    if (showCrosstable) {
      tournament.rounds.forEach((round, roundIndex) => {
        columns.push({
          id: `round-${round.roundNumber}`,
          header: () => <span className="text-xs">R{round.roundNumber}</span>,
          cell: ({ row }) => {
            const result = row.original.roundResults[roundIndex];
            if (!result) return <span className="text-muted-foreground">-</span>;

            // Use shared utility for color styling
            const { colorClass, bgClass } = getCrosstableResultStyles(result.result);

            // Format: result + color indicator (W/B) + opponent rank
            let displayText = "";
            if (result.result === "B") {
              displayText = "bye";
            } else if (result.result === "-") {
              displayText = "-";
            } else {
              const score = result.result === "W" ? "1" : result.result === "L" ? "0" : "1/2";
              const colorIndicator = result.isWhite ? "w" : "b";
              displayText = `${score}${colorIndicator}${result.opponentRank}`;
            }

            return (
              <span
                className={`text-[11px] font-mono px-1 py-0.5 rounded ${colorClass} ${bgClass} ${result.isForfeit ? "line-through" : ""}`}
                title={result.isForfeit ? "Forfeit" : undefined}
              >
                {displayText}
              </span>
            );
          },
          size: 50,
        });
      });
    }

    // Add tiebreak columns (if enabled)
    if (showTiebreaks) {
      displayTiebreaks.forEach(tb => {
        columns.push({
          id: `tb-${tb}`,
          header: () => (
            <span className="text-xs" title={TIEBREAK_LABELS[tb]}>
              {TIEBREAK_SHORT_LABELS[tb]}
            </span>
          ),
          cell: ({ row }) => {
            const value = getTiebreakValue(row.original, tb);
            return (
              <span className="text-xs tabular-nums text-muted-foreground">
                {Number.isInteger(value) ? value : value.toFixed(1)}
              </span>
            );
          },
          size: 50,
        });
      });
    }

    return columns;
  }, [tournament, displayTiebreaks, showCrosstable, showTiebreaks]);

  // Tournament stats
  const tournamentStats = useMemo(() => {
    const activePlayers = tournament.players.filter(p => p.active);
    const completedRounds = tournament.rounds.filter(r => r.completed).length;
    let totalGames = 0, totalUpsets = 0, totalDraws = 0;

    tournament.rounds.forEach(round => {
      round.pairings.forEach(pairing => {
        if (!pairing.result || !pairing.blackPlayerId) return;
        totalGames++;

        const whitePlayer = tournament.players.find(p => p.id === pairing.whitePlayerId);
        const blackPlayer = tournament.players.find(p => p.id === pairing.blackPlayerId);

        if (whitePlayer && blackPlayer) {
          // Use shared isUpset utility
          if (checkIsUpset(pairing.result, whitePlayer.rating, blackPlayer.rating)) {
            totalUpsets++;
          }
          if (pairing.result === "1/2-1/2") totalDraws++;
        }
      });
    });

    return {
      totalPlayers: activePlayers.length,
      completedRounds,
      totalRounds: tournament.rounds.length,
      totalGames,
      totalUpsets,
      totalDraws,
    };
  }, [tournament]);

  // Points progression data
  const pointsProgressionData = useMemo(() => {
    const topPlayers = standings.slice(0, 8);
    if (topPlayers.length === 0) return [];

    const data: Record<string, any>[] = [];
    const startData: Record<string, any> = { round: "Start" };
    topPlayers.forEach(player => { startData[player.name] = 0; });
    data.push(startData);

    if (tournament.rounds.length === 0) return data;

    topPlayers.forEach(player => {
      let currentPoints = 0;
      tournament.rounds.forEach(round => {
        round.pairings.forEach(pairing => {
          if (!pairing.result) return;
          const isWhite = pairing.whitePlayerId === player.playerId;
          const isBlack = pairing.blackPlayerId === player.playerId;

          if (isWhite || isBlack) {
            if (pairing.result === "1-0" || pairing.result === "1F-0F") {
              currentPoints += isWhite ? 1 : 0;
            } else if (pairing.result === "0-1" || pairing.result === "0F-1F") {
              currentPoints += isBlack ? 1 : 0;
            } else if (pairing.result === "1/2-1/2") {
              currentPoints += 0.5;
            }
          } else if (!pairing.blackPlayerId && isWhite) {
            currentPoints += tournament.byeValue;
          }
        });

        const roundKey = `R${round.roundNumber}`;
        let roundData = data.find(d => d.round === roundKey);
        if (!roundData) {
          roundData = { round: roundKey };
          topPlayers.forEach(p => { roundData![p.name] = 0; });
          data.push(roundData);
        }
        roundData[player.name] = currentPoints;
      });
    });

    return data;
  }, [tournament, standings]);

  // Rating distribution - use shared constant for ranges
  const ratingDistributionData = useMemo(() => {
    const ranges = RATING_RANGES.map(r => ({ ...r, count: 0 }));

    tournament.players.forEach(player => {
      const range = ranges.find(r => player.rating >= r.min && player.rating <= r.max);
      if (range) range.count++;
    });

    return ranges.filter(r => r.count > 0);
  }, [tournament]);


  return (
    <div className="space-y-4">
      {/* Compact Stats Bar */}
      <div className="bg-card border rounded-lg px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          {tournament.rated && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              Rated
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Players</span>
            <span className="font-medium tabular-nums">{tournamentStats.totalPlayers}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Rounds</span>
            <span className="font-medium tabular-nums">{tournamentStats.completedRounds}/{tournamentStats.totalRounds}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Games</span>
            <span className="font-medium tabular-nums">{tournamentStats.totalGames}</span>
          </div>
          {tournamentStats.totalUpsets > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">Upsets</span>
              <span className="font-medium tabular-nums text-orange-500">{tournamentStats.totalUpsets}</span>
            </div>
          )}
          {tournamentStats.totalDraws > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">Draws</span>
              <span className="font-medium tabular-nums">{tournamentStats.totalDraws}</span>
            </div>
          )}
        </div>
      </div>

      {/* Standings Table with Crosstable */}
      <div className="bg-card border rounded-lg">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b">
          <span className="text-sm font-medium">Standings</span>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                  <Eye className="h-3.5 w-3.5" />
                  View
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={showCrosstable}
                  onCheckedChange={setShowCrosstable}
                >
                  Ranking Crosstable
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showTiebreaks}
                  onCheckedChange={setShowTiebreaks}
                >
                  Tiebreaks
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {standings.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No players yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <DataTable
              columns={standingsColumns}
              data={standings}
              getRowClassName={(row) => row.original.active ? "" : "opacity-50"}
              hideRowSelection
            />
          </div>
        )}
      </div>

      {/* Charts - always show */}
      {standings.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Points Progression */}
          <div className="bg-card border rounded-lg">
            <div className="px-4 py-3 border-b">
              <div className="font-medium text-sm">Points Progression</div>
              <div className="text-xs text-muted-foreground">Top 8 players over rounds</div>
            </div>
            <div className="p-4">
              {pointsProgressionData.length > 1 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={pointsProgressionData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="round" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    {standings.slice(0, 8).map((player, index) => (
                      <Line
                        key={player.playerId}
                        type="monotone"
                        dataKey={player.name}
                        stroke={CHART_COLORS[index % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        opacity={player.active ? 1 : 0.5}
                        strokeDasharray={player.active ? undefined : "5 5"}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Not enough data</p>
                </div>
              )}
            </div>
          </div>

          {/* Rating Distribution */}
          <div className="bg-card border rounded-lg">
            <div className="px-4 py-3 border-b">
              <div className="font-medium text-sm">Rating Distribution</div>
              <div className="text-xs text-muted-foreground">Players by rating range</div>
            </div>
            <div className="p-4">
              {ratingDistributionData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={ratingDistributionData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="range" className="text-xs" angle={-45} textAnchor="end" height={60} />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {ratingDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No players</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
