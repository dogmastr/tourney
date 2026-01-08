/**
 * Client-Side Rate Limiter
 * 
 * Prevents abuse by limiting the number of mutations per time window.
 * Uses sliding window algorithm for smooth rate limiting.
 */

import { LIMITS, LIMIT_MESSAGES } from './limits';

interface RateLimitResult {
    allowed: boolean;
    retryAfterMs?: number;
    remaining: number;
}

class RateLimiter {
    private timestamps: number[] = [];
    private readonly maxRequests: number;
    private readonly windowMs: number;

    constructor(maxRequests: number = LIMITS.MUTATIONS_PER_MINUTE, windowMs: number = LIMITS.RATE_LIMIT_WINDOW_MS) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    /**
     * Check if a request is allowed under the rate limit
     */
    check(): RateLimitResult {
        const now = Date.now();
        const windowStart = now - this.windowMs;

        // Remove expired timestamps
        this.timestamps = this.timestamps.filter(t => t > windowStart);

        const remaining = Math.max(0, this.maxRequests - this.timestamps.length);

        if (this.timestamps.length >= this.maxRequests) {
            // Find how long until the oldest request expires
            const oldestTimestamp = this.timestamps[0];
            const retryAfterMs = oldestTimestamp + this.windowMs - now;

            return {
                allowed: false,
                retryAfterMs: Math.max(0, retryAfterMs),
                remaining: 0,
            };
        }

        return {
            allowed: true,
            remaining,
        };
    }

    /**
     * Record a request (call after successful mutation)
     */
    record(): void {
        this.timestamps.push(Date.now());
    }

    /**
     * Check and record in one call (convenience method)
     */
    tryAcquire(): RateLimitResult {
        const result = this.check();
        if (result.allowed) {
            this.record();
        }
        return result;
    }

    /**
     * Reset the rate limiter
     */
    reset(): void {
        this.timestamps = [];
    }

    /**
     * Get current usage info
     */
    getUsage(): { used: number; limit: number; remaining: number } {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        this.timestamps = this.timestamps.filter(t => t > windowStart);

        return {
            used: this.timestamps.length,
            limit: this.maxRequests,
            remaining: Math.max(0, this.maxRequests - this.timestamps.length),
        };
    }
}

// Singleton instance for mutation rate limiting
let mutationRateLimiter: RateLimiter | null = null;

export function getMutationRateLimiter(): RateLimiter {
    if (!mutationRateLimiter) {
        mutationRateLimiter = new RateLimiter();
    }
    return mutationRateLimiter;
}

/**
 * Check if a mutation is allowed and record it
 * Throws an error if rate limit exceeded
 */
export function checkRateLimit(): void {
    const limiter = getMutationRateLimiter();
    const result = limiter.tryAcquire();

    if (!result.allowed) {
        const retrySeconds = Math.ceil((result.retryAfterMs || 1000) / 1000);
        throw new Error(`${LIMIT_MESSAGES.RATE_LIMIT_EXCEEDED} Try again in ${retrySeconds} second${retrySeconds === 1 ? '' : 's'}.`);
    }
}

/**
 * Check rate limit without recording (for preview)
 */
export function canMakeRequest(): boolean {
    const limiter = getMutationRateLimiter();
    return limiter.check().allowed;
}

export { RateLimiter };

// Bio update rate limiter (1 update per 10 seconds)
let bioRateLimiter: RateLimiter | null = null;

export function getBioRateLimiter(): RateLimiter {
    if (!bioRateLimiter) {
        // 1 update per 10 second window
        bioRateLimiter = new RateLimiter(1, LIMITS.BIO_UPDATE_COOLDOWN_MS);
    }
    return bioRateLimiter;
}

/**
 * Check if a bio update is allowed and record it
 * Returns error message if rate limited, null if allowed
 */
export function checkBioRateLimit(): string | null {
    const limiter = getBioRateLimiter();
    const result = limiter.tryAcquire();

    if (!result.allowed) {
        const retrySeconds = Math.ceil((result.retryAfterMs || 1000) / 1000);
        return `Please wait ${retrySeconds} second${retrySeconds === 1 ? '' : 's'} before updating your bio again.`;
    }
    return null;
}
