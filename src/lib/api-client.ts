// API Client for Backend Communication
import { apiCache } from './api-cache';
import { secureLog } from './secure-logger';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private pendingRequests: Map<string, Promise<any>> = new Map();

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    // Get token from localStorage if available
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('authToken');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('authToken', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
    }
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
      const url = `${this.baseUrl}${endpoint}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };

      // Add authorization header if token is available
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      // Log request for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] ${options.method || 'GET'} ${url}`);
        if (options.body) {
          try {
            const bodyData = JSON.parse(options.body as string);
            console.log('[API] Request Body:', bodyData);
          } catch (e) {
            console.log('[API] Request Body:', options.body);
          }
        }
      }

      const response = await fetch(url, {
        headers,
        ...options,
      });

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
        const safeErrorMessage = errorMessage || `Request failed with status ${response.status}`;
        
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
      console.warn('API request failed:', error);
      
      // Provide more specific error messages
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        return { 
          success: false, 
          error: `Unable to connect to server. Please check if the API is running at ${this.baseUrl}` 
        };
      }
      
      if (error.name === 'NetworkError' || error.message?.includes('network')) {
        return { success: false, error: 'Network error: Unable to reach the server' };
      }
      
      return { 
        success: false, 
        error: error.message || 'Network error' 
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

  // CSV Upload
  async uploadCSV(file: File) {
    const formData = new FormData();
    formData.append('csvFile', file);
    
    // Use fetch directly for file uploads to let browser set Content-Type with boundary
    const url = `${this.baseUrl}/csv-upload/bulk-create`;
    const headers: Record<string, string> = {};
    
    // Add authorization header if token is available
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
      return { success: false, error: data.error || 'Upload failed' };
    }
    
    return data;
  }

  async downloadCSVTemplate() {
    // Use fetch directly for downloads
    const url = `${this.baseUrl}/csv-upload/template`;
    const headers: Record<string, string> = {};
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error('Failed to download template');
    }
    
    const text = await response.text();
    return { success: true, data: text };
  }

  // Historical CSV Upload (for old data Jan 1 - Sep 29)
  async uploadHistoricalCSV(file: File) {
    // Validate file is CSV
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return { success: false, error: 'Only CSV files are allowed' };
    }

    // Create FormData with ONLY the CSV file
    const formData = new FormData();
    // Use 'csvFile' as per API specification (both 'csvFile' and 'file' are accepted, but 'csvFile' is preferred)
    formData.append('csvFile', file); // Only CSV file, no other data
    
    // Use fetch directly for file uploads to let browser set Content-Type with boundary
    const url = `${this.baseUrl}/csv-upload/historical`;
    const headers: Record<string, string> = {};
    
    // Add authorization header if token is available
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    // Note: Do NOT set Content-Type header - browser will set it with boundary for multipart/form-data
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData, // Only contains the CSV file
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || data.details || 'Historical upload failed' };
    }
    
    return data;
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

  // Get bookings with verified invoices (for cargo status tracking)
  async getBookingsWithVerifiedInvoices(useCache: boolean = true) {
    return this.request('/bookings/verified-invoices', {}, useCache, 30000);
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
