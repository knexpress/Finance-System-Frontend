'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// import { apiClient } from '@/lib/api-client'; // Disabled: Notification endpoints removed
import { secureLog } from '@/lib/secure-logger';

interface NotificationCounts {
  invoices: number;
  chat: number;
  tickets: number;
  invoiceRequests: number;
  requests: number;
}

interface NotificationContextType {
  counts: NotificationCounts;
  updateCount: (type: keyof NotificationCounts, count: number) => void;
  incrementCount: (type: keyof NotificationCounts) => void;
  decrementCount: (type: keyof NotificationCounts) => void;
  clearCount: (type: keyof NotificationCounts) => Promise<void>;
  refreshCounts: () => Promise<void>;
  isLoading: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [counts, setCounts] = useState<NotificationCounts>({
    invoices: 0,
    chat: 0,
    tickets: 0,
    invoiceRequests: 0,
    requests: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  const updateCount = (type: keyof NotificationCounts, count: number) => {
    setCounts(prev => ({
      ...prev,
      [type]: count,
    }));
  };

  const incrementCount = (type: keyof NotificationCounts) => {
    setCounts(prev => ({
      ...prev,
      [type]: prev[type] + 1,
    }));
  };

  const decrementCount = (type: keyof NotificationCounts) => {
    setCounts(prev => ({
      ...prev,
      [type]: Math.max(0, prev[type] - 1),
    }));
  };

  const clearCount = async (type: keyof NotificationCounts) => {
    // Disabled: Notification endpoints removed
    // Just update local state without API call
    setCounts(prev => ({
      ...prev,
      [type]: 0,
    }));
  };

  const refreshCounts = async () => {
    // Disabled: Notification endpoints removed
    // No API calls, just set loading to false
    setIsLoading(false);
  };

  // Disabled: Notification endpoints removed
  // No automatic fetching or refresh intervals
  useEffect(() => {
    setIsLoading(false);
    // No interval setup - notifications disabled
  }, []);

  const value: NotificationContextType = {
    counts,
    updateCount,
    incrementCount,
    decrementCount,
    clearCount,
    refreshCounts,
    isLoading,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
