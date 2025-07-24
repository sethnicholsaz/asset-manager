import { describe, it, expect } from 'vitest';
import {
  validateCow,
  validateCreateCow,
  validateDisposition,
  validateDepreciationInput,
  validateJournalEntry,
  validateJournalLine,
  CowSchema,
  DepreciationInputSchema,
} from './cow-schemas';
import { DEPRECIATION_CONFIG } from '../config/depreciation-config';

describe('CowSchema validation', () => {
  const validCowData = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    tagNumber: 'A001',
    name: 'Bessie',
    birthDate: new Date('2022-01-15'),
    freshenDate: new Date('2023-01-15'),
    purchasePrice: 2500,
    salvageValue: 500,
    assetType: 'dairy-cow',
    status: 'active',
    depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
    currentValue: 2000,
    totalDepreciation: 500,
    acquisitionType: 'purchased',
    companyId: '123e4567-e89b-12d3-a456-426614174001',
  };

  it('should validate correct cow data', () => {
    const result = validateCow(validCowData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tagNumber).toBe('A001');
      expect(result.data.purchasePrice).toBe(2500);
    }
  });

  it('should reject invalid UUID formats', () => {
    const invalidData = { ...validCowData, id: 'invalid-uuid' };
    const result = validateCow(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject empty tag number', () => {
    const invalidData = { ...validCowData, tagNumber: '' };
    const result = validateCow(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject negative purchase price', () => {
    const invalidData = { ...validCowData, purchasePrice: -100 };
    const result = validateCow(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject negative salvage value', () => {
    const invalidData = { ...validCowData, salvageValue: -50 };
    const result = validateCow(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject salvage value >= purchase price', () => {
    const invalidData = { ...validCowData, salvageValue: 2600 };
    const result = validateCow(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject freshen date before birth date', () => {
    const invalidData = { 
      ...validCowData, 
      birthDate: new Date('2023-06-15'),
      freshenDate: new Date('2023-01-15') // Before birth date
    };
    const result = validateCow(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject future birth date', () => {
    const invalidData = { 
      ...validCowData,
      birthDate: new Date('2026-01-15') // Future date
    };
    const result = validateCow(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid status', () => {
    const invalidData = { ...validCowData, status: 'invalid-status' };
    const result = validateCow(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid depreciation method', () => {
    const invalidData = { ...validCowData, depreciationMethod: 'invalid-method' };
    const result = validateCow(invalidData);
    expect(result.success).toBe(false);
  });
});

describe('CreateCowSchema validation', () => {
  const validCreateData = {
    tagNumber: 'A002',
    birthDate: new Date('2022-01-15'),
    freshenDate: new Date('2023-01-15'),
    purchasePrice: 2500,
    salvageValue: 500,
    assetType: 'dairy-cow',
    status: 'active',
    depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
    acquisitionType: 'purchased',
    companyId: '123e4567-e89b-12d3-a456-426614174001',
  };

  it('should validate cow creation data without generated fields', () => {
    const result = validateCreateCow(validCreateData);
    expect(result.success).toBe(true);
  });

  it('should allow optional ID for creation', () => {
    const dataWithId = { 
      ...validCreateData, 
      id: '123e4567-e89b-12d3-a456-426614174000' 
    };
    const result = validateCreateCow(dataWithId);
    expect(result.success).toBe(true);
  });

  it('should allow optional generated fields for creation', () => {
    const dataWithOptionals = { 
      ...validCreateData, 
      currentValue: 2000,
      totalDepreciation: 500 
    };
    const result = validateCreateCow(dataWithOptionals);
    expect(result.success).toBe(true);
  });
});

describe('CowDispositionSchema validation', () => {
  const validDispositionData = {
    cowId: '123e4567-e89b-12d3-a456-426614174000',
    dispositionDate: new Date('2025-01-15'),
    dispositionType: 'sale',
    saleAmount: 1800,
    finalBookValue: 2000,
    gainLoss: -200,
    notes: 'Sold to neighboring farm',
    companyId: '123e4567-e89b-12d3-a456-426614174001',
  };

  it('should validate correct disposition data', () => {
    const result = validateDisposition(validDispositionData);
    expect(result.success).toBe(true);
  });

  it('should reject non-sale dispositions with sale amount', () => {
    const invalidData = { 
      ...validDispositionData, 
      dispositionType: 'death',
      saleAmount: 1000 // Should be 0 for death
    };
    const result = validateDisposition(invalidData);
    expect(result.success).toBe(false);
  });

  it('should allow death disposition with zero sale amount', () => {
    const validDeathData = { 
      ...validDispositionData, 
      dispositionType: 'death',
      saleAmount: 0
    };
    const result = validateDisposition(validDeathData);
    expect(result.success).toBe(true);
  });

  it('should reject negative sale amount', () => {
    const invalidData = { ...validDispositionData, saleAmount: -100 };
    const result = validateDisposition(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject future disposition date', () => {
    const invalidData = { 
      ...validDispositionData, 
      dispositionDate: new Date('2026-01-15') 
    };
    const result = validateDisposition(invalidData);
    expect(result.success).toBe(false);
  });
});

describe('DepreciationInputSchema validation', () => {
  const validDepreciationInput = {
    purchasePrice: 2500,
    salvageValue: 500,
    freshenDate: new Date('2023-01-15'),
    depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
  };

  it('should validate correct depreciation input', () => {
    const result = validateDepreciationInput(validDepreciationInput);
    expect(result.success).toBe(true);
  });

  it('should reject salvage value >= purchase price', () => {
    const invalidData = { ...validDepreciationInput, salvageValue: 2600 };
    const result = validateDepreciationInput(invalidData);
    expect(result.success).toBe(false);
  });

  it('should allow optional current value', () => {
    const dataWithCurrentValue = { 
      ...validDepreciationInput, 
      currentValue: 2000 
    };
    const result = validateDepreciationInput(dataWithCurrentValue);
    expect(result.success).toBe(true);
  });
});

describe('JournalEntrySchema validation', () => {
  const validJournalEntry = {
    companyId: '123e4567-e89b-12d3-a456-426614174001',
    entryDate: new Date('2025-01-31'),
    month: 1,
    year: 2025,
    entryType: DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.DEPRECIATION,
    description: 'Monthly depreciation entry',
    totalAmount: 500,
  };

  it('should validate correct journal entry', () => {
    const result = validateJournalEntry(validJournalEntry);
    expect(result.success).toBe(true);
  });

  it('should reject invalid month', () => {
    const invalidData = { ...validJournalEntry, month: 13 };
    const result = validateJournalEntry(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid year', () => {
    const invalidData = { ...validJournalEntry, year: 1800 };
    const result = validateJournalEntry(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject empty description', () => {
    const invalidData = { ...validJournalEntry, description: '' };
    const result = validateJournalEntry(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject negative total amount', () => {
    const invalidData = { ...validJournalEntry, totalAmount: -100 };
    const result = validateJournalEntry(invalidData);
    expect(result.success).toBe(false);
  });
});

describe('JournalLineSchema validation', () => {
  const validJournalLine = {
    journalEntryId: '123e4567-e89b-12d3-a456-426614174000',
    accountCode: '6100',
    accountName: 'Depreciation Expense',
    description: 'Monthly depreciation',
    debitAmount: 500,
    creditAmount: 0,
    lineType: 'debit',
  };

  it('should validate correct journal line', () => {
    const result = validateJournalLine(validJournalLine);
    expect(result.success).toBe(true);
  });

  it('should reject line with both debit and credit amounts', () => {
    const invalidData = { 
      ...validJournalLine, 
      debitAmount: 500,
      creditAmount: 500 // Should be 0
    };
    const result = validateJournalLine(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject line with neither debit nor credit amount', () => {
    const invalidData = { 
      ...validJournalLine, 
      debitAmount: 0,
      creditAmount: 0
    };
    const result = validateJournalLine(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject mismatched line type and amount', () => {
    const invalidData = { 
      ...validJournalLine, 
      lineType: 'debit',
      debitAmount: 0,
      creditAmount: 500 // Credit amount with debit type
    };
    const result = validateJournalLine(invalidData);
    expect(result.success).toBe(false);
  });

  it('should allow optional cow ID', () => {
    const dataWithCowId = { 
      ...validJournalLine, 
      cowId: 'COW001' 
    };
    const result = validateJournalLine(dataWithCowId);
    expect(result.success).toBe(true);
  });
});