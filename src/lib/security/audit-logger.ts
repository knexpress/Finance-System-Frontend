/**
 * ISO 27001 Compliant Audit Logging
 * 
 * Logs security-relevant events for compliance and forensics
 */

import { secureLog } from '../secure-logger';

export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET = 'PASSWORD_RESET',
  
  // Authorization events
  ACCESS_DENIED = 'ACCESS_DENIED',
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',
  
  // Data access events
  DATA_VIEW = 'DATA_VIEW',
  DATA_CREATE = 'DATA_CREATE',
  DATA_UPDATE = 'DATA_UPDATE',
  DATA_DELETE = 'DATA_DELETE',
  DATA_EXPORT = 'DATA_EXPORT',
  
  // Security events
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CSRF_VIOLATION = 'CSRF_VIOLATION',
  INPUT_VALIDATION_FAILURE = 'INPUT_VALIDATION_FAILURE',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'UNAUTHORIZED_ACCESS_ATTEMPT',
  
  // System events
  CONFIGURATION_CHANGE = 'CONFIGURATION_CHANGE',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
}

export interface AuditLogEntry {
  timestamp: string;
  eventType: AuditEventType;
  userId?: string;
  userEmail?: string;
  department?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private readonly maxLogs = 1000; // Keep last 1000 logs in memory

  /**
   * Log an audit event
   */
  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      ipAddress: this.getClientIP(),
      userAgent: this.getUserAgent(),
    };

    // Add to in-memory log
    this.logs.push(fullEntry);
    
    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Log to console in development (sanitized)
    if (process.env.NODE_ENV === 'development') {
      secureLog.info(`[AUDIT] ${entry.eventType}: ${entry.action}`, {
        userId: entry.userId,
        resource: entry.resource,
        success: entry.success,
      });
    }

    // In production, this should send to a secure logging service
    // For now, we'll store in sessionStorage as a backup
    if (typeof window !== 'undefined') {
      try {
        const auditLogs = JSON.parse(sessionStorage.getItem('audit-logs') || '[]');
        auditLogs.push(fullEntry);
        
        // Keep only last 100 entries in sessionStorage
        const trimmedLogs = auditLogs.slice(-100);
        sessionStorage.setItem('audit-logs', JSON.stringify(trimmedLogs));
      } catch (error) {
        secureLog.error('Failed to store audit log', error);
      }
    }
  }

  /**
   * Get audit logs
   */
  getLogs(limit: number = 100): AuditLogEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Get audit logs for a specific user
   */
  getLogsForUser(userId: string, limit: number = 100): AuditLogEntry[] {
    return this.logs
      .filter(log => log.userId === userId)
      .slice(-limit);
  }

  /**
   * Get audit logs for a specific event type
   */
  getLogsByEventType(eventType: AuditEventType, limit: number = 100): AuditLogEntry[] {
    return this.logs
      .filter(log => log.eventType === eventType)
      .slice(-limit);
  }

  /**
   * Clear audit logs
   */
  clearLogs(): void {
    this.logs = [];
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('audit-logs');
    }
  }

  /**
   * Get client IP (from headers if available, otherwise 'unknown')
   */
  private getClientIP(): string {
    // In a real application, this would come from request headers
    // For client-side, we can't reliably get IP, so return 'client'
    return 'client';
  }

  /**
   * Get user agent
   */
  private getUserAgent(): string {
    if (typeof window === 'undefined') {
      return 'server';
    }
    return navigator.userAgent.substring(0, 200); // Limit length
  }
}

export const auditLogger = new AuditLogger();

/**
 * Helper function to create audit log entry
 */
export function createAuditLog(
  eventType: AuditEventType,
  action: string,
  options: {
    userId?: string;
    userEmail?: string;
    department?: string;
    resource?: string;
    resourceId?: string;
    success?: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
  } = {}
): void {
  auditLogger.log({
    eventType,
    action,
    userId: options.userId,
    userEmail: options.userEmail,
    department: options.department,
    resource: options.resource,
    resourceId: options.resourceId,
    success: options.success !== false,
    errorMessage: options.errorMessage,
    metadata: options.metadata,
  });
}























