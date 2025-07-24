/**
 * Example usage of the new functional depreciation system
 * This file demonstrates how to use the new domain-driven approach
 */

import { 
  calculateCurrentDepreciation,
  calculateMonthlyDepreciation,
  generateDepreciationSchedule,
  type DepreciationInput 
} from '../depreciation/depreciation-calculator';

import { 
  createJournalEntry,
  type DepreciationData 
} from '../journal/journal-builder';

import { validateDepreciationInput } from '../validation/cow-schemas';
import { DEPRECIATION_CONFIG } from '../config/depreciation-config';
import { isOk, unwrapOr } from '../types/result';

/**
 * Example: Calculate depreciation for a cow with error handling
 */
export const exampleDepreciationCalculation = () => {
  // Sample cow data
  const cowData = {
    purchasePrice: 2500,
    salvageValue: 500,
    freshenDate: new Date('2023-01-15'),
    depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE as const,
  };

  // Validate input
  const validationResult = validateDepreciationInput(cowData);
  if (!validationResult.success) {
    console.error('Validation errors:', validationResult.error.errors);
    return null;
  }

  // Calculate current depreciation
  const depreciationResult = calculateCurrentDepreciation(cowData);
  if (!isOk(depreciationResult)) {
    console.error('Calculation error:', depreciationResult.error.message);
    return null;
  }

  const { totalDepreciation, currentValue, monthlyDepreciation } = depreciationResult.data;
  
  console.log('Depreciation Results:', {
    totalDepreciation,
    currentValue,
    monthlyDepreciation,
  });

  return depreciationResult.data;
};

/**
 * Example: Generate depreciation schedule with error handling
 */
export const exampleDepreciationSchedule = () => {
  const cowId = 'cow-123';
  const input: DepreciationInput = {
    purchasePrice: 2500,
    salvageValue: 500,
    freshenDate: new Date('2023-01-15'),
    depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
  };

  const startDate = new Date('2023-01-01');
  const endDate = new Date('2025-12-31');

  const scheduleResult = generateDepreciationSchedule(cowId, input, startDate, endDate);
  
  if (!isOk(scheduleResult)) {
    console.error('Schedule generation error:', scheduleResult.error.message);
    return [];
  }

  console.log(`Generated ${scheduleResult.data.length} depreciation entries`);
  return scheduleResult.data;
};

/**
 * Example: Create depreciation journal entry
 */
export const exampleDepreciationJournalEntry = () => {
  const depreciationData: DepreciationData = {
    companyId: 'company-456',
    cowId: 'cow-123',  
    cowTag: 'A001',
    entryDate: new Date('2025-01-31'),
    depreciationAmount: 33.33,
  };

  const journalResult = createJournalEntry('depreciation', depreciationData);
  
  if (!isOk(journalResult)) {
    console.error('Journal entry error:', journalResult.error.message);
    return null;
  }

  const entry = journalResult.data;
  console.log('Created journal entry:', {
    description: entry.description,
    totalAmount: entry.totalAmount,
    linesCount: entry.lines.length,
  });

  // Verify the entry is balanced
  const totalDebits = entry.lines.reduce((sum, line) => sum + line.debitAmount, 0);
  const totalCredits = entry.lines.reduce((sum, line) => sum + line.creditAmount, 0);
  console.log('Balance check:', { totalDebits, totalCredits, balanced: Math.abs(totalDebits - totalCredits) < 0.01 });

  return entry;
};

/**
 * Example: Safe error handling with Result types
 */
export const exampleSafeDepreciationCalculation = (rawCowData: unknown) => {
  // Validate input data
  const validation = validateDepreciationInput(rawCowData);
  if (!validation.success) {
    return {
      success: false,
      error: 'Invalid input data',
      details: validation.error.errors,
    };
  }

  // Calculate depreciation  
  const result = calculateCurrentDepreciation(validation.data);
  
  // Use unwrapOr to provide default values on error
  const depreciation = unwrapOr(result, {
    totalDepreciation: 0,
    currentValue: validation.data.purchasePrice,
    monthlyDepreciation: 0,
    monthsSinceFreshen: 0,
    remainingMonths: 60, // 5 years default
  });

  return {
    success: isOk(result),
    data: depreciation,
    error: isOk(result) ? null : result.error.message,
  };
};

/**
 * Example: Functional composition for complex calculations
 */
export const exampleDepreciationPipeline = (cows: unknown[]) => {
  return cows
    .map(validateDepreciationInput)
    .filter(result => result.success)
    .map(result => result.data!)
    .map(data => {
      const depreciation = calculateCurrentDepreciation(data);
      return isOk(depreciation) ? depreciation.data : null;
    })
    .filter(Boolean)
    .reduce((total, depreciation) => ({
      totalDepreciation: total.totalDepreciation + depreciation!.totalDepreciation,
      totalCurrentValue: total.totalCurrentValue + depreciation!.currentValue,
      count: total.count + 1,
    }), { totalDepreciation: 0, totalCurrentValue: 0, count: 0 });
};