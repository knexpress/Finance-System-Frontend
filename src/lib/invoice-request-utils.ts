/**
 * Shared utilities for invoice requests and service codes.
 * Used by invoice-requests page and invoice detail page.
 */

export const normalizeServiceCode = (code?: string | null): string =>
  (code || '')
    .toString()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

export function isPhToUaeService(code?: string | null): boolean {
  const normalized = normalizeServiceCode(code);
  return normalized === 'PH_TO_UAE' || normalized.startsWith('PH_TO_UAE_');
}

export function isUaeToPhService(code?: string | null): boolean {
  const normalized = normalizeServiceCode(code);
  return (
    normalized === 'UAE_TO_PH' ||
    normalized === 'UAE_TO_PINAS' ||
    normalized.startsWith('UAE_TO_PH_') ||
    normalized.startsWith('UAE_TO_PINAS_') ||
    normalized.includes('UAE_TO_PINAS')
  );
}

/**
 * Extract AWB number from a request object (checks multiple possible fields).
 */
export function getAwbNumber(request: any): string {
  const awb = (
    request?.awb ||
    request?.tracking_code ||
    request?.awb_number ||
    request?.request_id?.awb ||
    request?.request_id?.tracking_code ||
    request?.request_id?.awb_number ||
    request?.booking?.awb ||
    request?.booking?.tracking_code ||
    request?.booking?.awb_number ||
    ''
  )
    .toString()
    .trim();

  if (awb && awb !== request?._id?.toString()) {
    if (awb.length >= 3 && /^[A-Z0-9\-_]+$/i.test(awb)) {
      return awb;
    }
  }

  return '';
}
