import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateMonthlyDepreciation,
  calculateCurrentDepreciation,
  generateDepreciationSchedule,
  calculateMonthsBetween,
  formatCurrency,
  formatDate,
  type DepreciationInput,
} from './depreciation-calculator';
import { DEPRECIATION_CONFIG } from '../config/depreciation-config';
import { isOk, isErr } from '../types/result';

describe('calculateMonthsBetween', () => {
  it('should calculate months between dates correctly', () => {
    const start = new Date('2023-01-15');
    const end = new Date('2023-06-15');
    expect(calculateMonthsBetween(start, end)).toBe(5);
  });

  it('should handle same month', () => {
    const date = new Date('2023-01-15');
    expect(calculateMonthsBetween(date, date)).toBe(0);
  });

  it('should handle year boundary', () => {
    const start = new Date('2022-10-15');
    const end = new Date('2023-02-15');
    expect(calculateMonthsBetween(start, end)).toBe(4);
  });

  it('should return 0 for end date before start date', () => {
    const start = new Date('2023-06-15');
    const end = new Date('2023-01-15');
    expect(calculateMonthsBetween(start, end)).toBe(0);
  });
});

describe('calculateMonthlyDepreciation', () => {
  const validInput: DepreciationInput = {
    purchasePrice: 2500,
    salvageValue: 500,
    freshenDate: new Date('2023-01-15'),
    depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
  };

  it('should calculate straight-line depreciation correctly', () => {
    const result = calculateMonthlyDepreciation(validInput);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      // (2500 - 500) / (5 * 12) = 2000 / 60 = 33.33
      expect(result.data).toBeCloseTo(33.33, 2);
    }
  });

  it('should calculate declining balance depreciation correctly', () => {
    const input: DepreciationInput = {
      ...validInput,
      depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.DECLINING_BALANCE,
      currentValue: 2000,
    };
    
    const result = calculateMonthlyDepreciation(input);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      // 2000 * (2/5) * (1/12) = 2000 * 0.4 * 0.0833 = 66.67
      expect(result.data).toBeCloseTo(66.67, 2);
    }
  });

  it('should validate input data', () => {
    const invalidInput = {
      ...validInput,
      purchasePrice: -100,
    };
    
    const result = calculateMonthlyDepreciation(invalidInput);
    expect(isErr(result)).toBe(true);
  });

  it('should require current value for declining balance', () => {
    const input: DepreciationInput = {
      ...validInput,
      depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.DECLINING_BALANCE,
      // currentValue is undefined
    };
    
    const result = calculateMonthlyDepreciation(input);
    expect(isErr(result)).toBe(true);
  });

  it('should validate salvage value is less than purchase price', () => {
    const input = {
      ...validInput,
      salvageValue: 3000, // Greater than purchase price
    };
    
    const result = calculateMonthlyDepreciation(input);
    expect(isErr(result)).toBe(true);
  });
});

describe('calculateCurrentDepreciation', () => {
  const validInput = {
    purchasePrice: 2500,
    salvageValue: 500,
    freshenDate: new Date('2024-01-15'), // 12 months ago from mock date
  };

  it('should calculate current depreciation correctly', () => {
    const result = calculateCurrentDepreciation(validInput);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const { monthlyDepreciation, totalDepreciation, currentValue, monthsSinceFreshen } = result.data;
      
      expect(monthlyDepreciation).toBeCloseTo(33.33, 2);
      expect(monthsSinceFreshen).toBe(12);
      expect(totalDepreciation).toBeCloseTo(400, 2); // 33.33 * 12
      expect(currentValue).toBeCloseTo(2100, 2); // 2500 - 400
    }
  });

  it('should not depreciate below salvage value', () => {
    const input = {
      ...validInput,
      freshenDate: new Date('2018-01-15'), // 7 years ago (more than 5-year life)
    };
    
    const result = calculateCurrentDepreciation(input);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.data.currentValue).toBe(500); // Should not go below salvage value
      expect(result.data.totalDepreciation).toBe(2000); // Should not exceed depreciable amount
    }
  });

  it('should handle future freshen date', () => {
    const input = {
      ...validInput,
      freshenDate: new Date('2025-06-15'), // Future date
    };
    
    const result = calculateCurrentDepreciation(input);
    expect(isErr(result)).toBe(true);
  });
});

describe('generateDepreciationSchedule', () => {
  const cowId = 'test-cow-123';
  const validInput: DepreciationInput = {
    purchasePrice: 1200,
    salvageValue: 200,
    freshenDate: new Date('2024-01-15'),
    depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
  };

  it('should generate correct depreciation schedule', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-03-31'); // 3 months
    
    const result = generateDepreciationSchedule(cowId, validInput, startDate, endDate);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entries = result.data;
      expect(entries).toHaveLength(3); // January, February, March
      
      // Check first entry
      expect(entries[0].cowId).toBe(cowId);
      expect(entries[0].year).toBe(2024);
      expect(entries[0].month).toBe(1);
      expect(entries[0].depreciationAmount).toBeCloseTo(16.67, 2); // (1200-200)/(5*12) = 16.67
      expect(entries[0].accumulatedDepreciation).toBeCloseTo(16.67, 2);
      expect(entries[0].bookValue).toBeCloseTo(1183.33, 2);
      
      // Check last entry
      expect(entries[2].accumulatedDepreciation).toBeCloseTo(50, 2); // 16.67 * 3
      expect(entries[2].bookValue).toBeCloseTo(1150, 2); // 1200 - 50
    }
  });

  it('should start from freshen date if later than start date', () => {
    const startDate = new Date('2023-12-01'); // Before freshen date
    const endDate = new Date('2024-02-29');
    
    const result = generateDepreciationSchedule(cowId, validInput, startDate, endDate);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entries = result.data;
      expect(entries).toHaveLength(2); // January and February only
      expect(entries[0].year).toBe(2024);
      expect(entries[0].month).toBe(1);
    }
  });

  it('should stop when fully depreciated', () => {
    const input: DepreciationInput = {
      purchasePrice: 200,
      salvageValue: 100,
      freshenDate: new Date('2024-01-15'),
      depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
    };
    
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2030-12-31'); // Long period
    
    const result = generateDepreciationSchedule(cowId, input, startDate, endDate);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entries = result.data;
      expect(entries.length).toBeLessThanOrEqual(60); // Should not exceed 5 years
      
      // Last entry should have book value at salvage value
      const lastEntry = entries[entries.length - 1];
      expect(lastEntry.bookValue).toBeCloseTo(100, 2);
    }
  });
});

describe('formatCurrency', () => {
  it('should format currency correctly', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(999999.99)).toBe('$999,999.99');
  });
});

describe('formatDate', () => {
  it('should format date correctly', () => {
    const date = new Date('2024-03-15T12:00:00Z');
    expect(formatDate(date)).toMatch(/Mar 1[45], 2024/);
  });

  it('should handle string dates', () => {
    const result = formatDate('2024-03-15');
    expect(result).toMatch(/Mar 1[45], 2024/);
  });
});