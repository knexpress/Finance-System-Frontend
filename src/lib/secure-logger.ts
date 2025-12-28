/**
 * Secure logging utility that:
 * - Only logs in development mode
 * - Sanitizes sensitive data (tokens, passwords, full objects)
 * - Provides useful debugging information without exposing security risks
 */

const isDevelopment = process.env.NODE_ENV === 'development';

// Fields that should never be logged
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'authorization',
  'auth',
  'credentials',
  'session',
  'cookie',
];

// Sanitize an object by removing sensitive fields and limiting depth
function sanitizeData(data: any, maxDepth = 3, currentDepth = 0): any {
  if (!isDevelopment) return '[Logging disabled in production]';
  
  if (currentDepth >= maxDepth) {
    return '[Max depth reached]';
  }

  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.slice(0, 5).map(item => sanitizeData(item, maxDepth, currentDepth + 1));
  }

  if (typeof data === 'object') {
    const sanitized: any = {};
    const keys = Object.keys(data).slice(0, 20); // Limit keys
    
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      
      // Skip sensitive fields
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }
      
      // Sanitize nested objects
      sanitized[key] = sanitizeData(data[key], maxDepth, currentDepth + 1);
    }
    
    return sanitized;
  }

  return data;
}

export const secureLog = {
  /**
   * Log information (only in development)
   */
  info: (message: string, data?: any) => {
    if (!isDevelopment) return;
    console.log(`ℹ️ ${message}`, data ? sanitizeData(data) : '');
  },

  /**
   * Log warnings (only in development)
   */
  warn: (message: string, data?: any) => {
    if (!isDevelopment) return;
    console.warn(`⚠️ ${message}`, data ? sanitizeData(data) : '');
  },

  /**
   * Log errors (always logged, but sanitized)
   */
  error: (message: string, error?: any) => {
    if (error) {
      const sanitizedError = error instanceof Error 
        ? { message: error.message, stack: error.stack?.substring(0, 200) }
        : sanitizeData(error);
      console.error(`❌ ${message}`, sanitizedError);
    } else {
      console.error(`❌ ${message}`);
    }
  },

  /**
   * Log debug information (only in development, with more detail)
   */
  debug: (message: string, data?: any) => {
    if (!isDevelopment) return;
    console.log(`🔍 ${message}`, data ? sanitizeData(data, 4) : '');
  },

  /**
   * Log success messages (only in development)
   */
  success: (message: string, data?: any) => {
    if (!isDevelopment) return;
    console.log(`✅ ${message}`, data ? sanitizeData(data) : '');
  },
};

