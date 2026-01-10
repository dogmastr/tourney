"use client"

import * as React from "react"
import { ChevronDownIcon, CalendarIcon } from "lucide-react"
import { format, parse, isValid } from "date-fns"

import { Button } from "@/shared/ui/button"
import { Calendar } from "@/shared/ui/calendar"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/shared/ui/popover"
import { cn } from "@/shared/utils"

interface DateTimePickerProps {
    /** Label for the date/time picker */
    label?: string
    /** The current date value as ISO string (YYYY-MM-DD) or full ISO string */
    value?: string
    /** The current time value as HH:mm string */
    timeValue?: string
    /** Callback when date changes */
    onDateChange?: (date: string) => void
    /** Callback when time changes */
    onTimeChange?: (time: string) => void
    /** Whether to show time picker */
    showTime?: boolean
    /** Placeholder text for date button */
    datePlaceholder?: string
    /** Placeholder text for time input */
    timePlaceholder?: string
    /** Additional className for the container */
    className?: string
    /** Whether the picker is disabled */
    disabled?: boolean
    /** Icon to show before label */
    icon?: React.ReactNode
}

/**
 * DateTimePicker component combining shadcn Calendar with time input.
 * 
 * @example
 * // Date only
 * <DateTimePicker
 *   label="Start Date"
 *   value={startDate}
 *   onDateChange={setStartDate}
 * />
 * 
 * @example
 * // Date and time
 * <DateTimePicker
 *   label="Start"
 *   value={startDate}
 *   timeValue={startTime}
 *   onDateChange={setStartDate}
 *   onTimeChange={setStartTime}
 *   showTime
 * />
 */
export function DateTimePicker({
    label,
    value,
    timeValue,
    onDateChange,
    onTimeChange,
    showTime = false,
    datePlaceholder = "Select date",
    timePlaceholder = "00:00",
    className,
    disabled = false,
    icon,
}: DateTimePickerProps) {
    const [open, setOpen] = React.useState(false)

    // Parse the date value
    const dateObj = React.useMemo(() => {
        if (!value) return undefined
        // Try parsing as YYYY-MM-DD
        const parsed = parse(value, "yyyy-MM-dd", new Date())
        return isValid(parsed) ? parsed : undefined
    }, [value])

    const handleDateSelect = (date: Date | undefined) => {
        if (date && onDateChange) {
            onDateChange(format(date, "yyyy-MM-dd"))
        }
        setOpen(false)
    }

    return (
        <div className={cn("flex gap-2", className)}>
            {/* Date Picker */}
            <div className="flex flex-col gap-1.5 flex-1">
                {label && (
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        {icon}
                        {label}
                    </Label>
                )}
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            disabled={disabled}
                            className={cn(
                                "h-9 justify-between font-normal",
                                !dateObj && "text-muted-foreground"
                            )}
                        >
                            <span className="flex items-center gap-2">
                                <CalendarIcon className="h-3.5 w-3.5" />
                                {dateObj ? format(dateObj, "MMM d, yyyy") : datePlaceholder}
                            </span>
                            <ChevronDownIcon className="h-4 w-4 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={dateObj}
                            onSelect={handleDateSelect}
                            captionLayout="dropdown"
                            defaultMonth={dateObj}
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Time Picker */}
            {showTime && (
                <div className="flex flex-col gap-1.5 w-24">
                    {label && (
                        <Label className="text-xs text-muted-foreground">Time</Label>
                    )}
                    <Input
                        type="time"
                        value={timeValue || ""}
                        onChange={(e) => onTimeChange?.(e.target.value)}
                        disabled={disabled}
                        placeholder={timePlaceholder}
                        className="h-9 bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    />
                </div>
            )}
        </div>
    )
}

/**
 * Simplified DatePicker without time - just the date portion.
 */
export function DatePicker({
    label,
    value,
    onChange,
    placeholder = "Select date",
    className,
    disabled = false,
    icon,
}: {
    label?: string
    value?: string
    onChange?: (date: string) => void
    placeholder?: string
    className?: string
    disabled?: boolean
    icon?: React.ReactNode
}) {
    return (
        <DateTimePicker
            label={label}
            value={value}
            onDateChange={onChange}
            datePlaceholder={placeholder}
            className={className}
            disabled={disabled}
            icon={icon}
            showTime={false}
        />
    )
}
