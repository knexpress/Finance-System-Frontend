import { UserProfile, Client, Request, Invoice, InternalRequest, Department, CashFlowTransaction } from './types';
import { apiClient } from './api-client';
import { secureLog } from './secure-logger';

// Functions to fetch data from MongoDB API - NO MOCK DATA
export async function fetchClients(): Promise<Client[]> {
  try {
    const result = await apiClient.getClients();
    if (result.success) {
      return (result.data as Client[]) || [];
    }
    // Handle rate limiting gracefully
    if (result.error === 'Rate limited') {
      secureLog.debug('Rate limited for clients, returning empty array');
      return [];
    }
    throw new Error(result.error || 'Failed to fetch clients');
  } catch (error) {
    secureLog.error('Error fetching clients', error);
    return []; // Return empty array instead of mock data
  }
}

export async function fetchRequests(): Promise<Request[]> {
  try {
    const result = await apiClient.getRequests();
    if (result.success) {
      return (result.data as Request[]) || [];
    }
    // Handle rate limiting gracefully
    if (result.error === 'Rate limited') {
      secureLog.debug('Rate limited for requests, returning empty array');
      return [];
    }
    throw new Error(result.error || 'Failed to fetch requests');
  } catch (error) {
    secureLog.error('Error fetching requests', error);
    return []; // Return empty array instead of mock data
  }
}

export async function fetchInvoices(): Promise<Invoice[]> {
  try {
    const result = await apiClient.getInvoices();
    
    if (result.success && result.data) {
      // Handle the new response structure: { success: true, data: invoices }
      const invoices = Array.isArray(result.data) ? result.data : [];
      return invoices;
    }
    throw new Error(result.error || 'Failed to fetch invoices');
  } catch (error) {
    secureLog.error('Error fetching invoices', error);
    return []; // Return empty array instead of mock data
  }
}

export async function fetchCashFlowTransactions(): Promise<CashFlowTransaction[]> {
  try {
    const result = await apiClient.getCashTransactions();
    secureLog.debug('Cash transactions API result', { success: result.success });

    if (result.success && result.data) {
      // Ensure data is an array before mapping
      const dataArray = Array.isArray(result.data) ? result.data : [];
      
      // Convert CashTracker/CashFlowTransaction data to CashFlowTransaction format
      const transactions = dataArray.map((transaction: any) => {
        // Handle Decimal128 amount
        let amountValue = 0;
        
        if (transaction.amount) {
          if (typeof transaction.amount === 'object' && transaction.amount !== null) {
            // Handle Decimal128 from MongoDB
            if (transaction.amount.$numberDecimal) {
              amountValue = parseFloat(transaction.amount.$numberDecimal);
            } else if (typeof transaction.amount.toString === 'function') {
              amountValue = parseFloat(transaction.amount.toString());
            }
          } else if (typeof transaction.amount === 'string' || typeof transaction.amount === 'number') {
            amountValue = parseFloat(transaction.amount.toString());
          }
        }
        
        // Validate amount
        if (isNaN(amountValue) || !isFinite(amountValue)) {
          secureLog.warn('Invalid amount for transaction', transaction);
          amountValue = 0;
        }
        
        return {
          id: transaction._id,
          type: (transaction.direction === 'IN' ? 'Income' : 'Expense') as 'Income' | 'Expense',
          description: transaction.description || transaction.notes || transaction.category || 'Transaction',
          amount: amountValue,
          taxRate: 0, // CashTracker doesn't have tax rate, default to 0
          date: new Date(transaction.createdAt || transaction.transaction_date).toLocaleDateString(),
          reference_number: transaction.reference_number,
          transaction_id: transaction.transaction_id
        };
      });
      
      return transactions;
    }

    return []; // Return empty array if no data
  } catch (error) {
    secureLog.error('Error fetching cash flow transactions', error);
    return []; // Return empty array instead of mock data
  }
}

export async function fetchInternalRequests(): Promise<InternalRequest[]> {
  try {
    const result = await apiClient.getTickets();
    if (result.success) {
      return (result.data as InternalRequest[]) || [];
    }
    throw new Error(result.error || 'Failed to fetch internal requests');
  } catch (error) {
    secureLog.error('Error fetching internal requests', error);
    return []; // Return empty array instead of mock data
  }
}

// Department list - this is static data
export const departments: Department[] = ['Sales', 'Operations', 'Finance', 'HR', 'Management', 'IT', 'Auditor'];