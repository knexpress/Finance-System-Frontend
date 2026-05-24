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
}

const MONGO_OBJECT_ID = /^[a-fA-F0-9]{24}$/;

export function isMongoObjectId(value: unknown): boolean {
  if (value == null) return false;
  return MONGO_OBJECT_ID.test(String(value));
}

/** Employee (or User _id) used as reviewed_by_employee_id — never Firebase uid. */
export function resolveReviewerEmployeeId(userProfile: {
  employee_id?: string;
  _id?: string;
  uid?: string;
} | null | undefined): string | undefined {
  if (!userProfile) return undefined;
  if (userProfile.employee_id && isMongoObjectId(userProfile.employee_id)) {
    return userProfile.employee_id;
  }
  if (userProfile._id && isMongoObjectId(userProfile._id)) {
    return String(userProfile._id);
  }
  return undefined;
}

/** Stable per-login storage id (prefer User _id so toggle does not flip between keys). */
export function getBookingAutoReviewUserId(userProfile: {
  _id?: string;
  employee_id?: string;
  uid?: string;
} | null | undefined): string | null {
  if (!userProfile) return null;
  const id = userProfile._id ?? userProfile.uid ?? userProfile.employee_id;
  if (id == null) return null;
  return String(id);
}
