'use client';

/**
 * Rate Limit Alert Component
 * 
 * Displays a visual alert when rate limit is exceeded with countdown timer.
 * Uses absolute end time tracking to prevent countdown resets when additional
 * actions are attempted during cooldown.
 */

import { useState, useEffect, useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Timer } from 'lucide-react';

interface RateLimitAlertProps {
    /** Whether the rate limit is currently exceeded */
    isLimited: boolean;
    /** Time in ms until rate limit resets */
    retryAfterMs?: number;
    /** Callback when cooldown completes */
    onCooldownComplete?: () => void;
}

export function RateLimitAlert({ isLimited, retryAfterMs = 0, onCooldownComplete }: RateLimitAlertProps) {
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    // Track the absolute end time to prevent countdown resets on re-attempts
    const endTimeRef = useRef<number | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Cleanup function
        const cleanup = () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };

        if (!isLimited) {
            endTimeRef.current = null;
            setRemainingSeconds(0);
            cleanup();
            return;
        }

        const now = Date.now();

        // Only set a new end time if we don't have one or if it has passed
        if (!endTimeRef.current || endTimeRef.current <= now) {
            endTimeRef.current = now + retryAfterMs;
        }

        const updateRemaining = () => {
            const remaining = Math.max(0, Math.ceil((endTimeRef.current! - Date.now()) / 1000));
            setRemainingSeconds(remaining);

            if (remaining <= 0) {
                cleanup();
                endTimeRef.current = null;
                onCooldownComplete?.();
            }
        };

        // Initial update
        updateRemaining();

        // Set up interval
        cleanup(); // Clear any existing interval
        intervalRef.current = setInterval(updateRemaining, 1000);

        return cleanup;
    }, [isLimited, retryAfterMs, onCooldownComplete]);

    if (!isLimited || remainingSeconds <= 0) {
        return null;
    }

    return (
        <Alert variant="destructive" className="mb-4">
            <Timer className="h-4 w-4" />
            <AlertTitle className="font-semibold">Rate Limit Exceeded</AlertTitle>
            <AlertDescription>
                Too many requests. Please wait{' '}
                <span className="font-mono font-bold">
                    {remainingSeconds}
                </span>{' '}
                second{remainingSeconds === 1 ? '' : 's'} before trying again.
            </AlertDescription>
        </Alert>
    );
}

/**
 * Hook to manage rate limit state for UI display
 */
import { getMutationRateLimiter } from '@/shared/rate-limiter';

export function useRateLimitState() {
    const [limitState, setLimitState] = useState<{
        isLimited: boolean;
        retryAfterMs: number;
    }>({ isLimited: false, retryAfterMs: 0 });

    const checkAndSetLimit = () => {
        const limiter = getMutationRateLimiter();
        const result = limiter.check();

        if (!result.allowed) {
            setLimitState({
                isLimited: true,
                retryAfterMs: result.retryAfterMs || 1000,
            });
            return false;
        }
        return true;
    };

    const clearLimit = () => {
        setLimitState({ isLimited: false, retryAfterMs: 0 });
    };

    const setLimitedWithRetry = (retryAfterMs: number) => {
        setLimitState({ isLimited: true, retryAfterMs });
    };

    return {
        ...limitState,
        checkAndSetLimit,
        clearLimit,
        setLimitedWithRetry,
    };
}

/**
 * Hook to manage bio update rate limit state for UI display
 */
import { getBioRateLimiter } from '@/shared/rate-limiter';

export function useBioRateLimitState() {
    const [limitState, setLimitState] = useState<{
        isLimited: boolean;
        retryAfterMs: number;
    }>({ isLimited: false, retryAfterMs: 0 });

    const checkAndSetLimit = () => {
        const limiter = getBioRateLimiter();
        const result = limiter.check();

        if (!result.allowed) {
            setLimitState({
                isLimited: true,
                retryAfterMs: result.retryAfterMs || 1000,
            });
            return false;
        }
        return true;
    };

    const recordUpdate = () => {
        const limiter = getBioRateLimiter();
        limiter.record();
    };

    const clearLimit = () => {
        setLimitState({ isLimited: false, retryAfterMs: 0 });
    };

    const setLimitedWithRetry = (retryAfterMs: number) => {
        setLimitState({ isLimited: true, retryAfterMs });
    };

    return {
        ...limitState,
        checkAndSetLimit,
        recordUpdate,
        clearLimit,
        setLimitedWithRetry,
    };
}
