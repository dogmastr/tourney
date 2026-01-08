"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

// Multi-select mode (original behavior)
interface ComboboxMultiProps {
    mode?: "multi";
    options: Array<{ value: string; label: string; color?: string; disabled?: boolean }>;
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    className?: string;
    maxShownItems?: number;
    maxSelected?: number;
}

// Single-select mode (replaces SimpleCombobox)
interface ComboboxSingleProps {
    mode: "single";
    options: Array<{ value: string; label: string; color?: string; disabled?: boolean }>;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    className?: string;
}

type ComboboxProps = ComboboxMultiProps | ComboboxSingleProps;

export function Combobox(props: ComboboxProps) {
    const [open, setOpen] = React.useState(false);
    const [expanded, setExpanded] = React.useState(false);

    const {
        options,
        placeholder = props.mode === "single" ? "Select item..." : "Select items...",
        searchPlaceholder = "Search...",
        emptyMessage = "No results found.",
        className,
    } = props;

    // Single-select mode
    if (props.mode === "single") {
        const { value, onChange } = props;

        return (
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className={cn("w-full justify-between", className)}
                    >
                        <span className="truncate">
                            {value
                                ? options.find((option) => option.value === value)?.label
                                : placeholder}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                        <CommandInput placeholder={searchPlaceholder} className="h-9" />
                        <CommandList>
                            <CommandEmpty>{emptyMessage}</CommandEmpty>
                            <CommandGroup>
                                {options.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label}
                                        disabled={option.disabled}
                                        onSelect={() => {
                                            onChange(option.value === value ? "" : option.value);
                                            setOpen(false);
                                        }}
                                    >
                                        {option.label}
                                        <Check
                                            className={cn(
                                                "ml-auto h-4 w-4",
                                                value === option.value ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        );
    }

    // Multi-select mode (default)
    const { selected, onChange, maxShownItems = 2, maxSelected } = props;

    const toggleOption = (optionValue: string, disabled?: boolean) => {
        if (disabled) return;
        if (selected.includes(optionValue)) {
            onChange(selected.filter((item) => item !== optionValue));
        } else {
            onChange([...selected, optionValue]);
        }
    };

    const removeOption = (optionValue: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(selected.filter((item) => item !== optionValue));
    };

    // Get the label for a selected value (for badge display)
    const getLabel = (optionValue: string) => {
        const option = options.find((o) => o.value === optionValue);
        // For labels with extra info like "Name (Title) - Rating", extract just the name
        if (option?.label) {
            const match = option.label.match(/^([^(–-]+)/);
            return match ? match[1].trim() : option.label;
        }
        return optionValue;
    };

    const visibleItems = expanded ? selected : selected.slice(0, maxShownItems);
    const hiddenCount = selected.length - visibleItems.length;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "h-auto min-h-10 w-full justify-between hover:bg-transparent",
                        className
                    )}
                >
                    <div className="flex flex-nowrap items-center gap-1 pr-2.5 overflow-hidden min-w-0 flex-1">
                        {selected.length > 0 ? (
                            <>
                                {visibleItems.map((optionValue) => {
                                    const option = options.find((o) => o.value === optionValue);
                                    const optionColor = option?.color;
                                    return (
                                        <Badge
                                            key={optionValue}
                                            variant="outline"
                                            className="rounded-sm gap-1 pr-1"
                                            style={optionColor ? {
                                                backgroundColor: `${optionColor}20`,
                                                borderColor: `${optionColor}50`,
                                                color: optionColor,
                                            } : undefined}
                                        >
                                            {getLabel(optionValue)}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-4 hover:bg-muted-foreground/20"
                                                onClick={(e) => removeOption(optionValue, e)}
                                                asChild
                                            >
                                                <span>
                                                    <X className="size-3" />
                                                </span>
                                            </Button>
                                        </Badge>
                                    );
                                })}
                                {(hiddenCount > 0 || expanded) && (
                                    <Badge
                                        variant="outline"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExpanded((prev) => !prev);
                                        }}
                                        className="rounded-sm cursor-pointer hover:bg-muted"
                                    >
                                        {expanded ? "Show Less" : `+${hiddenCount} more`}
                                    </Badge>
                                )}
                            </>
                        ) : (
                            <span className="text-muted-foreground">{placeholder}</span>
                        )}
                    </div>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground/80" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                    <CommandInput placeholder={searchPlaceholder} className="h-9" />
                    <CommandList>
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => {
                                const isSelected = selected.includes(option.value);
                                const isMaxReached = maxSelected !== undefined && selected.length >= maxSelected;
                                const isDisabled = option.disabled || (!isSelected && isMaxReached);
                                return (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label}
                                        onSelect={() => {
                                            toggleOption(option.value, isDisabled);
                                        }}
                                        disabled={isDisabled}
                                        className={cn(
                                            isDisabled && "opacity-50 cursor-not-allowed"
                                        )}
                                        onMouseDown={(e) => {
                                            // Prevent the popover from closing
                                            e.preventDefault();
                                        }}
                                    >
                                        <div className="flex items-center gap-2 flex-1">
                                            {option.color && (
                                                <div
                                                    className="w-3 h-3 rounded border shrink-0"
                                                    style={{
                                                        backgroundColor: `${option.color}40`,
                                                        borderColor: option.color,
                                                    }}
                                                />
                                            )}
                                            <span className="truncate">{option.label}</span>
                                        </div>
                                        {isSelected && (
                                            <Check className="ml-auto h-4 w-4 shrink-0" />
                                        )}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
