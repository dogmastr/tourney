"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    type Tournament,
    type TiebreakType,
    type CustomTitle,
    DEFAULT_TIEBREAK_ORDER,
    TIEBREAK_LABELS,
} from "@/lib/tournament-store";
import { TitleBadges } from "@/components/tournament/title-badges";
import { useTournamentActions } from "@/hooks/use-tournament-actions";
import { FEDERATIONS } from "@/lib/federations";
import { Plus, Trash2, Edit2, X, Check, Download, Upload, CalendarIcon, MapPin, User, Clock, Building, Save } from "lucide-react";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
    Collapsible,
    CollapsibleContent,
} from "@/components/ui/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RateLimitAlert } from "@/components/rate-limit-alert";
import { LIMITS, canAddCustomTitle, getRemainingCustomTitles, LIMIT_MESSAGES } from "@/lib/limits";

interface SettingsTabProps {
    tournament: Tournament;
    onTournamentUpdate: (tournament: Tournament) => void;
}

export function SettingsTab({ tournament, onTournamentUpdate }: SettingsTabProps) {
    // Use tournament actions hook for state management
    const {
        updateSettings,
        addTitle,
        updateTitle,
        removeTitle,
    } = useTournamentActions({ tournament, onTournamentUpdate });
    // Tournament Rules State
    const [byeValue, setByeValue] = useState<string>((tournament.byeValue ?? 1).toString());
    const [allowChangingResults, setAllowChangingResults] = useState(tournament.allowChangingResults ?? false);
    const [totalRounds, setTotalRounds] = useState<string>((tournament.totalRounds ?? 7).toString());

    // Tournament Details State
    const [organizers, setOrganizers] = useState(tournament.organizers || "");
    const [federation, setFederation] = useState(tournament.federation || "");
    const [tournamentDirector, setTournamentDirector] = useState(tournament.tournamentDirector || "");
    const [chiefArbiter, setChiefArbiter] = useState(tournament.chiefArbiter || "");
    const [timeControl, setTimeControl] = useState(tournament.timeControl || "");
    const [startDate, setStartDate] = useState(tournament.startDate || "");
    const [startTime, setStartTime] = useState(tournament.startTime || "");
    const [endDate, setEndDate] = useState(tournament.endDate || "");
    const [endTime, setEndTime] = useState(tournament.endTime || "");
    const [location, setLocation] = useState(tournament.location || "");

    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Custom titles state
    const [showAddTitle, setShowAddTitle] = useState(false);
    const [newTitleName, setNewTitleName] = useState("");
    const [newTitleColor, setNewTitleColor] = useState("#3b82f6");
    const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
    const [editTitleName, setEditTitleName] = useState("");
    const [editTitleColor, setEditTitleColor] = useState("");
    const [showDeleteTitleDialog, setShowDeleteTitleDialog] = useState(false);
    const [titleToDelete, setTitleToDelete] = useState<string | null>(null);

    // Rate limit state
    const [rateLimitState, setRateLimitState] = useState<{ isLimited: boolean; retryAfterMs: number }>({
        isLimited: false,
        retryAfterMs: 0,
    });

    // Tiebreak order state
    const [tiebreakOrder, setTiebreakOrder] = useState<TiebreakType[]>(
        tournament.tiebreakOrder || DEFAULT_TIEBREAK_ORDER
    );

    const successTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (successTimerRef.current) {
                clearTimeout(successTimerRef.current);
            }
        };
    }, []);

    const handleTiebreakChange = (selected: string[]) => {
        setTiebreakOrder(selected as TiebreakType[]);
        handleChange();
    };

    const resetTiebreakOrder = () => {
        setTiebreakOrder([...DEFAULT_TIEBREAK_ORDER]);
        handleChange();
    };

    const handleChange = () => {
        setHasChanges(true);
        setError(null);
    };


    const handleSave = useCallback(() => {
        setError(null);
        setSuccess(false);

        try {
            const byeValueNum = parseFloat(byeValue);
            const totalRoundsNum = parseInt(totalRounds, 10);

            if (![0, 0.5, 1].includes(byeValueNum)) {
                setError("Bye value must be 0, 0.5, or 1");
                return;
            }

            if (isNaN(totalRoundsNum) || totalRoundsNum < 0 || !Number.isInteger(totalRoundsNum)) {
                setError("Total rounds must be a non-negative integer");
                return;
            }

            if (totalRoundsNum < tournament.rounds.length) {
                setError(`Cannot be less than current rounds (${tournament.rounds.length})`);
                return;
            }

            updateSettings({
                byeValue: byeValueNum,
                allowChangingResults,
                totalRounds: totalRoundsNum,
                tiebreakOrder,
                organizers,
                federation,
                tournamentDirector,
                chiefArbiter,
                timeControl,
                startDate,
                startTime,
                endDate,
                endTime,
                location,
            });

            setSuccess(true);
            setHasChanges(false);
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
            successTimerRef.current = setTimeout(() => {
                setSuccess(false);
                successTimerRef.current = null;
            }, 2000);
        } catch (err) {
            if (err instanceof Error && err.message.includes('Too many requests')) {
                const match = err.message.match(/(\d+) second/);
                const seconds = match ? parseInt(match[1], 10) : 60;
                setRateLimitState({ isLimited: true, retryAfterMs: seconds * 1000 });
            } else {
                setError(err instanceof Error ? err.message : "Failed to update settings");
            }
        }
    }, [byeValue, allowChangingResults, totalRounds, tiebreakOrder, organizers, federation, tournamentDirector, chiefArbiter, timeControl, startDate, startTime, endDate, endTime, location, tournament.rounds.length, updateSettings]);


    // Export custom titles to CSV
    const handleExportTitles = useCallback(() => {
        if (!tournament.customTitles || tournament.customTitles.length === 0) return;

        const csvContent = [
            ['Name', 'Color'].join(','),
            ...tournament.customTitles.map(title =>
                `"${title.name.replace(/"/g, '""')}","${title.color}"`
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.setAttribute('href', URL.createObjectURL(blob));
        link.setAttribute('download', `${tournament.name.replace(/[^a-z0-9]/gi, '_')}_custom_titles.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [tournament]);

    // Import custom titles from CSV
    const handleImportTitles = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Client-side file size validation
        if (file.size > LIMITS.MAX_CSV_FILE_SIZE_BYTES) {
            setError(`File size exceeds limit of ${Math.round(LIMITS.MAX_CSV_FILE_SIZE_BYTES / 1024)}KB`);
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const lines = text.split('\n').filter(line => line.trim());
                if (lines.length < 2) {
                    setError("CSV file is empty or invalid");
                    return;
                }

                const dataLines = lines.slice(1);
                const newTitles: CustomTitle[] = [];

                dataLines.forEach(line => {
                    const match = line.match(/"([^"]*)","([^"]*)"/);
                    if (match) {
                        const name = match[1].replace(/""/g, '"').trim();
                        const color = match[2];

                        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return;

                        const exists = tournament.customTitles?.some(t => t.name.toLowerCase() === name.toLowerCase()) ||
                            newTitles.some(t => t.name.toLowerCase() === name.toLowerCase());

                        if (!exists && name) {
                            newTitles.push({
                                id: crypto.randomUUID(),
                                name,
                                color
                            });
                        }
                    }
                });

                if (newTitles.length > 0) {
                    // Check against maximum title limit
                    const currentCount = tournament.customTitles?.length || 0;
                    if (currentCount + newTitles.length > LIMITS.MAX_CUSTOM_TITLES_PER_TOURNAMENT) {
                        setError(`Import would exceed maximum of ${LIMITS.MAX_CUSTOM_TITLES_PER_TOURNAMENT} custom titles`);
                        return;
                    }

                    const updated = {
                        ...tournament,
                        customTitles: [...(tournament.customTitles || []), ...newTitles]
                    };
                    onTournamentUpdate(updated);
                    setSuccess(true);
                    setError(null);
                    if (successTimerRef.current) clearTimeout(successTimerRef.current);
                    successTimerRef.current = setTimeout(() => {
                        setSuccess(false);
                        successTimerRef.current = null;
                    }, 2000);
                } else {
                    setError("No new titles imported");
                }
            } catch (err) {
                setError("Failed to import titles");
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }, [tournament.customTitles, addTitle]);

    const handleAddTitle = () => {
        if (!newTitleName.trim()) {
            setError("Title name required");
            return;
        }
        if (!/^#[0-9A-Fa-f]{6}$/.test(newTitleColor)) {
            setError("Invalid color format");
            return;
        }

        try {
            addTitle({ name: newTitleName.trim(), color: newTitleColor });
            setNewTitleName("");
            setNewTitleColor("#3b82f6");
            setShowAddTitle(false);
            setError(null);
        } catch (err) {
            if (err instanceof Error && err.message.includes('Too many requests')) {
                const match = err.message.match(/(\d+) second/);
                const seconds = match ? parseInt(match[1], 10) : 60;
                setRateLimitState({ isLimited: true, retryAfterMs: seconds * 1000 });
            } else {
                setError(err instanceof Error ? err.message : "Failed to add title");
            }
        }
    };

    return (
        <div className="space-y-4">
            {/* Rate Limit Alert */}
            <RateLimitAlert
                isLimited={rateLimitState.isLimited}
                retryAfterMs={rateLimitState.retryAfterMs}
                onCooldownComplete={() => setRateLimitState({ isLimited: false, retryAfterMs: 0 })}
            />
            {/* Save Header */}
            <div className="flex items-center justify-between bg-card border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                    {error && (
                        <span className="text-sm text-destructive">{error}</span>
                    )}
                    {success && (
                        <span className="text-sm text-green-600">Settings saved!</span>
                    )}
                    {hasChanges && !error && !success && (
                        <span className="text-sm text-muted-foreground">Unsaved changes</span>
                    )}
                </div>
                <Button onClick={handleSave} size="sm" disabled={!hasChanges}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                </Button>
            </div>

            {/* Tournament Information */}
            <div className="bg-card border rounded-lg">
                <div className="px-4 py-3 border-b">
                    <h3 className="font-medium">Tournament Information</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Basic details and schedule</p>
                </div>
                <div className="p-4 space-y-4">
                    {/* Organizers & Officials */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Building className="h-3 w-3" /> Organizer(s)
                            </Label>
                            <Input
                                value={organizers}
                                onChange={(e) => { setOrganizers(e.target.value); handleChange(); }}
                                placeholder="Punggol Coast Chess Club"
                                className="h-9"
                                maxLength={LIMITS.MAX_ORGANIZER_LENGTH}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Building className="h-3 w-3" /> Federation
                            </Label>
                            <Combobox
                                mode="single"
                                options={FEDERATIONS.map(f => ({
                                    value: f.code,
                                    label: `${f.code} - ${f.name}`,
                                }))}
                                value={federation}
                                onChange={(value: string) => {
                                    setFederation(value);
                                    handleChange();
                                }}
                                placeholder="Select Federation"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" /> Tournament Director
                            </Label>
                            <Input
                                value={tournamentDirector}
                                onChange={(e) => { setTournamentDirector(e.target.value); handleChange(); }}
                                placeholder="Name"
                                className="h-9"
                                maxLength={LIMITS.MAX_ARBITER_LENGTH}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" /> Chief Arbiter
                            </Label>
                            <Input
                                value={chiefArbiter}
                                onChange={(e) => { setChiefArbiter(e.target.value); handleChange(); }}
                                placeholder="Name"
                                className="h-9"
                                maxLength={LIMITS.MAX_ARBITER_LENGTH}
                            />
                        </div>
                    </div>

                    {/* Schedule */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <DateTimePicker
                            label="Start Date"
                            icon={<CalendarIcon className="h-3 w-3" />}
                            value={startDate}
                            timeValue={startTime}
                            onDateChange={(date) => { setStartDate(date); handleChange(); }}
                            onTimeChange={(time) => { setStartTime(time); handleChange(); }}
                            showTime
                        />
                        <DateTimePicker
                            label="End Date"
                            icon={<CalendarIcon className="h-3 w-3" />}
                            value={endDate}
                            timeValue={endTime}
                            onDateChange={(date) => { setEndDate(date); handleChange(); }}
                            onTimeChange={(time) => { setEndTime(time); handleChange(); }}
                            showTime
                        />
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Time Control
                            </Label>
                            <Input
                                value={timeControl}
                                onChange={(e) => { setTimeControl(e.target.value); handleChange(); }}
                                placeholder="10+0"
                                className="h-9"
                                maxLength={LIMITS.MAX_TIME_CONTROL_LENGTH}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> Location
                            </Label>
                            <Input
                                value={location}
                                onChange={(e) => { setLocation(e.target.value); handleChange(); }}
                                placeholder="One Punggol"
                                className="h-9"
                                maxLength={LIMITS.MAX_LOCATION_LENGTH}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Rules & Scoring */}
            <div className="bg-card border rounded-lg">
                <div className="px-4 py-3 border-b">
                    <h3 className="font-medium">Rules & Scoring</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Tournament format and tiebreak settings</p>
                </div>
                <div className="p-4 space-y-4">
                    {/* Basic Rules */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="totalRounds" className="text-xs text-muted-foreground">Total Rounds</Label>
                            <Input
                                id="totalRounds"
                                type="number"
                                min="1"
                                value={totalRounds}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === "" || /^\d+$/.test(value)) {
                                        setTotalRounds(value);
                                        handleChange();
                                    }
                                }}
                                className="h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="byeValue" className="text-xs text-muted-foreground">Bye Points</Label>
                            <Select
                                value={byeValue}
                                onValueChange={(v) => {
                                    setByeValue(v);
                                    handleChange();
                                }}
                            >
                                <SelectTrigger id="byeValue" className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="0">0 points</SelectItem>
                                    <SelectItem value="0.5">0.5 points</SelectItem>
                                    <SelectItem value="1">1 point</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Options</Label>
                            <label className="flex items-center gap-2 h-9 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={allowChangingResults}
                                    onChange={(e) => {
                                        setAllowChangingResults(e.target.checked);
                                        handleChange();
                                    }}
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                <span className="text-sm">Allow result changes</span>
                            </label>
                        </div>
                    </div>

                    {/* Tiebreak Order */}
                    <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">
                                Tiebreak Order ({tiebreakOrder.length} selected)
                            </Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={resetTiebreakOrder}
                            >
                                Reset
                            </Button>
                        </div>
                        <Combobox
                            options={DEFAULT_TIEBREAK_ORDER.map(t => ({
                                value: t,
                                label: TIEBREAK_LABELS[t],
                            }))}
                            selected={tiebreakOrder}
                            onChange={handleTiebreakChange}
                            placeholder="Select tiebreaks in priority order..."
                        />
                        {tiebreakOrder.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {tiebreakOrder.map((tiebreak, index) => (
                                    <span
                                        key={tiebreak}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-muted/50 rounded text-xs"
                                    >
                                        <span className="font-mono text-muted-foreground">{index + 1}.</span>
                                        {TIEBREAK_LABELS[tiebreak]}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Custom Titles */}
            <div className="bg-card border rounded-lg">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <div>
                        <h3 className="font-medium">Custom Titles</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Manage custom player titles ({tournament.customTitles?.length || 0}/{LIMITS.MAX_CUSTOM_TITLES_PER_TOURNAMENT})
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 text-xs">
                                    Import/Export
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => document.getElementById('importTitlesInput')?.click()}>
                                    <Upload className="h-3.5 w-3.5 mr-2" />
                                    Import CSV
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={handleExportTitles}
                                    disabled={!tournament.customTitles || tournament.customTitles.length === 0}
                                >
                                    <Download className="h-3.5 w-3.5 mr-2" />
                                    Export CSV
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <input
                            id="importTitlesInput"
                            type="file"
                            accept=".csv"
                            onChange={handleImportTitles}
                            className="hidden"
                        />
                        <Button
                            variant={showAddTitle ? "secondary" : "default"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setShowAddTitle(!showAddTitle)}
                            disabled={!canAddCustomTitle(tournament.customTitles?.length || 0)}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add
                        </Button>
                    </div>
                </div>

                {/* Add Title Form */}
                <Collapsible open={showAddTitle} onOpenChange={setShowAddTitle}>
                    <CollapsibleContent>
                        <div className="px-4 py-3 border-b bg-muted/30">
                            <div className="flex items-end gap-3">
                                <div className="flex-1">
                                    <Label className="text-xs text-muted-foreground">Name</Label>
                                    <Input
                                        value={newTitleName}
                                        onChange={(e) => setNewTitleName(e.target.value)}
                                        placeholder="e.g., Organizer"
                                        maxLength={20}
                                        className="h-8 mt-1"
                                    />
                                </div>
                                <div className="w-32">
                                    <Label className="text-xs text-muted-foreground">Color</Label>
                                    <div className="flex gap-1 mt-1">
                                        <input
                                            type="color"
                                            value={newTitleColor}
                                            onChange={(e) => setNewTitleColor(e.target.value)}
                                            className="h-8 w-10 rounded border cursor-pointer"
                                        />
                                        <Input
                                            value={newTitleColor}
                                            onChange={(e) => {
                                                if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                                                    setNewTitleColor(e.target.value);
                                                }
                                            }}
                                            className="h-8 font-mono text-xs flex-1"
                                        />
                                    </div>
                                </div>
                                <Button size="sm" className="h-8" onClick={handleAddTitle} disabled={!newTitleName.trim()}>
                                    Add
                                </Button>
                            </div>
                        </div>
                    </CollapsibleContent>
                </Collapsible>

                {/* Titles List */}
                <div className="divide-y">
                    {tournament.customTitles && tournament.customTitles.length > 0 ? (
                        tournament.customTitles.map((title) => {
                            const isEditing = editingTitleId === title.id;

                            return (
                                <div key={title.id} className="flex items-center gap-3 px-4 py-2.5 group">
                                    {isEditing ? (
                                        <>
                                            <Input
                                                value={editTitleName}
                                                onChange={(e) => setEditTitleName(e.target.value)}
                                                maxLength={20}
                                                className="h-8 flex-1"
                                                autoFocus
                                            />
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="color"
                                                    value={editTitleColor}
                                                    onChange={(e) => setEditTitleColor(e.target.value)}
                                                    className="h-8 w-10 rounded border cursor-pointer"
                                                />
                                                <Input
                                                    value={editTitleColor}
                                                    onChange={(e) => {
                                                        if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                                                            setEditTitleColor(e.target.value);
                                                        }
                                                    }}
                                                    className="h-8 w-20 font-mono text-xs"
                                                />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => {
                                                    if (!editTitleName.trim() || !/^#[0-9A-Fa-f]{6}$/.test(editTitleColor)) {
                                                        setError("Invalid name or color");
                                                        return;
                                                    }
                                                    try {
                                                        updateTitle(title.id, {
                                                            name: editTitleName.trim(),
                                                            color: editTitleColor,
                                                        });
                                                        setEditingTitleId(null);
                                                        setError(null);
                                                    } catch (err) {
                                                        setError(err instanceof Error ? err.message : "Failed to update");
                                                    }
                                                }}
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => setEditingTitleId(null)}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="min-w-[40px]">
                                                <TitleBadges tournament={tournament} titles={[title.name]} size="sm" />
                                            </div>
                                            <span className="text-xs text-muted-foreground font-mono ml-2">{title.color}</span>
                                            <div className="flex-1" />
                                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => {
                                                        setEditingTitleId(title.id);
                                                        setEditTitleName(title.name);
                                                        setEditTitleColor(title.color);
                                                    }}
                                                >
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                                    onClick={() => {
                                                        setTitleToDelete(title.id);
                                                        setShowDeleteTitleDialog(true);
                                                    }}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            No custom titles yet
                        </div>
                    )}
                </div>
            </div>

            {/* Delete Title Dialog */}
            <ConfirmDialog
                open={showDeleteTitleDialog}
                onOpenChange={setShowDeleteTitleDialog}
                title="Delete Title"
                description="Delete this custom title? This cannot be undone."
                confirmLabel="Delete"
                onConfirm={() => {
                    if (titleToDelete) {
                        try {
                            removeTitle(titleToDelete);
                        } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed to delete");
                        }
                    }
                    setShowDeleteTitleDialog(false);
                    setTitleToDelete(null);
                }}
                variant="destructive"
            />
        </div>
    );
}
