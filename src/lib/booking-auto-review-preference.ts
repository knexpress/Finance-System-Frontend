const GLOBAL_STORAGE_KEY = 'knex-booking-auto-review-enabled';

function userStorageKey(userId: string): string {
  return `${GLOBAL_STORAGE_KEY}:${userId}`;
}

function parseStoredEnabled(raw: string | null): boolean {
  return raw === 'true';
}

/**
 * Read persisted auto-review toggle (per user when userId is known).
 */
export function readBookingAutoReviewEnabled(userId?: string | null): boolean {
  if (typeof window === 'undefined') return false;

  if (userId) {
    const perUser = localStorage.getItem(userStorageKey(userId));
    if (perUser !== null) {
      return parseStoredEnabled(perUser);
    }
    // Migrate legacy global preference into this user's key once
    const legacy = localStorage.getItem(GLOBAL_STORAGE_KEY);
    if (legacy !== null) {
      localStorage.setItem(userStorageKey(userId), legacy);
      return parseStoredEnabled(legacy);
    }
    return false;
  }

  return parseStoredEnabled(localStorage.getItem(GLOBAL_STORAGE_KEY));
}

/**
 * Persist auto-review toggle across sessions (survives logout; same browser).
 */
export function writeBookingAutoReviewEnabled(enabled: boolean, userId?: string | null): void {
  if (typeof window === 'undefined') return;

  const value = enabled ? 'true' : 'false';

  if (userId) {
    localStorage.setItem(userStorageKey(userId), value);
  }
  // Keep global key in sync for backwards compatibility during migration
  localStorage.setItem(GLOBAL_STORAGE_KEY, value);
}

export function getBookingAutoReviewUserId(userProfile: {
  _id?: string;
  employee_id?: string;
  uid?: string;
} | null | undefined): string | null {
  if (!userProfile) return null;
  return userProfile._id || userProfile.employee_id || userProfile.uid || null;
}
