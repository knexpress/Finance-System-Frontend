'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { UserProfile, DepartmentData } from '@/lib/types';
import { apiClient } from '@/lib/api-client';
import { secureLog } from '@/lib/secure-logger';

interface AuthContextType {
  userProfile: UserProfile | null;
  department: DepartmentData | null;
  loading: boolean;
  requiresPasswordChange: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; requiresPasswordChange?: boolean }>;
  logout: () => void;
  clearPasswordChangeRequirement: () => void;
}

const AuthContext = createContext<AuthContextType>({
  userProfile: null,
  department: null,
  loading: true,
  requiresPasswordChange: false,
  login: async () => ({ success: false, error: 'Auth not ready' }),
  logout: () => {},
  clearPasswordChangeRequirement: () => {},
});

const SESSION_STORAGE_KEY = 'knex-user';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);

  useEffect(() => {
    // Only run on client side to avoid hydration mismatch
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    try {
      const storedUser = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        setUserProfile(userData);
        
        // Ensure API client has the token if user is logged in
        const storedToken = localStorage.getItem('authToken');
        if (storedToken && !apiClient.getToken()) {
          apiClient.setToken(storedToken);
        }
      }
    } catch (error) {
      secureLog.error("Failed to parse user from session storage", error);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
        setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string; requiresPasswordChange?: boolean }> => {
    setLoading(true);
    
    try {
      const result = await apiClient.login(email, password);
      
      secureLog.debug('Login attempt', { success: result.success, hasData: !!result.data });
      
      if (!result.success) {
        setLoading(false);
        return { success: false, error: result.error || 'Login failed' };
      }
      
      // Extract user and token from result.data - handle multiple possible structures
      // The API client wraps auth responses, so result.data might be the full response
      // or just the data portion depending on backend structure
      let responseData = result.data as any;
      
      // If the response has a nested data structure (backend returns { success, data: {...}, message })
      // then we need to extract the inner data
      if (responseData && responseData.data && (responseData.data.user || responseData.data.token)) {
        responseData = responseData.data;
      }
      
      // Try different possible response structures
      let userData = null;
      let token = null;
      let needsPasswordChange = false;
      
      if (responseData) {
        // Structure 1: { user: {...}, token: "...", requiresPasswordChange: boolean }
        if (responseData.user && responseData.token) {
          userData = responseData.user;
          token = responseData.token;
          needsPasswordChange = responseData.requiresPasswordChange || responseData.user.requiresPasswordChange || false;
        }
        // Structure 2: { ...userFields, token: "...", requiresPasswordChange: boolean }
        else if (responseData.token && (responseData.email || responseData._id || responseData.id)) {
          userData = responseData;
          token = responseData.token;
          needsPasswordChange = responseData.requiresPasswordChange || false;
          // Remove token from userData to avoid storing it twice
          const { token: _, ...userWithoutToken } = userData;
          userData = userWithoutToken;
        }
        // Structure 3: Direct user object with token as separate field
        else if (responseData.email || responseData._id || responseData.id) {
          userData = responseData;
          // Token might be in a different location or missing
          token = responseData.token || responseData.accessToken || responseData.access_token;
          needsPasswordChange = responseData.requiresPasswordChange || false;
        }
      }
      
      secureLog.debug('Login data extracted', { hasUserData: !!userData, hasToken: !!token, needsPasswordChange });
      
      if (!userData) {
        secureLog.error('No user data found in login response');
        setLoading(false);
        return { success: false, error: 'Login failed - user data not found in response' };
      }
      
      if (!token) {
        secureLog.error('No token found in login response');
        setLoading(false);
        return { success: false, error: 'Login failed - authentication token not found in response' };
      }
      
      // Store user data in sessionStorage
      setUserProfile(userData);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userData));
      }
      
      // Store token in API client (which stores it in localStorage)
      apiClient.setToken(token);
      
      // Check if password is default (password123)
      // Backend should return this in the response, but we also check here as fallback
      if (needsPasswordChange || password === 'password123') {
        setRequiresPasswordChange(true);
        setLoading(false);
        return { success: true, requiresPasswordChange: true };
      }
      
      setLoading(false);
      return { success: true, requiresPasswordChange: false };
      } catch (error) {
      secureLog.error('Login error', error);
      setLoading(false);
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }, []);

  const logout = useCallback(() => {
    setUserProfile(null);
    setRequiresPasswordChange(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
    // Clear API client token
    apiClient.clearToken();
  }, []);

  const clearPasswordChangeRequirement = useCallback(() => {
    setRequiresPasswordChange(false);
  }, []);

  const department = userProfile ? userProfile.department : null;

  return (
    <AuthContext.Provider value={{ 
      userProfile, 
      department, 
      loading, 
      requiresPasswordChange,
      login, 
      logout,
      clearPasswordChangeRequirement
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
