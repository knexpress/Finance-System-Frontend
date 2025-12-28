// Unified API Client for Backend Communication
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

class UnifiedApiClient {
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

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    // Create a unique key for this request to enable deduplication
    const requestKey = `${options.method || 'GET'}:${endpoint}`;
    
    // If there's already a pending request for this endpoint, return it
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey)!;
    }

    const requestPromise = this.executeRequest<T>(endpoint, options);
    this.pendingRequests.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;
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

      const response = await fetch(url, {
        headers,
        ...options,
      });

      if (!response.ok) {
        // Handle rate limiting specifically
        if (response.status === 429) {
          console.log('Rate limited, request will be retried later');
          // Wait a bit before returning to avoid immediate retries
          await new Promise(resolve => setTimeout(resolve, 1000));
          return { success: false, error: 'Rate limited' };
        }
        
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        return { success: false, error: errorData.error || 'Request failed' };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('API request failed:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // ========================================
  // AUTHENTICATION
  // ========================================

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

  // ========================================
  // UNIFIED SHIPMENT REQUESTS
  // ========================================

  // Get all shipment requests with filtering
  async getShipmentRequests(params?: {
    page?: number;
    limit?: number;
    status?: string;
    delivery_status?: string;
    invoice_status?: string;
    payment_status?: string;
    department?: string;
    created_by?: string;
    assigned_to?: string;
    origin_country?: string;
    destination_country?: string;
    customer_name?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }) {
    const queryParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }
    
    const endpoint = `/shipment-requests${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request(endpoint);
  }

  // Get shipment request by ID
  async getShipmentRequest(id: string) {
    return this.request(`/shipment-requests/${id}`);
  }

  // Create new shipment request
  async createShipmentRequest(shipmentData: any) {
    return this.request('/shipment-requests', {
      method: 'POST',
      body: JSON.stringify(shipmentData),
    });
  }

  // Update shipment request
  async updateShipmentRequest(id: string, updateData: any) {
    return this.request(`/shipment-requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  }

  // Update shipment request status
  async updateShipmentRequestStatus(id: string, statusData: {
    request_status?: string;
    delivery_status?: string;
    invoice_status?: string;
    payment_status?: string;
  }) {
    return this.request(`/shipment-requests/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(statusData),
    });
  }

  // Update delivery status
  async updateDeliveryStatus(id: string, deliveryData: {
    delivery_status: string;
    notes?: string;
    internal_notes?: string;
  }) {
    return this.request(`/shipment-requests/${id}/delivery-status`, {
      method: 'PUT',
      body: JSON.stringify(deliveryData),
    });
  }

  // Update financial information
  async updateFinancialInfo(id: string, financialData: {
    invoice_amount?: number;
    base_rate?: number;
    due_date?: string;
    payment_method?: string;
  }) {
    return this.request(`/shipment-requests/${id}/financial`, {
      method: 'PUT',
      body: JSON.stringify(financialData),
    });
  }

  // Get requests by status
  async getShipmentRequestsByStatus(status: string) {
    return this.request(`/shipment-requests/status/${status}`);
  }

  // Get requests by delivery status
  async getShipmentRequestsByDeliveryStatus(deliveryStatus: string) {
    return this.request(`/shipment-requests/delivery-status/${deliveryStatus}`);
  }

  // ========================================
  // LEGACY COMPATIBILITY METHODS
  // ========================================

  // Invoice Requests (legacy compatibility)
  async getInvoiceRequests() {
    return this.getShipmentRequests();
  }

  async getInvoiceRequestsByStatus(status: string) {
    return this.getShipmentRequestsByStatus(status);
  }

  async createInvoiceRequest(invoiceData: any) {
    return this.createShipmentRequest(invoiceData);
  }

  async updateInvoiceRequest(id: string, updateData: any) {
    return this.updateShipmentRequest(id, updateData);
  }

  // Collections (legacy compatibility)
  async getCollections() {
    return this.getShipmentRequests({ invoice_status: 'GENERATED' });
  }

  async getCollectionsSummary() {
    const response = await this.getShipmentRequests({ invoice_status: 'GENERATED' });
    if (response.success && response.data) {
      const collections = Array.isArray(response.data) ? response.data : [];
      const summary = {
        total: collections.length,
        paid: collections.filter((c: any) => c.status.payment_status === 'PAID').length,
        pending: collections.filter((c: any) => c.status.payment_status === 'PENDING').length,
        overdue: collections.filter((c: any) => c.status.payment_status === 'OVERDUE').length,
        total_amount: collections.reduce((sum: number, c: any) => sum + (c.financial?.invoice_amount || 0), 0),
        paid_amount: collections
          .filter((c: any) => c.status.payment_status === 'PAID')
          .reduce((sum: number, c: any) => sum + (c.financial?.invoice_amount || 0), 0)
      };
      return { success: true, data: summary };
    }
    return response;
  }

  async updateCollectionStatus(id: string, statusData: any) {
    return this.updateShipmentRequestStatus(id, {
      payment_status: statusData.status,
      ...(statusData.payment_method && { payment_method: statusData.payment_method })
    });
  }

  // ========================================
  // NOTIFICATIONS
  // ========================================

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

  // ========================================
  // PERFORMANCE METRICS
  // ========================================

  async getDepartmentPerformance(department: string) {
    return this.request(`/performance/department/${department}`);
  }

  // ========================================
  // CLIENTS (if needed)
  // ========================================

  async getClients() {
    // For now, extract clients from shipment requests
    const response = await this.getShipmentRequests();
    if (response.success && response.data) {
      const dataArray = Array.isArray(response.data) ? response.data : [];
      const clients = dataArray.map((request: any) => ({
        _id: request._id,
        company_name: request.customer.company || request.customer.name,
        contact_name: request.customer.name,
        email: request.customer.email,
        phone: request.customer.phone,
        address: request.customer.address,
        city: request.customer.city,
        country: request.customer.country
      }));
      return { success: true, data: clients };
    }
    return response;
  }
}

// Create singleton instance
const unifiedApiClient = new UnifiedApiClient();

export default unifiedApiClient;
