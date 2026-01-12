/**
 * ISO 27001 Compliant CSRF Protection
 * 
 * Implements CSRF token generation and validation for state-changing operations
 */

const CSRF_TOKEN_KEY = 'csrf-token';
const CSRF_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a secure CSRF token
 */
export function generateCSRFToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  // Generate a random token
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

  // Store token with expiry
  const expiry = Date.now() + CSRF_TOKEN_EXPIRY;
  sessionStorage.setItem(CSRF_TOKEN_KEY, JSON.stringify({ token, expiry }));

  return token;
}

/**
 * Get current CSRF token (generate if doesn't exist or expired)
 */
export function getCSRFToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const stored = sessionStorage.getItem(CSRF_TOKEN_KEY);
    if (!stored) {
      return generateCSRFToken();
    }

    const { token, expiry } = JSON.parse(stored);
    
    // Check if token expired
    if (Date.now() > expiry) {
      return generateCSRFToken();
    }

    return token;
  } catch (error) {
    // If parsing fails, generate new token
    return generateCSRFToken();
  }
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const stored = sessionStorage.getItem(CSRF_TOKEN_KEY);
    if (!stored) {
      return false;
    }

    const { token: storedToken, expiry } = JSON.parse(stored);
    
    // Check if token expired
    if (Date.now() > expiry) {
      sessionStorage.removeItem(CSRF_TOKEN_KEY);
      return false;
    }

    // Compare tokens (constant-time comparison to prevent timing attacks)
    return constantTimeCompare(token, storedToken);
  } catch (error) {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Clear CSRF token (on logout)
 */
export function clearCSRFToken(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(CSRF_TOKEN_KEY);
  }
}













