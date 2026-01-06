/**
 * ISO 27001 Compliant Client-Side Rate Limiting
 * 
 * Prevents abuse by limiting the number of requests from a client
 * Note: This is a client-side protection. Server-side rate limiting is also required.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if request is allowed
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    // No entry or window expired, allow request
    if (!entry || now > entry.resetTime) {
      this.limits.set(key, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    // Check if limit exceeded
    if (entry.count >= this.maxRequests) {
      return false;
    }

    // Increment count
    entry.count++;
    return true;
  }

  /**
   * Get remaining requests
   */
  getRemaining(key: string): number {
    const entry = this.limits.get(key);
    if (!entry || Date.now() > entry.resetTime) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - entry.count);
  }

  /**
   * Get reset time
   */
  getResetTime(key: string): number {
    const entry = this.limits.get(key);
    if (!entry) {
      return Date.now() + this.windowMs;
    }
    return entry.resetTime;
  }

  /**
   * Clear rate limit for a key
   */
  clear(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clearAll(): void {
    this.limits.clear();
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }
}

// Create rate limiters for different operations
export const apiRateLimiter = new RateLimiter(100, 60000); // 100 requests per minute
export const authRateLimiter = new RateLimiter(5, 60000); // 5 login attempts per minute
export const formSubmissionRateLimiter = new RateLimiter(10, 60000); // 10 form submissions per minute

/**
 * Get client identifier for rate limiting
 */
export function getClientId(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  // Use a combination of user agent and a stored identifier
  let clientId = sessionStorage.getItem('client-id');
  if (!clientId) {
    // Generate a simple identifier (not cryptographically secure, but good enough for rate limiting)
    clientId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('client-id', clientId);
  }

  return clientId;
}

/**
 * Check rate limit before making a request
 */
export function checkRateLimit(limiter: RateLimiter, key?: string): { allowed: boolean; remaining: number; resetTime: number } {
  const limitKey = key || getClientId();
  const allowed = limiter.isAllowed(limitKey);
  const remaining = limiter.getRemaining(limitKey);
  const resetTime = limiter.getResetTime(limitKey);

  return { allowed, remaining, resetTime };
}

// Cleanup expired entries periodically
if (typeof window !== 'undefined') {
  setInterval(() => {
    apiRateLimiter.cleanup();
    authRateLimiter.cleanup();
    formSubmissionRateLimiter.cleanup();
  }, 60000); // Cleanup every minute
}






