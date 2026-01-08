"use client";

import { useState, useEffect } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Player, type Tournament } from "@/lib/tournament-store";
import { getTitlesStyles } from "@/lib/title-utils";

interface PlayerColumnHandlers {
    tournament: Tournament;
    onPlayerUpdate: (playerId: string, updates: Partial<Pick<Player, 'name' | 'rating' | 'titles' | 'fideId'>>) => void;
    onDeactivate: (playerId: string) => void;
    onActivate: (playerId: string) => void;
    onDelete: (playerId: string) => void;
    hasPlayedRounds: (playerId: string) => boolean;
    allTitles: { name: string }[];
    allPlayers: Player[];
    readOnly?: boolean;
}

// Editable name input that uses local state to prevent focus loss
function EditableNameInput({
    player,
    allPlayers,
    onPlayerUpdate,
    disabled,
}: {
    player: Player;
    allPlayers: Player[];
    onPlayerUpdate: (playerId: string, updates: Partial<Pick<Player, 'name'>>) => void;
    disabled: boolean;
}) {
    const [localName, setLocalName] = useState(player.name);
    const [error, setError] = useState<string | null>(null);

    // Sync local state when player.name changes externally
    useEffect(() => {
        setLocalName(player.name);
        setError(null);
    }, [player.name]);

    const handleBlur = () => {
        const trimmedName = localName.trim();
        if (!trimmedName) {
            setLocalName(player.name);
            setError(null);
            return;
        }

        // Check for duplicate names (case-insensitive, excluding current player)
        const isDuplicate = allPlayers.some(
            p => p.id !== player.id && p.name.toLowerCase() === trimmedName.toLowerCase()
        );

        if (isDuplicate) {
            setError("Name already exists");
            return;
        }

        if (trimmedName !== player.name) {
            onPlayerUpdate(player.id, { name: trimmedName });
        }
        setError(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.currentTarget.blur();
        } else if (e.key === "Escape") {
            setLocalName(player.name);
            setError(null);
            e.currentTarget.blur();
        }
    };

    return (
        <div className="relative">
            <Input
                value={localName}
                onChange={(e) => {
                    setLocalName(e.target.value);
                    setError(null);
                }}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className={`h-8 w-full min-w-[140px] border-transparent hover:border-input focus:border-input bg-transparent ${error ? "border-destructive focus:border-destructive" : ""}`}
                placeholder="Player name"
                disabled={disabled}
            />
            {error && (
                <span className="absolute -bottom-4 left-0 text-[10px] text-destructive">{error}</span>
            )}
        </div>
    );
}

// Editable rating input that uses local state to prevent focus loss
function EditableRatingInput({
    player,
    onPlayerUpdate,
}: {
    player: Player;
    onPlayerUpdate: (playerId: string, updates: Partial<Pick<Player, 'rating'>>) => void;
}) {
    const [localRating, setLocalRating] = useState(player.rating.toString());

    // Sync local state when player.rating changes externally
    useEffect(() => {
        setLocalRating(player.rating.toString());
    }, [player.rating]);

    const handleBlur = () => {
        const rating = parseInt(localRating, 10);
        if (isNaN(rating) || rating <= 0) {
            setLocalRating(player.rating.toString());
            return;
        }

        if (rating !== player.rating) {
            onPlayerUpdate(player.id, { rating });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.currentTarget.blur();
        } else if (e.key === "Escape") {
            setLocalRating(player.rating.toString());
            e.currentTarget.blur();
        }
    };

    return (
        <Input
            type="number"
            value={localRating}
            onChange={(e) => setLocalRating(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="h-8 w-20 text-right border-transparent hover:border-input focus:border-input bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            min={1}
        />
    );
}

// Editable FIDE ID input
function EditableFideIdInput({
    player,
    onPlayerUpdate,
}: {
    player: Player;
    onPlayerUpdate: (playerId: string, updates: Partial<Pick<Player, 'fideId'>>) => void;
}) {
    const [localFideId, setLocalFideId] = useState(player.fideId?.toString() || "");
    const [error, setError] = useState<string | null>(null);

    // Sync local state when player.fideId changes externally
    useEffect(() => {
        setLocalFideId(player.fideId?.toString() || "");
        setError(null);
    }, [player.fideId]);

    const handleBlur = () => {
        if (!localFideId.trim()) {
            // Clear the FIDE ID
            if (player.fideId !== undefined) {
                onPlayerUpdate(player.id, { fideId: undefined });
            }
            setError(null);
            return;
        }

        const fideId = parseInt(localFideId, 10);
        if (isNaN(fideId) || fideId <= 0 || !Number.isInteger(fideId)) {
            setError("Must be > 0");
            return;
        }

        if (fideId !== player.fideId) {
            onPlayerUpdate(player.id, { fideId });
        }
        setError(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.currentTarget.blur();
        } else if (e.key === "Escape") {
            setLocalFideId(player.fideId?.toString() || "");
            setError(null);
            e.currentTarget.blur();
        }
    };

    return (
        <div className="relative">
            <Input
                type="number"
                value={localFideId}
                onChange={(e) => {
                    setLocalFideId(e.target.value);
                    setError(null);
                }}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className={`h-8 w-24 text-right border-transparent hover:border-input focus:border-input bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${error ? "border-destructive focus:border-destructive" : ""}`}
                placeholder="—"
                min={1}
            />
            {error && (
                <span className="absolute -bottom-4 left-0 text-[10px] text-destructive">{error}</span>
            )}
        </div>
    );
}


function SortableHeader({
    column,
    label,
    align = "left",
}: {
    column: any;
    label: string;
    align?: "left" | "right";
}) {
    const isSorted = column.getIsSorted();
    const Icon = isSorted === "asc" ? ArrowUp : isSorted === "desc" ? ArrowDown : ArrowUpDown;

    return (
        <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className={`-ml-4 h-8 gap-1 text-xs font-medium ${align === "right" ? "justify-end" : ""}`}
        >
            {label}
            <Icon className="h-3 w-3" />
        </Button>
    );
}

export function getPlayerColumns(handlers: PlayerColumnHandlers): ColumnDef<Player>[] {
    const {
        tournament,
        onPlayerUpdate,
        onDeactivate,
        onActivate,
        onDelete,
        hasPlayedRounds,
        allTitles,
        allPlayers,
        readOnly
    } = handlers;

    const columns: ColumnDef<Player>[] = [
        {
            id: "select",
            header: ({ table }) => (
                <div className="px-2">
                    <Checkbox
                        checked={
                            table.getIsAllPageRowsSelected() ||
                            (table.getIsSomePageRowsSelected() && "indeterminate")
                        }
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="px-2">
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                    />
                </div>
            ),
            enableSorting: false,
            enableHiding: false,
        },

        {
            accessorKey: "name",
            header: ({ column }) => <SortableHeader column={column} label="Player" />,
            cell: ({ row }) => {
                const player = row.original;
                const isDeactivated = !player.active;

                return (
                    <EditableNameInput
                        player={player}
                        allPlayers={allPlayers}
                        onPlayerUpdate={onPlayerUpdate}
                        disabled={isDeactivated}
                    />
                );
            },
        },
        {
            accessorKey: "titles",
            header: () => <span className="text-xs font-medium">Titles</span>,
            cell: ({ row }) => {
                const player = row.original;
                const isDeactivated = !player.active;

                if (isDeactivated) {
                    const titleStyles = getTitlesStyles(tournament, player.titles);
                    return (
                        <div className="flex flex-wrap gap-1">
                            {titleStyles.length > 0 ? (
                                titleStyles.map(({ title, style }) => (
                                    <span
                                        key={title}
                                        className="text-[10px] px-1 py-0 leading-none rounded border"
                                        style={{
                                            borderColor: style?.borderColor || "hsl(var(--border))",
                                            color: style?.color || "hsl(var(--foreground))",
                                        }}
                                    >
                                        {title}
                                    </span>
                                ))
                            ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                            )
                            }
                        </div >
                    );
                }

                return (
                    <div className="min-w-[100px]" >
                        <Combobox
                            options={allTitles.map(({ name }) => {
                                const customTitle = tournament.customTitles?.find(t => t.name === name);
                                return {
                                    value: name,
                                    label: name,
                                    color: customTitle?.color,
                                };
                            })}
                            selected={player.titles || []}
                            onChange={(titles) => onPlayerUpdate(player.id, { titles })}
                            placeholder="—"
                            className="h-8 border-transparent hover:border-input bg-transparent"
                            maxSelected={3}
                        />
                    </div>
                );
            },
            enableSorting: false,
        },
        {
            accessorKey: "fideId",
            header: ({ column }) => (
                <div className="text-right">
                    <SortableHeader column={column} label="FIDE ID" align="right" />
                </div>
            ),
            cell: ({ row }) => {
                const player = row.original;
                const isDeactivated = !player.active;

                if (isDeactivated) {
                    return (
                        <div className="text-right tabular-nums text-muted-foreground">
                            {player.fideId || "—"}
                        </div>
                    );
                }

                return (
                    <div className="flex justify-end">
                        <EditableFideIdInput
                            player={player}
                            onPlayerUpdate={onPlayerUpdate}
                        />
                    </div>
                );
            },
        },
        {
            accessorKey: "rating",
            header: ({ column }) => (
                <div className="text-right">
                    <SortableHeader column={column} label="Rating" align="right" />
                </div>
            ),
            cell: ({ row }) => {
                const player = row.original;
                const isDeactivated = !player.active;

                if (isDeactivated) {
                    return (
                        <div className="text-right tabular-nums text-muted-foreground">
                            {player.rating}
                        </div>
                    );
                }

                return (
                    <div className="flex justify-end">
                        <EditableRatingInput
                            player={player}
                            onPlayerUpdate={onPlayerUpdate}
                        />
                    </div>
                );
            },
        },

        {
            id: "actions",
            header: () => <span className="sr-only">Actions</span>,
            cell: ({ row }) => {
                const player = row.original;
                const isDeactivated = !player.active;

                return (
                    <div className="text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Open menu</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {isDeactivated ? (
                                    <>
                                        <DropdownMenuItem onClick={() => onActivate(player.id)} className="text-green-600 focus:text-green-600">
                                            <ArrowUp className="mr-2 h-4 w-4" />
                                            Activate
                                        </DropdownMenuItem>
                                        {!hasPlayedRounds(player.id) && (
                                            <DropdownMenuItem onClick={() => onDelete(player.id)} className="text-destructive focus:text-destructive">
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Delete
                                            </DropdownMenuItem>
                                        )}
                                    </>
                                ) : (
                                    <DropdownMenuItem onClick={() => onDeactivate(player.id)} className="text-destructive focus:text-destructive">
                                        <ArrowDown className="mr-2 h-4 w-4" />
                                        Deactivate
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            },
        },
    ];

    // In read-only mode, filter out selection and actions columns
    if (readOnly) {
        return columns.filter(col => col.id !== 'select' && col.id !== 'actions');
    }

    return columns;
}
