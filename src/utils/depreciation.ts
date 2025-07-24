import { Cow, DepreciationEntry, DepreciationMethod } from '@/types/cow';
import { 
  calculateMonthlyDepreciation as domainCalculateMonthlyDepreciation,
  calculateCurrentDepreciation as domainCalculateCurrentDepreciation,
  generateDepreciationSchedule as domainGenerateDepreciationSchedule,
  calculateMonthsBetween,
  formatCurrency,
  formatDate,
  type DepreciationInput
} from '@/domain/depreciation/depreciation-calculator';
import { DEPRECIATION_CONFIG } from '@/domain/config/depreciation-config';
import { unwrapOr } from '@/domain/types/result';

/**
 * @deprecated Use domain/depreciation/depreciation-calculator instead
 * Legacy class-based calculator - kept for backward compatibility
 */
export class DepreciationCalculator {
  static calculateMonthlyDepreciation(
    cow: Cow,
    currentDate: Date
  ): number {
    const input: DepreciationInput = {
      purchasePrice: cow.purchasePrice,
      salvageValue: cow.salvageValue,
      freshenDate: cow.freshenDate,
      depreciationMethod: cow.depreciationMethod,
      currentValue: cow.currentValue,
    };
    
    const result = domainCalculateMonthlyDepreciation(input, currentDate);
    return unwrapOr(result, 0);
  }

  static getMonthsSinceStart(startDate: Date, currentDate: Date): number {
    return calculateMonthsBetween(startDate, currentDate);
  }

  static generateDepreciationSchedule(
    cow: Cow,
    startDate: Date,
    endDate: Date
  ): DepreciationEntry[] {
    const input: DepreciationInput = {
      purchasePrice: cow.purchasePrice,
      salvageValue: cow.salvageValue,
      freshenDate: cow.freshenDate,
      depreciationMethod: cow.depreciationMethod,
      currentValue: cow.currentValue,
    };
    
    const result = domainGenerateDepreciationSchedule(cow.id, input, startDate, endDate);
    return unwrapOr(result, []);
  }

  /**
   * Calculate current depreciation values for a cow
   * @deprecated Use domain/depreciation/depreciation-calculator instead
   */
  static calculateCurrentDepreciation(cow: {
    purchasePrice: number;
    salvageValue: number;
    freshenDate: Date | string;
  }) {
    const freshenDate = typeof cow.freshenDate === 'string' ? new Date(cow.freshenDate) : cow.freshenDate;
    
    const input = {
      purchasePrice: cow.purchasePrice,
      salvageValue: cow.salvageValue,
      freshenDate,
    };
    
    const result = domainCalculateCurrentDepreciation(input);
    return unwrapOr(result, {
      totalDepreciation: 0,
      currentValue: cow.purchasePrice,
      monthlyDepreciation: 0,
      monthsSinceFreshen: 0
    });
  }

  /**
   * @deprecated Use domain/depreciation/depreciation-calculator formatCurrency instead
   */
  static formatCurrency(amount: number): string {
    return formatCurrency(amount);
  }

  /**
   * @deprecated Use domain/depreciation/depreciation-calculator formatDate instead
   */
  static formatDate(date: Date | string): string {
    return formatDate(date);
  }
}

// Re-export new functional API for easier migration
export {
  calculateMonthlyDepreciation,
  calculateCurrentDepreciation,
  generateDepreciationSchedule,
  calculateMonthsBetween,
  formatCurrency,
  formatDate,
} from '@/domain/depreciation/depreciation-calculator';

export { DEPRECIATION_CONFIG } from '@/domain/config/depreciation-config';
export type { DepreciationInput, DepreciationResult } from '@/domain/depreciation/depreciation-calculator';