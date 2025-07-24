/**
 * Functional depreciation calculation utilities
 * Replaces the class-based DepreciationCalculator with pure functions
 */

import { DEPRECIATION_CONFIG, type DepreciationMethod } from '../config/depreciation-config';
import { Result, ok, err, ValidationError, CalculationError } from '../types/result';

/**
 * Input data for depreciation calculations
 */
export interface DepreciationInput {
  readonly purchasePrice: number;
  readonly salvageValue: number;
  readonly freshenDate: Date;
  readonly depreciationMethod: DepreciationMethod;
  readonly currentValue?: number;
}

/**
 * Result of depreciation calculations
 */
export interface DepreciationResult {
  readonly monthlyDepreciation: number;
  readonly totalDepreciation: number;
  readonly currentValue: number;
  readonly monthsSinceFreshen: number;
  readonly remainingMonths: number;
}

/**
 * Individual depreciation entry for a specific period
 */
export interface DepreciationEntry {
  readonly cowId: string;
  readonly year: number;
  readonly month: number;
  readonly depreciationAmount: number;
  readonly accumulatedDepreciation: number;
  readonly bookValue: number;
}

/**
 * Validate depreciation input data
 */
const validateDepreciationInput = (input: DepreciationInput): Result<DepreciationInput, ValidationError> => {
  if (input.purchasePrice <= 0) {
    return err(new ValidationError('Purchase price must be positive', 'purchasePrice'));
  }
  
  if (input.salvageValue < 0) {
    return err(new ValidationError('Salvage value cannot be negative', 'salvageValue'));
  }
  
  if (input.salvageValue >= input.purchasePrice) {
    return err(new ValidationError('Salvage value must be less than purchase price', 'salvageValue'));
  }
  
  if (input.freshenDate > new Date()) {
    return err(new ValidationError('Freshen date cannot be in the future', 'freshenDate'));
  }
  
  return ok(input);
};

/**
 * Calculate the number of months between two dates
 */
export const calculateMonthsBetween = (startDate: Date, endDate: Date): number => {
  const yearDiff = endDate.getFullYear() - startDate.getFullYear();
  const monthDiff = endDate.getMonth() - startDate.getMonth();
  return Math.max(0, yearDiff * 12 + monthDiff);
};

/**
 * Calculate depreciable amount
 */
const calculateDepreciableAmount = (purchasePrice: number, salvageValue: number): number => {
  return purchasePrice - salvageValue;
};

/**
 * Calculate straight-line monthly depreciation
 */
const calculateStraightLineDepreciation = (
  depreciableAmount: number,
  depreciationYears: number = DEPRECIATION_CONFIG.DEFAULT_YEARS
): number => {
  return depreciableAmount / (depreciationYears * 12);
};

/**
 * Calculate declining balance monthly depreciation
 */
const calculateDecliningBalanceDepreciation = (
  currentValue: number,
  depreciationYears: number = DEPRECIATION_CONFIG.DEFAULT_YEARS
): number => {
  const annualRate = 2 / depreciationYears;
  const monthlyRate = annualRate / 12;
  return currentValue * monthlyRate;
};

/**
 * Calculate sum-of-years digits monthly depreciation
 */
const calculateSumOfYearsDepreciation = (
  depreciableAmount: number,
  monthsSinceStart: number,
  depreciationYears: number = DEPRECIATION_CONFIG.DEFAULT_YEARS
): number => {
  const totalMonths = depreciationYears * 12;
  const remainingMonths = Math.max(0, totalMonths - monthsSinceStart);
  const sumOfDigits = (totalMonths * (totalMonths + 1)) / 2;
  
  return remainingMonths > 0 ? (depreciableAmount * remainingMonths) / sumOfDigits : 0;
};

/**
 * Calculate monthly depreciation based on method
 */
export const calculateMonthlyDepreciation = (
  input: DepreciationInput,
  currentDate: Date = new Date()
): Result<number, ValidationError | CalculationError> => {
  const validationResult = validateDepreciationInput(input);
  if (!validationResult.success) {
    return validationResult as Result<number, ValidationError | CalculationError>;
  }
  
  const { purchasePrice, salvageValue, freshenDate, depreciationMethod, currentValue } = input;
  const depreciableAmount = calculateDepreciableAmount(purchasePrice, salvageValue);
  const monthsSinceStart = calculateMonthsBetween(freshenDate, currentDate);
  
  try {
    switch (depreciationMethod) {
      case DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE:
        return ok(calculateStraightLineDepreciation(depreciableAmount));
      
      case DEPRECIATION_CONFIG.DEPRECIATION_METHODS.DECLINING_BALANCE:
        if (currentValue === undefined) {
          return err(new CalculationError('Current value required for declining balance method'));
        }
        return ok(calculateDecliningBalanceDepreciation(currentValue));
      
      case DEPRECIATION_CONFIG.DEPRECIATION_METHODS.SUM_OF_YEARS:
        return ok(calculateSumOfYearsDepreciation(depreciableAmount, monthsSinceStart));
      
      default:
        return ok(calculateStraightLineDepreciation(depreciableAmount));
    }
  } catch (error) {
    return err(new CalculationError(`Error calculating depreciation: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
};

/**
 * Calculate current depreciation values for a cow
 */
export const calculateCurrentDepreciation = (
  input: Omit<DepreciationInput, 'depreciationMethod' | 'currentValue'>,
  currentDate: Date = new Date()
): Result<DepreciationResult, ValidationError | CalculationError> => {
  const validationResult = validateDepreciationInput({
    ...input,
    depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
  });
  
  if (!validationResult.success) {
    return validationResult as Result<DepreciationResult, ValidationError | CalculationError>;
  }
  
  const { purchasePrice, salvageValue, freshenDate } = input;
  const monthlyDepreciation = calculateStraightLineDepreciation(
    calculateDepreciableAmount(purchasePrice, salvageValue)
  );
  
  const monthsSinceFreshen = calculateMonthsBetween(freshenDate, currentDate);
  const maxDepreciation = purchasePrice - salvageValue;
  const totalDepreciation = Math.min(monthlyDepreciation * monthsSinceFreshen, maxDepreciation);
  const currentValue = Math.max(salvageValue, purchasePrice - totalDepreciation);
  
  const totalDepreciationMonths = DEPRECIATION_CONFIG.DEFAULT_YEARS * 12;
  const remainingMonths = Math.max(0, totalDepreciationMonths - monthsSinceFreshen);
  
  return ok({
    monthlyDepreciation,
    totalDepreciation,
    currentValue,
    monthsSinceFreshen,
    remainingMonths,
  });
};

/**
 * Generate depreciation schedule for a period
 */
export const generateDepreciationSchedule = (
  cowId: string,
  input: DepreciationInput,
  startDate: Date,
  endDate: Date
): Result<DepreciationEntry[], ValidationError | CalculationError> => {
  const validationResult = validateDepreciationInput(input);
  if (!validationResult.success) {
    return validationResult as Result<DepreciationEntry[], ValidationError | CalculationError>;
  }
  
  const { purchasePrice, salvageValue, freshenDate } = input;
  const entries: DepreciationEntry[] = [];
  
  // Start from the later of startDate or freshenDate
  let currentDate = new Date(Math.max(startDate.getTime(), freshenDate.getTime()));
  let accumulatedDepreciation = 0;
  
  while (currentDate <= endDate) {
    const monthlyDepreciationResult = calculateMonthlyDepreciation(
      { ...input, currentValue: purchasePrice - accumulatedDepreciation },
      currentDate
    );
    
    if (!monthlyDepreciationResult.success) {
      return monthlyDepreciationResult as Result<DepreciationEntry[], ValidationError | CalculationError>;
    }
    
    const monthlyDepreciation = monthlyDepreciationResult.data;
    accumulatedDepreciation += monthlyDepreciation;
    const bookValue = Math.max(salvageValue, purchasePrice - accumulatedDepreciation);
    
    entries.push({
      cowId,
      year: currentDate.getFullYear(),
      month: currentDate.getMonth() + 1,
      depreciationAmount: monthlyDepreciation,
      accumulatedDepreciation,
      bookValue,
    });
    
    // Move to next month
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    
    // Stop if fully depreciated
    if (bookValue <= salvageValue) break;
  }
  
  return ok(entries);
};

/**
 * Format currency amount
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

/**
 * Format date for display
 */
export const formatDate = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
};