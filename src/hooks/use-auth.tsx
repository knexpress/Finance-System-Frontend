'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { UserProfile, DepartmentData } from '@/lib/types';
import { apiClient } from '@/lib/api-client';
import { secureLog } from '@/lib/secure-logger';
import { storeUserData, getUserData, removeUserData } from '@/lib/security/secure-storage';
import { createAuditLog, AuditEventType } from '@/lib/security/audit-logger';
import { authRateLimiter, checkRateLimit } from '@/lib/security/rate-limiter';
import { validateEmail } from '@/lib/security/input-validator';

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
      // Use secure storage instead of direct sessionStorage access
      const userData = getUserData();
      if (userData) {
        setUserProfile(userData);
        
        // Ensure API client has the token if user is logged in
        const storedToken = apiClient.getToken();
        if (storedToken) {
          apiClient.setToken(storedToken);
        }
      }
    } catch (error) {
      secureLog.error("Failed to parse user from secure storage", error);
      removeUserData();
    } finally {
        setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string; requiresPasswordChange?: boolean }> => {
    setLoading(true);
    
    // Rate limiting for login attempts
    const rateLimitCheck = checkRateLimit(authRateLimiter);
    if (!rateLimitCheck.allowed) {
      createAuditLog(AuditEventType.RATE_LIMIT_EXCEEDED, 'Login rate limit exceeded', {
        userEmail: email,
        success: false,
        metadata: { remaining: rateLimitCheck.remaining, resetTime: rateLimitCheck.resetTime },
      });
      setLoading(false);
      return { 
        success: false, 
        error: 'Too many login attempts. Please try again later.' 
      };
    }

    // Validate email format
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      createAuditLog(AuditEventType.LOGIN_FAILURE, 'Login attempt with invalid email format', {
        userEmail: email,
        success: false,
        errorMessage: emailValidation.error,
      });
      setLoading(false);
      return { success: false, error: emailValidation.error || 'Invalid email format' };
    }
    
    try {
      const result = await apiClient.login(emailValidation.sanitized, password);
      
      secureLog.debug('Login attempt', { success: result.success, hasData: !!result.data });
      
      if (!result.success) {
        createAuditLog(AuditEventType.LOGIN_FAILURE, 'Login failed', {
          userEmail: emailValidation.sanitized,
          success: false,
          errorMessage: result.error,
        });
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
      
      // Store user data securely
      setUserProfile(userData);
      storeUserData(userData);
      
      // Store token in API client (which uses secure storage)
      apiClient.setToken(token);

      // Log successful login
      createAuditLog(AuditEventType.LOGIN_SUCCESS, 'User logged in successfully', {
        userId: userData._id || (userData as any).id,
        userEmail: emailValidation.sanitized,
        department: userData.department?.name,
        success: true,
      });
      
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
    // Log logout event
    if (userProfile) {
      createAuditLog(AuditEventType.LOGOUT, 'User logged out', {
        userId: userProfile._id || (userProfile as any).id,
        userEmail: userProfile.email,
        department: userProfile.department?.name,
        success: true,
      });
    }

    setUserProfile(null);
    setRequiresPasswordChange(false);
    removeUserData();
    // Clear API client token
    apiClient.clearToken();
  }, [userProfile]);

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
