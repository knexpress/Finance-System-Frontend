// API Client for Backend Communication
import { apiCache } from './api-cache';
import { secureLog } from './secure-logger';
import { getCSRFToken, validateCSRFToken } from './security/csrf-protection';
import { apiRateLimiter, checkRateLimit } from './security/rate-limiter';
import { sanitizeObject } from './security/input-validator';
import { createAuditLog, AuditEventType } from './security/audit-logger';
import { storeAuthToken, getAuthToken, removeAuthToken } from './security/secure-storage';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private pendingRequests: Map<string, Promise<any>> = new Map();

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    // Get token from secure storage if available
    if (typeof window !== 'undefined') {
      this.token = getAuthToken();
    }
  }

  setToken(token: string) {
    this.token = token;
    storeAuthToken(token);
  }

  clearToken() {
    this.token = null;
    removeAuthToken();
  }

  getToken() {
    return this.token;
  }

  // Public method to invalidate cache
  invalidateCache(pattern?: string) {
    apiCache.invalidate(pattern);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    useCache: boolean = true,
    cacheTTL?: number
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    // For GET requests, check cache first
    const isGetRequest = !options.method || options.method === 'GET';
    if (isGetRequest && useCache) {
      const cachedData = apiCache.get(endpoint, options);
      if (cachedData) {
        // Return cached data immediately
        return cachedData;
      }
    }

    // Create a unique key for this request to enable deduplication
    const requestKey = `${options.method || 'GET'}:${endpoint}`;
    
    // If there's already a pending request for this endpoint, return it
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey)!;
    }

    // Execute request directly (no rate limiting queue)
    const requestPromise = this.executeRequest<T>(endpoint, options);

    this.pendingRequests.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;
      
      // Cache successful GET responses
      if (isGetRequest && useCache && result.success) {
        apiCache.set(endpoint, result, options, cacheTTL);
      }
      
      return result;
    } finally {
      // Clean up the pending request
      this.pendingRequests.delete(requestKey);
    }
  }

  private async executeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
      // Rate limiting check
      const rateLimitCheck = checkRateLimit(apiRateLimiter, endpoint);
      if (!rateLimitCheck.allowed) {
        createAuditLog(AuditEventType.RATE_LIMIT_EXCEEDED, `Rate limit exceeded for ${endpoint}`, {
          resource: endpoint,
          success: false,
          metadata: { remaining: rateLimitCheck.remaining, resetTime: rateLimitCheck.resetTime },
        });
        return { 
          success: false, 
          error: 'Too many requests. Please try again later.' 
        };
      }

      // Sanitize request body if present
      // NOTE: Base64 image strings in identityDocuments are handled specially
      // by sanitizeString to avoid truncation
      let sanitizedBody = options.body;
      if (options.body && typeof options.body === 'string') {
        try {
          const bodyData = JSON.parse(options.body);
          const sanitized = sanitizeObject(bodyData);
          sanitizedBody = JSON.stringify(sanitized);
        } catch (e) {
          // If body is not JSON, leave it as is
        }
      }

      const url = `${this.baseUrl}${endpoint}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };

      // Add CSRF token for state-changing operations
      const isStateChanging = options.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method);
      if (isStateChanging && typeof window !== 'undefined') {
        const csrfToken = getCSRFToken();
        if (csrfToken) {
          headers['X-CSRF-Token'] = csrfToken;
        }
      }

      // Add authorization header if token is available
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      // Log request for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        const runtime = typeof window === 'undefined' ? 'server' : 'client';
        console.log(`[API:${runtime}] ${options.method || 'GET'} ${url}`);
        if (options.body) {
          try {
            const bodyData = JSON.parse(options.body as string);
            console.log(`[API:${runtime}] Request Body:`, bodyData);
          } catch (e) {
            console.log(`[API:${runtime}] Request Body:`, options.body);
          }
        }
      }

      const startTime = Date.now();
      const response = await fetch(url, {
        headers,
        ...options,
        body: sanitizedBody,
      });

      // Log response status in development
      if (process.env.NODE_ENV === 'development') {
        const runtime = typeof window === 'undefined' ? 'server' : 'client';
        const durationMs = Date.now() - startTime;
        console.log(`[API:${runtime}] ${options.method || 'GET'} ${url} -> ${response.status} (${durationMs}ms)`);
      }

      if (!response.ok) {
        // Get response text first to check if there's content
        const responseText = await response.text();
        let errorData: any = {};
        
        // Try to parse JSON if there's content
        if (responseText && responseText.trim()) {
          try {
            errorData = JSON.parse(responseText);
          } catch (e) {
            // If JSON parsing fails, use the text as error message
            errorData = { error: responseText || 'Request failed' };
          }
        } else {
          // Empty response - use status text or default message
          errorData = { 
            error: response.statusText || `Request failed with status ${response.status}` 
          };
        }
        
        // Extract error message from various possible formats
        const errorMessage = 
          errorData.error || 
          errorData.message || 
          errorData.detail ||
          (typeof errorData === 'string' ? errorData : null) ||
          response.statusText ||
          `Request failed with status ${response.status}`;
        
        // Sanitize error message to prevent information leakage
        // Don't expose internal server details, stack traces, or sensitive info
        let safeErrorMessage = errorMessage || `Request failed with status ${response.status}`;
        
        // Remove potential sensitive information
        safeErrorMessage = safeErrorMessage
          .replace(/at\s+.*?:\d+:\d+/g, '') // Remove stack traces
          .replace(/file:\/\/\/.*?/g, '') // Remove file paths
          .replace(/password|token|secret|key/gi, '[REDACTED]') // Remove sensitive keywords
          .substring(0, 200); // Limit length
        
        // Log security-relevant errors
        if (response.status === 401) {
          createAuditLog(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, `Unauthorized access attempt: ${endpoint}`, {
            resource: endpoint,
            success: false,
            errorMessage: 'Unauthorized',
          });
        } else if (response.status === 403) {
          createAuditLog(AuditEventType.ACCESS_DENIED, `Access denied: ${endpoint}`, {
            resource: endpoint,
            success: false,
            errorMessage: 'Forbidden',
          });
        }
        
        secureLog.warn('API Error Response', {
          status: response.status,
          statusText: response.statusText,
          url: url.substring(0, 100),
          errorMessage: safeErrorMessage?.substring(0, 200)
        });
        
        return { success: false, error: safeErrorMessage };
      }

      const data = await response.json();
      secureLog.debug('API Success Response', { endpoint: endpoint.substring(0, 50) });
      
      // Log successful state-changing operations
      if (isStateChanging) {
        createAuditLog(AuditEventType.DATA_UPDATE, `API ${options.method} request successful: ${endpoint}`, {
          resource: endpoint,
          success: true,
        });
      }
      
      // For auth endpoints, return the data directly wrapped in success
      if (endpoint.includes('/auth/')) {
        return { success: true, data };
      }
      
      // For other endpoints, if the response already has success/data structure, return it directly
      if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
        return data;
      }
      
      // Otherwise wrap in standard format
      return { success: true, data };
    } catch (error: any) {
      secureLog.error('API request failed', error);
      
      // Log system errors
      createAuditLog(AuditEventType.SYSTEM_ERROR, `API request failed: ${endpoint}`, {
        resource: endpoint,
        success: false,
        errorMessage: error.message?.substring(0, 100),
      });
      
      // Provide more specific error messages (sanitized)
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        return { 
          success: false, 
          error: 'Unable to connect to server. Please check your connection.' 
        };
      }
      
      if (error.name === 'NetworkError' || error.message?.includes('network')) {
        return { success: false, error: 'Network error: Unable to reach the server' };
      }
      
      // Don't expose internal error details
      return { 
        success: false, 
        error: 'An error occurred. Please try again later.' 
      };
    }
  }

  // Authentication
  async login(email: string, password: string) {
    const result = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    // Store token if login is successful
    if (result.success && (result.data as any)?.token) {
      this.setToken((result.data as any).token);
    }
    
    return result;
  }

  // Users
  async getUsers(useCache: boolean = true) {
    return this.request('/users', {}, useCache, 60000); // Cache for 60 seconds
  }

  async createUser(userData: any) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async updateUser(id: string, userData: any) {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  }

  async updatePassword(newPassword: string) {
    return this.request('/users/change-password', {
      method: 'POST',
      body: JSON.stringify({ password: newPassword }),
    });
  }

  async resetUserPassword(userId: string, password?: string) {
    // If password is provided, include it in the body; otherwise send empty object for default reset
    const body = password && password.length > 0 ? { password } : {};
    
    console.log('[API] Reset Password - User ID:', userId);
    console.log('[API] Reset Password - Body:', body);
    
    // Don't use cache for POST requests
    return this.request(`/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, false); // useCache = false
  }

  async deleteUser(id: string) {
    return this.request(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  // Departments
  async getDepartments(useCache: boolean = true) {
    return this.request('/departments', {}, useCache, 300000); // Cache for 5 minutes (departments rarely change)
  }

  async createDepartment(departmentData: any) {
    return this.request('/departments', {
      method: 'POST',
      body: JSON.stringify(departmentData),
    });
  }

  // Employees
  async getEmployees(useCache: boolean = true) {
    return this.request('/employees', {}, useCache, 60000); // Cache for 60 seconds
  }

  async getAvailableEmployees(useCache: boolean = true) {
    return this.request('/employees/available', {}, useCache, 60000); // Cache for 60 seconds
  }

  async createEmployee(employeeData: any) {
    return this.request('/employees', {
      method: 'POST',
      body: JSON.stringify(employeeData),
    });
  }

  async updateEmployee(id: string, employeeData: any) {
    return this.request(`/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(employeeData),
    });
  }

  async deleteEmployee(id: string) {
    return this.request(`/employees/${id}`, {
      method: 'DELETE',
    });
  }

  // Clients
  async getClients(useCache: boolean = true) {
    return this.request('/clients', {}, useCache, 60000); // Cache for 60 seconds
  }

  async createClient(clientData: any) {
    return this.request('/clients', {
      method: 'POST',
      body: JSON.stringify(clientData),
    });
  }

  async updateClient(id: string, clientData: any) {
    return this.request(`/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(clientData),
    });
  }

  async deleteClient(id: string) {
    return this.request(`/clients/${id}`, {
      method: 'DELETE',
    });
  }

  // Requests
  async getRequests() {
    return this.request('/requests');
  }

  async createRequest(requestData: any) {
    return this.request('/requests', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  }

  async updateRequestStatus(id: string, statusData: any) {
    return this.request(`/requests/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(statusData),
    });
  }

  async addChatMessage(id: string, messageData: any) {
    return this.request(`/requests/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify(messageData),
    });
  }

  // Tickets
  async getTickets() {
    return this.request('/tickets');
  }

  // Activity last-updated (for per-tab new indicators)
  // This endpoint is optional - gracefully handles 404 if not implemented
  async getActivityLastUpdated() {
    const result = await this.request('/activity/last-updated', {}, false); // no cache
    // If endpoint returns 404, treat it as optional and return success: false
    // This prevents console errors for missing optional endpoints
    if (!result.success && result.error && (
      result.error.includes('404') || 
      result.error.includes('Not Found') ||
      result.error.includes('not found')
    )) {
      // Silently handle 404 - this endpoint is optional
      return { success: false, error: undefined, data: undefined };
    }
    return result;
  }

  // Search AWB number by customer first name and last name
  async searchAwbByName(firstName: string, lastName: string) {
    return this.request('/bookings/search-awb-by-name', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName }),
    }, false); // Don't cache search results
  }

  // Search bookings by AWB number
  async searchBookingsByAwb(awb: string, useCache: boolean = false) {
    if (!awb || !awb.trim()) {
      return { success: false, error: 'AWB number is required' };
    }
    return this.request(`/bookings/search-awb?awb=${encodeURIComponent(awb.trim())}`, {}, useCache, 10000); // Cache for 10 seconds
  }

  async createTicket(ticketData: any) {
    return this.request('/tickets', {
      method: 'POST',
      body: JSON.stringify(ticketData),
    });
  }

  async updateTicketStatus(id: string, statusData: any) {
    return this.request(`/tickets/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(statusData),
    });
  }

  // Internal Requests
  async getInternalRequests() {
    return this.request('/internal-requests');
  }

  async createInternalRequest(internalRequestData: any) {
    return this.request('/internal-requests', {
      method: 'POST',
      body: JSON.stringify(internalRequestData),
    });
  }

  async updateInternalRequestStatus(id: string, statusData: any) {
    return this.request(`/internal-requests/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(statusData),
    });
  }

  async assignInternalRequest(id: string, assignData: any) {
    return this.request(`/internal-requests/${id}/assign`, {
      method: 'PUT',
      body: JSON.stringify(assignData),
    });
  }

  async getInternalRequestsByDepartment(departmentId: string) {
    return this.request(`/internal-requests/department/${departmentId}`);
  }

  // Reports
  async getReports() {
    return this.request('/reports');
  }

  async createReport(reportData: any) {
    return this.request('/reports', {
      method: 'POST',
      body: JSON.stringify(reportData),
    });
  }

  // Cash Tracker
  async getCashTransactions() {
    return this.request('/cash-tracker');
  }

  async createCashTransaction(transactionData: any) {
    return this.request('/cash-tracker', {
      method: 'POST',
      body: JSON.stringify(transactionData),
    });
  }

  async getCashFlowSummary() {
    return this.request('/cash-tracker/summary');
  }

  // Invoice Requests
  async getInvoiceRequests(page?: number, limit?: number, filters?: { status?: string; search?: string }, useCache: boolean = true, fields?: string[]) {
    // If pagination parameters are provided, use paginated endpoint
    if (page !== undefined && limit !== undefined) {
      const queryParams = new URLSearchParams();
      queryParams.append('page', page.toString());
      queryParams.append('limit', limit.toString());
      if (filters?.status && filters.status !== 'all') {
        queryParams.append('status', filters.status);
      }
      if (filters?.search) {
        queryParams.append('search', filters.search);
      }
      // Request only minimal fields for faster loading (if fields parameter provided)
      if (fields && fields.length > 0) {
        queryParams.append('fields', fields.join(','));
      }
      
      const queryString = queryParams.toString();
      const endpoint = `/invoice-requests?${queryString}`;
      return this.request(endpoint, {}, useCache, 10000); // Cache for 10 seconds
    }
    
    // Backward compatibility: return all requests without pagination
    return this.request('/invoice-requests', {}, useCache, 10000); // Cache for 10 seconds
  }

  // Fetch all invoice requests across all pages (for invoice-requests page)
  // Optimized: Fetch single page of invoice requests (for pagination)
  async getInvoiceRequestsPage(
    page: number = 1, 
    limit: number = 50,
    filters?: { status?: string; search?: string }, 
    useCache: boolean = true, 
    fields?: string[]
  ) {
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('limit', limit.toString());
    
    if (filters?.status && filters.status !== 'all') {
      queryParams.append('status', filters.status);
    }
    if (filters?.search) {
      queryParams.append('search', filters.search);
    }
    // Request only minimal fields for faster loading (if fields parameter provided)
    if (fields && fields.length > 0) {
      queryParams.append('fields', fields.join(','));
    }
    
    const queryString = queryParams.toString();
    const endpoint = `/invoice-requests?${queryString}`;
    
    // Reduced cache time for faster updates (5 seconds instead of 10)
    const result = await this.request(endpoint, {}, useCache, 5000);
    
    if (result.success) {
      const pagination = (result as any).pagination;
      const data = result.data;
      
      // Handle different response formats
      if (pagination && Array.isArray(data)) {
        return {
          success: true,
          data: data,
          pagination: pagination
        };
      } else if (data && typeof data === 'object' && (data as any).pagination) {
        const responseData = data as any;
        return {
          success: true,
          data: Array.isArray(responseData.data) ? responseData.data : [],
          pagination: responseData.pagination
        };
      } else if (Array.isArray(data)) {
        // Non-paginated response (backward compatibility)
        return {
          success: true,
          data: data,
          pagination: {
            page: 1,
            limit: data.length,
            total: data.length,
            pages: 1
          }
        };
      }
    }
    
    return {
      success: false,
      error: result.error || 'Failed to fetch invoice requests',
      data: [],
      pagination: null
    };
  }

  // Legacy method: Fetch all pages (use sparingly, only when needed)
  async getAllInvoiceRequests(filters?: { status?: string; search?: string }, useCache: boolean = true, fields?: string[]) {
    const allRequests: any[] = [];
    let currentPage = 1;
    let totalPages = 1;
    const limit = 50; // Fetch 50 per page for better performance
    
    do {
      const queryParams = new URLSearchParams();
      queryParams.append('page', currentPage.toString());
      queryParams.append('limit', limit.toString());
      
      if (filters?.status && filters.status !== 'all') {
        queryParams.append('status', filters.status);
      }
      if (filters?.search) {
        queryParams.append('search', filters.search);
      }
      // Request only minimal fields for faster loading (if fields parameter provided)
      if (fields && fields.length > 0) {
        queryParams.append('fields', fields.join(','));
      }
      
      const queryString = queryParams.toString();
      const endpoint = `/invoice-requests?${queryString}`;
      
      const result = await this.request(endpoint, {}, useCache && currentPage === 1, 10000);
      
      if (result.success) {
        // Check if response has pagination at root level
        const pagination = (result as any).pagination;
        const data = result.data;
        
        if (pagination && Array.isArray(data)) {
          // Paginated response: { success: true, data: [...], pagination: {...} }
          allRequests.push(...data);
          totalPages = pagination.pages || 1;
          currentPage++;
        } else if (data && typeof data === 'object' && (data as any).pagination) {
          // Paginated response: { success: true, data: { data: [...], pagination: {...} } }
          const responseData = data as any;
          if (Array.isArray(responseData.data)) {
            allRequests.push(...responseData.data);
            totalPages = responseData.pagination?.pages || 1;
            currentPage++;
          } else {
            break; // No more data
          }
        } else if (Array.isArray(data)) {
          // Non-paginated response (backward compatibility)
          allRequests.push(...data);
          break; // No pagination, we got all data
        } else {
          break; // No data or unexpected format
        }
      } else {
        // Error occurred, break the loop
        console.error('Error fetching invoice requests page', currentPage, ':', result.error);
        break;
      }
    } while (currentPage <= totalPages);
    
    return {
      success: true,
      data: allRequests,
      pagination: {
        total: allRequests.length,
        pages: totalPages
      }
    };
  }

  async getInvoiceRequestsByStatus(status: string) {
    return this.request(`/invoice-requests/status/${status}`);
  }

  async getInvoiceRequestsByDeliveryStatus(deliveryStatus: string) {
    return this.request(`/invoice-requests/delivery-status/${deliveryStatus}`);
  }

  async getInvoiceRequest(id: string) {
    return this.request(`/invoice-requests/${id}`);
  }

  async createInvoiceRequest(invoiceRequestData: any) {
    return this.request('/invoice-requests', {
      method: 'POST',
      body: JSON.stringify(invoiceRequestData),
    });
  }

  async updateInvoiceRequest(id: string, invoiceRequestData: any) {
    return this.request(`/invoice-requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(invoiceRequestData),
    });
  }

  async updateInvoiceRequestStatus(id: string, statusData: any) {
    return this.request(`/invoice-requests/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(statusData),
    });
  }

  async cancelInvoiceRequest(id: string) {
    return this.request(`/invoice-requests/${id}/cancel`, {
      method: 'POST',
    });
  }

  async updateDeliveryStatus(id: string, deliveryStatusData: any) {
    return this.request(`/invoice-requests/${id}/delivery-status`, {
      method: 'PUT',
      body: JSON.stringify(deliveryStatusData),
    });
  }

  async updateWeight(id: string, weightData: any) {
    return this.request(`/invoice-requests/${id}/weight`, {
      method: 'PUT',
      body: JSON.stringify(weightData),
    });
  }

  async updateVerification(id: string, verificationData: any) {
    return this.request(`/invoice-requests/${id}/verification`, {
      method: 'PUT',
      body: JSON.stringify(verificationData),
    });
  }

  async completeVerification(id: string, verificationData: any) {
    return this.request(`/invoice-requests/${id}/complete-verification`, {
      method: 'PUT',
      body: JSON.stringify(verificationData),
    });
  }

  async reverifyVerification(id: string, verificationData: any) {
    return this.request(`/invoice-requests/${id}/reverify`, {
      method: 'PUT',
      body: JSON.stringify(verificationData),
    });
  }

  async deleteInvoiceRequest(id: string) {
    return this.request(`/invoice-requests/${id}`, {
      method: 'DELETE',
    });
  }

  // Collections
  async getCollections() {
    return this.request('/collections');
  }

  async getCollection(id: string) {
    return this.request(`/collections/${id}`);
  }

  async updateCollectionStatus(id: string, statusData: any) {
    return this.request(`/collections/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(statusData),
    });
  }

  async createCollection(collectionData: any) {
    return this.request('/collections', {
      method: 'POST',
      body: JSON.stringify(collectionData),
    });
  }

  async deleteCollection(id: string) {
    return this.request(`/collections/${id}`, {
      method: 'DELETE',
    });
  }

  async getCollectionsSummary() {
    return this.request('/collections/summary/stats');
  }

  // Notifications
  // Disabled: Notification endpoints removed
  async getNotificationCounts() {
    return { success: true, data: { invoices: 0, chat: 0, tickets: 0, invoiceRequests: 0, requests: 0 } };
  }

  async markAsViewed(type: string, itemId: string) {
    // Disabled: No API call
    return { success: true };
  }

  async markAllAsViewed(type: string) {
    // Disabled: No API call
    return { success: true };
  }

  // Get full invoice request details by AWB (for verification form)
  async getInvoiceRequestByAwb(awb: string, useCache: boolean = false) {
    // Don't cache this since it's called on-demand when user opens verification
    return this.request(`/invoice-requests/by-awb/${encodeURIComponent(awb)}`, {}, useCache, 0);
  }

  // Get invoice request with full details including all verification and booking data
  // This endpoint should return complete invoice request data with all nested information
  // CRITICAL: Must include verification object with total_kg, number_of_boxes, and all verification fields
  // useCache should be false to ensure fresh data from database
  async getInvoiceRequestDetails(id: string, useCache: boolean = false) {
    // Always bypass cache for details to ensure we get latest verification data from database
    // The endpoint should return: request, verification (with total_kg), shipment, booking, etc.
    return this.request(`/invoice-requests/${id}/details`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, false, 0); // Force no cache (false) to get fresh data from database
  }

  // Invoices
  // Invoices (Unified)
  async getInvoicesUnified(useCache: boolean = true) {
    return this.request('/invoices-unified', {}, useCache, 30000); // Cache for 30 seconds
  }

  async getInvoiceUnified(id: string) {
    return this.request(`/invoices-unified/${id}`);
  }

  async remitInvoiceUnified(id: string) {
    return this.request(`/invoices-unified/${id}/remit`, {
      method: 'PATCH',
    });
  }

  async cancelInvoiceUnified(id: string, reason?: string) {
    return this.request(`/invoices-unified/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || '' }),
    });
  }

  async createInvoiceUnified(invoiceData: any) {
    return this.request('/invoices-unified', {
      method: 'POST',
      body: JSON.stringify(invoiceData),
    });
  }

  async updateInvoiceUnified(id: string, invoiceData: any) {
    return this.request(`/invoices-unified/${id}`, {
      method: 'PUT',
      body: JSON.stringify(invoiceData),
    });
  }

  async updateInvoiceStatusUnified(id: string, statusData: any) {
    return this.request(`/invoices-unified/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(statusData),
    });
  }

  // Shipment Status Updates
  async updateShipmentStatus(requestId: string, statusData: any) {
    return this.request(`/unified-shipment-requests/${requestId}/status`, {
      method: 'PUT',
      body: JSON.stringify(statusData),
    });
  }

  async deleteInvoiceUnified(id: string) {
    return this.request(`/invoices-unified/${id}`, {
      method: 'DELETE',
    });
  }

  async getInvoicesByClientUnified(clientId: string) {
    return this.request(`/invoices-unified/client/${clientId}`);
  }

  async getInvoicesByStatusUnified(status: string) {
    return this.request(`/invoices-unified/status/${status}`);
  }

  // Invoices (Legacy)
  async getInvoices() {
    return this.request('/invoices');
  }

  async createInvoice(invoiceData: any) {
    return this.request('/invoices', {
      method: 'POST',
      body: JSON.stringify(invoiceData),
    });
  }

  async updateInvoice(id: string, invoiceData: any) {
    return this.request(`/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(invoiceData),
    });
  }

  async deleteInvoice(id: string) {
    return this.request(`/invoices/${id}`, {
      method: 'DELETE',
    });
  }

  // Performance
  async getDepartmentPerformance(department: string) {
    return this.request(`/performance/department/${department}`);
  }

  // ========================================
  // QR PAYMENT COLLECTION SYSTEM
  // ========================================

  // Drivers
  async getDrivers() {
    return this.request('/drivers');
  }

  async getDriver(id: string) {
    return this.request(`/drivers/${id}`);
  }

  async createDriver(driverData: any) {
    return this.request('/drivers', {
      method: 'POST',
      body: JSON.stringify(driverData),
    });
  }

  async updateDriver(id: string, driverData: any) {
    return this.request(`/drivers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(driverData),
    });
  }

  async deleteDriver(id: string) {
    return this.request(`/drivers/${id}`, {
      method: 'DELETE',
    });
  }

  // Delivery Assignments
  async getDeliveryAssignments() {
    return this.request('/delivery-assignments');
  }

  async getDeliveryAssignment(id: string) {
    return this.request(`/delivery-assignments/${id}`);
  }

  async createDeliveryAssignment(assignmentData: any) {
    return this.request('/delivery-assignments', {
      method: 'POST',
      body: JSON.stringify(assignmentData),
    });
  }

  async updateDeliveryAssignment(id: string, assignmentData: any) {
    return this.request(`/delivery-assignments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(assignmentData),
    });
  }

  async updateDeliveryAssignmentByQR(qrCode: string, assignmentData: any) {
    return this.request(`/delivery-assignments/qr/${qrCode}/status`, {
      method: 'PUT',
      body: JSON.stringify(assignmentData),
    });
  }

  async getDeliveryAssignmentByInvoice(invoiceId: string) {
    return this.request(`/delivery-assignments/by-invoice/${invoiceId}`);
  }

  async getDeliveryAssignmentByQR(qrCode: string) {
    return this.request(`/delivery-assignments/qr/${qrCode}`);
  }

  async processQRPayment(qrCode: string, paymentData: any) {
    return this.request(`/delivery-assignments/qr/${qrCode}/payment`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  async getDriverAssignments(driverId: string) {
    return this.request(`/delivery-assignments/driver/${driverId}`);
  }

  async syncDeliveryAssignmentToEmpost(assignmentId: string) {
    return this.request(`/delivery-assignments/${assignmentId}/sync-empost`, {
      method: 'POST',
    });
  }

  // QR Payment Sessions
  async getQRPaymentSessions() {
    return this.request('/qr-payment-sessions');
  }

  async getQRPaymentSession(id: string) {
    return this.request(`/qr-payment-sessions/${id}`);
  }

  async getQRPaymentSessionByQR(qrCode: string) {
    return this.request(`/qr-payment-sessions/qr/${qrCode}`);
  }

  async getAssignmentQRPaymentSessions(assignmentId: string) {
    return this.request(`/qr-payment-sessions/assignment/${assignmentId}`);
  }

  async updateQRPaymentSession(id: string, sessionData: any) {
    return this.request(`/qr-payment-sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(sessionData),
    });
  }

  async cancelQRPaymentSession(id: string) {
    return this.request(`/qr-payment-sessions/${id}`, {
      method: 'DELETE',
    });
  }

  // ========================================
  // INTER-DEPARTMENT CHAT API
  // ========================================

  // Chat Rooms
  async getChatRooms(userId?: string, departmentId?: string) {
    let url = '/chat/rooms';
    const params = new URLSearchParams();
    if (userId) params.append('user_id', userId);
    if (departmentId) params.append('department_id', departmentId);
    if (params.toString()) url += `?${params.toString()}`;
    return this.request(url);
  }

  async createDirectChatRoom(userId1: string, userId2: string) {
    return this.request('/chat/rooms/direct', {
      method: 'POST',
      body: JSON.stringify({ user_id_1: userId1, user_id_2: userId2 }),
    });
  }

  async getChatRoom(roomId: string) {
    return this.request(`/chat/rooms/${roomId}`);
  }

  async createChatRoom(roomData: {
    name: string;
    description?: string;
    department_ids: string[];
    created_by?: string;
  }) {
    return this.request('/chat/rooms', {
      method: 'POST',
      body: JSON.stringify(roomData),
    });
  }

  async updateChatRoom(roomId: string, roomData: {
    name?: string;
    description?: string;
    department_ids?: string[];
    is_active?: boolean;
  }) {
    return this.request(`/chat/rooms/${roomId}`, {
      method: 'PUT',
      body: JSON.stringify(roomData),
    });
  }

  async deleteChatRoom(roomId: string) {
    return this.request(`/chat/rooms/${roomId}`, {
      method: 'DELETE',
    });
  }

  // Chat Messages
  async getChatMessages(roomId: string, limit?: number, before?: string) {
    let url = `/chat/rooms/${roomId}/messages`;
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (before) params.append('before', before);
    if (params.toString()) url += `?${params.toString()}`;
    return this.request(url);
  }

  async sendChatMessage(roomId: string, messageData: {
    sender_id: string;
    message: string;
    message_type?: 'text' | 'file' | 'image' | 'system';
    reply_to?: string;
  }) {
    return this.request(`/chat/rooms/${roomId}/messages`, {
      method: 'POST',
      body: JSON.stringify(messageData),
    });
  }

  async uploadChatFile(roomId: string, file: File, senderId: string, replyTo?: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sender_id', senderId);
    formData.append('message_type', file.type.startsWith('image/') ? 'image' : 'file');
    if (replyTo) {
      formData.append('reply_to', replyTo);
    }
    
    const url = `${this.baseUrl}/chat/rooms/${roomId}/messages/upload`;
    const headers: Record<string, string> = {};
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'File upload failed' };
    }
    
    return { success: true, data };
  }

  async searchChatMessages(roomId: string, query: string, limit: number = 50) {
    let url = `/chat/rooms/${roomId}/messages/search`;
    const params = new URLSearchParams();
    params.append('q', query);
    params.append('limit', limit.toString());
    url += `?${params.toString()}`;
    return this.request(url);
  }

  async markMessageAsRead(messageId: string, employeeId: string) {
    return this.request(`/chat/messages/${messageId}/read`, {
      method: 'PUT',
      body: JSON.stringify({ employee_id: employeeId }),
    });
  }

  async markRoomAsRead(roomId: string, employeeId: string) {
    return this.request(`/chat/rooms/${roomId}/read`, {
      method: 'PUT',
      body: JSON.stringify({ employee_id: employeeId }),
    });
  }

  async getUnreadCount(employeeId: string, roomId?: string) {
    let url = `/chat/unread-count?employee_id=${employeeId}`;
    if (roomId) url += `&room_id=${roomId}`;
    return this.request(url);
  }

  async getChatHistory(roomId: string, page?: number, limit?: number) {
    let url = `/chat/rooms/${roomId}/history`;
    const params = new URLSearchParams();
    if (page) params.append('page', page.toString());
    if (limit) params.append('limit', limit.toString());
    if (params.toString()) url += `?${params.toString()}`;
    return this.request(url);
  }

  async deleteChatMessage(messageId: string) {
    return this.request(`/chat/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  // Available Users for Chat
  async getAvailableUsers(currentUserId: string) {
    return this.request(`/chat/users?current_user_id=${currentUserId}`);
  }

  // Payment Remittances
  async getPaymentRemittances() {
    return this.request('/payment-remittances');
  }

  async getPaymentRemittance(id: string) {
    return this.request(`/payment-remittances/${id}`);
  }

  async createPaymentRemittance(remittanceData: any) {
    return this.request('/payment-remittances', {
      method: 'POST',
      body: JSON.stringify(remittanceData),
    });
  }

  async updatePaymentRemittance(id: string, remittanceData: any) {
    return this.request(`/payment-remittances/${id}`, {
      method: 'PUT',
      body: JSON.stringify(remittanceData),
    });
  }

  async getDriverRemittances(driverId: string) {
    return this.request(`/payment-remittances/driver/${driverId}`);
  }

  async getPendingRemittances() {
    return this.request('/payment-remittances/pending');
  }

  async confirmPaymentRemittance(id: string) {
    return this.request(`/payment-remittances/${id}/confirm`, {
      method: 'POST',
    });
  }

  // Bookings
  async getBookings(filters?: { status?: string; awb?: string }, useCache: boolean = true) {
    // Build query string from filters
    const queryParams = new URLSearchParams();
    if (filters?.status) queryParams.append('status', filters.status);
    if (filters?.awb) queryParams.append('awb', filters.awb);
    
    const queryString = queryParams.toString();
    const endpoint = queryString ? `/bookings?${queryString}` : '/bookings';
    return this.request(endpoint, {}, useCache, 30000); // Cache for 30 seconds
  }

  // Fetch all pages of bookings (handles backend pagination)
  async getAllBookings(filters?: { status?: string; awb?: string }, useCache: boolean = true) {
    const allBookings: any[] = [];
    let currentPage = 1;
    let totalPages = 1;
    
    do {
      // Build query string from filters and page
      const queryParams = new URLSearchParams();
      if (filters?.status) queryParams.append('status', filters.status);
      if (filters?.awb) queryParams.append('awb', filters.awb);
      queryParams.append('page', currentPage.toString());
      
      const queryString = queryParams.toString();
      const endpoint = `/bookings?${queryString}`;
      
      const result = await this.request(endpoint, {}, useCache && currentPage === 1, 30000);
      
      if (result.success) {
        // Check if response has pagination at root level
        const pagination = (result as any).pagination;
        const data = result.data;
        
        if (pagination && Array.isArray(data)) {
          // Paginated response: { success: true, data: [...], pagination: {...} }
          allBookings.push(...data);
          totalPages = pagination.pages || 1;
          currentPage++;
        } else if (data && typeof data === 'object' && (data as any).pagination) {
          // Paginated response: { success: true, data: { data: [...], pagination: {...} } }
          const responseData = data as any;
          if (Array.isArray(responseData.data)) {
            allBookings.push(...responseData.data);
          }
          totalPages = responseData.pagination?.pages || 1;
          currentPage++;
        } else if (Array.isArray(data)) {
          // Non-paginated response (backward compatibility)
          allBookings.push(...data);
          break;
        } else {
          break; // Unknown format
        }
      } else {
        break; // Stop on error
      }
    } while (currentPage <= totalPages);
    
    return {
      success: true,
      data: allBookings
    };
  }

  async getBooking(id: string, useCache: boolean = true) {
    return this.request(`/bookings/${id}`, {}, useCache, 60000); // Cache for 60 seconds
  }

  // Get booking with full details including all identityDocuments images
  // This endpoint should return complete booking data with all nested images
  async getBookingForReview(id: string, useCache: boolean = false) {
    return this.request(`/bookings/${id}/review`, {}, useCache, 0); // No cache for review data
  }

  async getBookingsByStatus(reviewStatus: string, filters?: { awb?: string }, useCache: boolean = true) {
    // Build query string from filters
    const queryParams = new URLSearchParams();
    if (filters?.awb) queryParams.append('awb', filters.awb);
    
    const queryString = queryParams.toString();
    const endpoint = queryString ? `/bookings/status/${reviewStatus}?${queryString}` : `/bookings/status/${reviewStatus}`;
    return this.request(endpoint, {}, useCache, 30000); // Cache for 30 seconds
  }

  // Fetch all pages of bookings by status (handles backend pagination)
  async getAllBookingsByStatus(reviewStatus: string, filters?: { awb?: string }, useCache: boolean = true) {
    const allBookings: any[] = [];
    let currentPage = 1;
    let totalPages = 1;
    
    do {
      // Build query string from filters and page
      const queryParams = new URLSearchParams();
      if (filters?.awb) queryParams.append('awb', filters.awb);
      queryParams.append('page', currentPage.toString());
      
      const queryString = queryParams.toString();
      const endpoint = queryString 
        ? `/bookings/status/${reviewStatus}?${queryString}` 
        : `/bookings/status/${reviewStatus}?page=${currentPage}`;
      
      const result = await this.request(endpoint, {}, useCache && currentPage === 1, 30000);
      
      if (result.success) {
        // Check if response has pagination at root level
        const pagination = (result as any).pagination;
        const data = result.data;
        
        if (pagination && Array.isArray(data)) {
          // Paginated response: { success: true, data: [...], pagination: {...} }
          allBookings.push(...data);
          totalPages = pagination.pages || 1;
          currentPage++;
        } else if (data && typeof data === 'object' && (data as any).pagination) {
          // Paginated response: { success: true, data: { data: [...], pagination: {...} } }
          const responseData = data as any;
          if (Array.isArray(responseData.data)) {
            allBookings.push(...responseData.data);
          }
          totalPages = responseData.pagination?.pages || 1;
          currentPage++;
        } else if (Array.isArray(data)) {
          // Non-paginated response (backward compatibility)
          allBookings.push(...data);
          break;
        } else {
          break; // Unknown format
        }
      } else {
        break; // Stop on error
      }
    } while (currentPage <= totalPages);
    
    return {
      success: true,
      data: allBookings
    };
  }

  // Create a new booking (for Sales department)
  async createBooking(bookingData: any) {
    return this.request('/bookings', {
      method: 'POST',
      body: JSON.stringify(bookingData),
    });
  }

  async reviewBooking(id: string, reviewData: { reviewed_by_employee_id: string }) {
    return this.request(`/bookings/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });
  }

  async updateBookingStatus(id: string, statusData: { review_status: string; reviewed_by_employee_id?: string; reason?: string }) {
    return this.request(`/bookings/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(statusData),
    });
  }

  async updateBookingShipmentStatusHistory(bookingId: string, shipmentStatusHistory: string) {
    return this.request(`/bookings/${bookingId}/shipment-status-history`, {
      method: 'PUT',
      body: JSON.stringify({ shipment_status_history: shipmentStatusHistory }),
    });
  }

  // Get bookings with verified invoices (for cargo status tracking)
  // Optimized to only fetch fields needed for display
  async getBookingsWithVerifiedInvoices(useCache: boolean = true, fields?: string[]) {
    // Define minimal fields needed for review-requests page display
    const defaultFields = [
      '_id',
      'awb',
      'tracking_code',
      'awb_number',
      'customer_name',
      'receiver_name',
      'origin_place',
      'destination_place',
      'shipment_status',
      'batch_no', // Legacy field, kept for backward compatibility
      'invoice_number',
      'invoice.batch_number', // Batch number from invoices collection
      'service_code',
      'service',
      'sender.completeAddress',
      'sender.country',
      'receiver.completeAddress',
      'receiver.country',
      'request_id.service_code',
      'request_id.service',
      'request_id.awb',
      'request_id.tracking_code',
      'request_id.awb_number',
      'booking.service_code',
      'booking.service',
      'booking.awb',
      'booking.tracking_code',
      'booking.awb_number'
    ];
    
    const fieldsToFetch = fields || defaultFields;
    const fieldsParam = fieldsToFetch.join(',');
    const endpoint = `/bookings/verified-invoices?fields=${encodeURIComponent(fieldsParam)}`;
    
    return this.request(endpoint, {}, useCache, 30000);
  }

  // Update booking shipment status
  async updateBookingShipmentStatus(id: string, statusData: { shipment_status: string; updated_by?: string; notes?: string }) {
    return this.request(`/bookings/${id}/shipment-status`, {
      method: 'PUT',
      body: JSON.stringify(statusData),
    });
  }

  // Batch update shipment status for multiple bookings
  async batchUpdateShipmentStatus(bookingIds: string[], statusData: { shipment_status: string; batch_no?: string; updated_by?: string; notes?: string }) {
    return this.request('/bookings/batch/shipment-status', {
      method: 'PUT',
      body: JSON.stringify({ booking_ids: bookingIds, ...statusData }),
    });
  }

  // Create batch and assign to bookings
  async createBatch(batchData: { batch_no: string; booking_ids: string[]; created_by?: string; notes?: string }) {
    return this.request('/bookings/batch/create', {
      method: 'POST',
      body: JSON.stringify(batchData),
    });
  }

  // Get bookings by batch number
  async getBookingsByBatch(batchNo: string, useCache: boolean = true) {
    return this.request(`/bookings/batch/${batchNo}`, {}, useCache, 30000);
  }

  // Health check
  async healthCheck() {
    return this.request('/health');
  }

  // Price Brackets Management
  async getPriceBrackets(route: 'PH_TO_UAE' | 'UAE_TO_PH', useCache: boolean = false) {
    // Don't use cache for price brackets to ensure real-time updates
    return this.request(`/price-brackets/${route}`, {}, useCache, 0);
  }

  async updatePriceBrackets(route: 'PH_TO_UAE' | 'UAE_TO_PH', brackets: any[]) {
    // Invalidate cache after update to ensure fresh data
    this.invalidateCache('/price-brackets');
    return this.request(
      `/price-brackets/${route}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ brackets }),
      },
      false // Don't cache PUT requests
    );
  }
}

export const apiClient = new ApiClient();
export default apiClient;
