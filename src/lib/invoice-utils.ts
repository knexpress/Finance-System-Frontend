/**
 * Shared utilities for invoice display and calculations.
 * Used by invoice detail page ([invoiceId]/page.tsx).
 */

/**
 * Parse and round decimal values (handles Decimal128, numbers, strings).
 */
export function parseDecimal(value: any, decimals: number = 2): number {
  let num = 0;
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'string') {
    num = parseFloat(value) || 0;
  } else if (value && typeof value === 'object') {
    if (value.toString && typeof value.toString === 'function') {
      num = parseFloat(value.toString()) || 0;
    } else if (value.$numberDecimal) {
      num = parseFloat(value.$numberDecimal) || 0;
    } else {
      num = 0;
    }
  }
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
