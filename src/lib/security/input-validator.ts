/**
 * ISO 27001 Compliant Input Validation and Sanitization
 * 
 * This module provides comprehensive input validation and sanitization
 * to prevent injection attacks, XSS, and other security vulnerabilities.
 */

// Common patterns for validation
const PATTERNS = {
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  phone: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/,
  awb: /^[A-Z0-9]{8,20}$/i,
  alphanumeric: /^[a-zA-Z0-9\s\-_]+$/,
  numeric: /^[0-9]+(\.[0-9]+)?$/,
  url: /^https?:\/\/.+/,
  noScript: /<script|javascript:|onerror=|onload=|onclick=/i,
  sqlInjection: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)|('|(\\')|(;)|(--)|(\/\*)|(\*\/))/i,
};

// Maximum lengths for different field types
const MAX_LENGTHS = {
  email: 255,
  phone: 20,
  name: 100,
  address: 500,
  description: 2000,
  notes: 5000,
  awb: 20,
  id: 50,
  password: 128,
  default: 1000,
};

/**
 * Sanitize string input to prevent XSS attacks
 */
export function sanitizeString(input: string | null | undefined, maxLength: number = MAX_LENGTHS.default): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Skip sanitization for base64 data URLs (image strings)
  // Base64 strings are safe and should not be truncated or HTML-encoded
  if (input.startsWith('data:image/')) {
    return input; // Return full base64 string without modification
  }

  // Trim and limit length
  let sanitized = input.trim().substring(0, maxLength);

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove script tags and event handlers (basic XSS prevention)
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');

  // HTML entity encoding for special characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  return sanitized;
}

/**
 * Validate and sanitize email address
 */
export function validateEmail(email: string | null | undefined): { valid: boolean; sanitized: string; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, sanitized: '', error: 'Email is required' };
  }

  const trimmed = email.trim().toLowerCase();
  
  if (trimmed.length > MAX_LENGTHS.email) {
    return { valid: false, sanitized: '', error: `Email must be less than ${MAX_LENGTHS.email} characters` };
  }

  if (!PATTERNS.email.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Invalid email format' };
  }

  // Check for XSS patterns
  if (PATTERNS.noScript.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Email contains invalid characters' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate and sanitize phone number
 */
export function validatePhone(phone: string | null | undefined): { valid: boolean; sanitized: string; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, sanitized: '', error: 'Phone number is required' };
  }

  // Remove common formatting characters
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  
  if (cleaned.length > MAX_LENGTHS.phone) {
    return { valid: false, sanitized: '', error: `Phone number must be less than ${MAX_LENGTHS.phone} characters` };
  }

  if (!PATTERNS.phone.test(cleaned)) {
    return { valid: false, sanitized: '', error: 'Invalid phone number format' };
  }

  return { valid: true, sanitized: cleaned };
}

/**
 * Validate and sanitize AWB number
 */
export function validateAWB(awb: string | null | undefined): { valid: boolean; sanitized: string; error?: string } {
  if (!awb || typeof awb !== 'string') {
    return { valid: false, sanitized: '', error: 'AWB number is required' };
  }

  const trimmed = awb.trim().toUpperCase();
  
  if (trimmed.length < 8 || trimmed.length > MAX_LENGTHS.awb) {
    return { valid: false, sanitized: '', error: `AWB must be between 8 and ${MAX_LENGTHS.awb} characters` };
  }

  if (!PATTERNS.awb.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'AWB contains invalid characters' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate and sanitize name (person or company)
 */
export function validateName(name: string | null | undefined, fieldName: string = 'Name'): { valid: boolean; sanitized: string; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, sanitized: '', error: `${fieldName} is required` };
  }

  const trimmed = name.trim();
  
  if (trimmed.length < 2) {
    return { valid: false, sanitized: '', error: `${fieldName} must be at least 2 characters` };
  }

  if (trimmed.length > MAX_LENGTHS.name) {
    return { valid: false, sanitized: '', error: `${fieldName} must be less than ${MAX_LENGTHS.name} characters` };
  }

  // Check for script injection
  if (PATTERNS.noScript.test(trimmed)) {
    return { valid: false, sanitized: '', error: `${fieldName} contains invalid characters` };
  }

  // Check for SQL injection patterns
  if (PATTERNS.sqlInjection.test(trimmed)) {
    return { valid: false, sanitized: '', error: `${fieldName} contains invalid characters` };
  }

  return { valid: true, sanitized: sanitizeString(trimmed, MAX_LENGTHS.name) };
}

/**
 * Validate and sanitize address
 */
export function validateAddress(address: string | null | undefined): { valid: boolean; sanitized: string; error?: string } {
  if (!address || typeof address !== 'string') {
    return { valid: false, sanitized: '', error: 'Address is required' };
  }

  const trimmed = address.trim();
  
  if (trimmed.length < 5) {
    return { valid: false, sanitized: '', error: 'Address must be at least 5 characters' };
  }

  if (trimmed.length > MAX_LENGTHS.address) {
    return { valid: false, sanitized: '', error: `Address must be less than ${MAX_LENGTHS.address} characters` };
  }

  // Check for script injection
  if (PATTERNS.noScript.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Address contains invalid characters' };
  }

  return { valid: true, sanitized: sanitizeString(trimmed, MAX_LENGTHS.address) };
}

/**
 * Validate numeric input
 */
export function validateNumber(value: string | number | null | undefined, min?: number, max?: number): { valid: boolean; sanitized: number; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { valid: false, sanitized: 0, error: 'Number is required' };
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue) || !isFinite(numValue)) {
    return { valid: false, sanitized: 0, error: 'Invalid number format' };
  }

  if (min !== undefined && numValue < min) {
    return { valid: false, sanitized: numValue, error: `Number must be at least ${min}` };
  }

  if (max !== undefined && numValue > max) {
    return { valid: false, sanitized: numValue, error: `Number must be at most ${max}` };
  }

  return { valid: true, sanitized: numValue };
}

/**
 * Validate and sanitize text area (notes, descriptions)
 */
export function validateTextArea(text: string | null | undefined, maxLength: number = MAX_LENGTHS.notes): { valid: boolean; sanitized: string; error?: string } {
  if (!text || typeof text !== 'string') {
    return { valid: false, sanitized: '', error: 'Text is required' };
  }

  const trimmed = text.trim();
  
  if (trimmed.length > maxLength) {
    return { valid: false, sanitized: '', error: `Text must be less than ${maxLength} characters` };
  }

  // Check for script injection
  if (PATTERNS.noScript.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Text contains invalid characters' };
  }

  return { valid: true, sanitized: sanitizeString(trimmed, maxLength) };
}

/**
 * Validate object ID (MongoDB ObjectId format)
 */
export function validateObjectId(id: string | null | undefined): { valid: boolean; sanitized: string; error?: string } {
  if (!id || typeof id !== 'string') {
    return { valid: false, sanitized: '', error: 'ID is required' };
  }

  const trimmed = id.trim();
  
  // MongoDB ObjectId is 24 hex characters
  if (!/^[0-9a-fA-F]{24}$/.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Invalid ID format' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Deep sanitize object to prevent injection attacks
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T, maxDepth: number = 5, currentDepth: number = 0): T {
  if (currentDepth >= maxDepth) {
    return {} as T;
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const sanitized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Sanitize key
    const sanitizedKey = sanitizeString(key, 100);

    // Sanitize value based on type
    if (typeof value === 'string') {
      sanitized[sanitizedKey] = sanitizeString(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[sanitizedKey] = value;
    } else if (Array.isArray(value)) {
      sanitized[sanitizedKey] = value.map(item => 
        typeof item === 'string' ? sanitizeString(item) : 
        typeof item === 'object' ? sanitizeObject(item, maxDepth, currentDepth + 1) : 
        item
      );
    } else if (value && typeof value === 'object') {
      sanitized[sanitizedKey] = sanitizeObject(value, maxDepth, currentDepth + 1);
    } else {
      sanitized[sanitizedKey] = value;
    }
  }

  return sanitized as T;
}

/**
 * Check if input contains potentially dangerous patterns
 */
export function containsDangerousPatterns(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  return PATTERNS.noScript.test(input) || PATTERNS.sqlInjection.test(input);
}

/**
 * Validate password strength (for password changes)
 */
export function validatePasswordStrength(password: string): { valid: boolean; strength: 'weak' | 'medium' | 'strong'; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (password.length > MAX_LENGTHS.password) {
    errors.push(`Password must be less than ${MAX_LENGTHS.password} characters`);
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check for common weak passwords
  const commonPasswords = ['password', 'password123', '12345678', 'qwerty', 'admin'];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    errors.push('Password is too common');
  }

  const strength = errors.length === 0 ? 'strong' : errors.length <= 2 ? 'medium' : 'weak';
  const valid = errors.length === 0;

  return { valid, strength, errors };
}











