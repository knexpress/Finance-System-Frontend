import { secureLog } from './secure-logger';

// Debug utility for authentication issues (dev only)
export const debugAuth = () => {
  if (process.env.NODE_ENV !== 'development') return;
  if (typeof window === 'undefined') {
    secureLog.debug('Auth debug: Running on server side');
    return;
  }

  secureLog.debug('AUTH DEBUG INFO');

  // Check sessionStorage
  const sessionUser = sessionStorage.getItem('knex-user');
  secureLog.debug('Session User', { present: !!sessionUser });
  if (sessionUser) {
    try {
      const user = JSON.parse(sessionUser);
      secureLog.debug('User Data', {
        email: user.email,
        name: user.full_name,
        department: user.department?.name
      });
    } catch (e) {
      secureLog.debug('Session User Data: Invalid JSON');
    }
  }

  // Check API client token (secure-storage used by api-client)
  const { apiClient } = require('./api-client');
  const apiToken = apiClient.getToken();
  secureLog.debug('API Client Token', { present: !!apiToken });
};

// Auto-run debug on import in development
if (process.env.NODE_ENV === 'development') {
  // Only run after a short delay to ensure everything is loaded
  setTimeout(debugAuth, 1000);
}
