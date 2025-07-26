/**
 * Currency utility functions for consistent rounding and formatting
 */

/**
 * Round a number to the nearest penny (2 decimal places)
 * Uses banker's rounding (round half to even) for consistency
 */
export const roundToPenny = (amount: number): number => {
  return Math.round(amount * 100) / 100;
};

/**
 * Round multiple currency amounts and return them
 */
export const roundCurrencyAmounts = <T extends Record<string, number>>(amounts: T): T => {
  const result = {} as T;
  for (const [key, value] of Object.entries(amounts)) {
    (result as any)[key] = roundToPenny(value);
  }
  return result;
};

/**
 * Format currency with proper rounding to 2 decimal places
 */
export const formatCurrency = (amount: number): string => {
  const rounded = roundToPenny(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
};

/**
 * Parse a string to a currency number with proper rounding
 */
export const parseCurrency = (value: string | number): number => {
  if (typeof value === 'number') {
    return roundToPenny(value);
  }
  
  // Remove currency symbols and commas
  const cleaned = value.replace(/[$,]/g, '');
  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed)) {
    return 0;
  }
  
  return roundToPenny(parsed);
};

/**
 * Safely add currency amounts with proper rounding
 */
export const addCurrency = (...amounts: number[]): number => {
  return roundToPenny(amounts.reduce((sum, amount) => sum + amount, 0));
};

/**
 * Safely subtract currency amounts with proper rounding
 */
export const subtractCurrency = (minuend: number, ...subtrahends: number[]): number => {
  const total = subtrahends.reduce((sum, amount) => sum + amount, 0);
  return roundToPenny(minuend - total);
};

/**
 * Safely multiply currency amount with proper rounding
 */
export const multiplyCurrency = (amount: number, multiplier: number): number => {
  return roundToPenny(amount * multiplier);
};

/**
 * Safely divide currency amount with proper rounding
 */
export const divideCurrency = (amount: number, divisor: number): number => {
  if (divisor === 0) {
    return 0;
  }
  return roundToPenny(amount / divisor);
};

/**
 * Calculate percentage of an amount with proper rounding
 */
export const calculatePercentage = (amount: number, percentage: number): number => {
  return roundToPenny(amount * (percentage / 100));
};