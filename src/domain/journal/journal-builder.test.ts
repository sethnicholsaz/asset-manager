import { describe, it, expect } from 'vitest';
import {
  buildDepreciationEntry,
  buildDispositionEntry,
  buildAcquisitionEntry,
  createJournalEntry,
  validateJournalBalance,
  type DepreciationData,
  type DispositionData,
  type AcquisitionData,
} from './journal-builder';
import { DEPRECIATION_CONFIG } from '../config/depreciation-config';
import { isOk, isErr } from '../types/result';

describe('buildDepreciationEntry', () => {
  const validDepreciationData: DepreciationData = {
    companyId: 'company-123',
    cowId: 'cow-456',
    cowTag: 'A001',
    entryDate: new Date('2025-01-31'),
    depreciationAmount: 33.33,
  };

  it('should build valid depreciation journal entry', () => {
    const result = buildDepreciationEntry(validDepreciationData);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entry = result.data;
      
      expect(entry.companyId).toBe('company-123');
      expect(entry.entryType).toBe(DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.DEPRECIATION);
      expect(entry.totalAmount).toBe(33.33);
      expect(entry.month).toBe(1);
      expect(entry.year).toBe(2025);
      expect(entry.lines).toHaveLength(2);
      
      // Check debit line (Depreciation Expense)
      const debitLine = entry.lines.find(l => l.lineType === 'debit');
      expect(debitLine).toBeDefined();
      expect(debitLine!.accountCode).toBe(DEPRECIATION_CONFIG.ACCOUNTS.DEPRECIATION_EXPENSE);
      expect(debitLine!.debitAmount).toBe(33.33);
      expect(debitLine!.creditAmount).toBe(0);
      expect(debitLine!.cowId).toBe('cow-456');
      
      // Check credit line (Accumulated Depreciation)
      const creditLine = entry.lines.find(l => l.lineType === 'credit');
      expect(creditLine).toBeDefined();
      expect(creditLine!.accountCode).toBe(DEPRECIATION_CONFIG.ACCOUNTS.ACCUMULATED_DEPRECIATION);
      expect(creditLine!.debitAmount).toBe(0);
      expect(creditLine!.creditAmount).toBe(33.33);
    }
  });

  it('should reject zero or negative depreciation amount', () => {
    const invalidData = { ...validDepreciationData, depreciationAmount: 0 };
    const result = buildDepreciationEntry(invalidData);
    
    expect(isErr(result)).toBe(true);
  });
});

describe('buildDispositionEntry', () => {
  const validDispositionData: DispositionData = {
    companyId: 'company-123',
    cowId: 'cow-456',
    cowTag: 'A001',
    entryDate: new Date('2025-01-31'),
    dispositionType: 'sale',
    purchasePrice: 2500,
    accumulatedDepreciation: 500,
    saleAmount: 1800,
    bookValue: 2000, // purchasePrice - accumulatedDepreciation
  };

  it('should build valid sale disposition with profit', () => {
    const result = buildDispositionEntry(validDispositionData);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entry = result.data;
      
      expect(entry.entryType).toBe(DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.DISPOSITION);
      expect(entry.lines).toHaveLength(4); // Cash, Accum Deprec, Asset, Loss (since sale < book value)
      
      // Check cash debit
      const cashLine = entry.lines.find(l => l.accountCode === DEPRECIATION_CONFIG.ACCOUNTS.CASH);
      expect(cashLine).toBeDefined();
      expect(cashLine!.debitAmount).toBe(1800);
      expect(cashLine!.lineType).toBe('debit');
      
      // Check accumulated depreciation debit
      const accumDeprecLine = entry.lines.find(l => l.accountCode === DEPRECIATION_CONFIG.ACCOUNTS.ACCUMULATED_DEPRECIATION);
      expect(accumDeprecLine).toBeDefined();
      expect(accumDeprecLine!.debitAmount).toBe(500);
      
      // Check asset credit
      const assetLine = entry.lines.find(l => l.accountCode === DEPRECIATION_CONFIG.ACCOUNTS.DAIRY_COWS);
      expect(assetLine).toBeDefined();
      expect(assetLine!.creditAmount).toBe(2500);
      
      // Check loss debit (1800 sale - 2000 book = -200 loss)
      const lossLine = entry.lines.find(l => l.accountCode === DEPRECIATION_CONFIG.ACCOUNTS.LOSS_ON_SALE);
      expect(lossLine).toBeDefined();
      expect(lossLine!.debitAmount).toBe(200); // Loss amount
      expect(lossLine!.lineType).toBe('debit');
    }
  });

  it('should build valid sale disposition with gain', () => {
    const dataWithGain: DispositionData = {
      ...validDispositionData,
      saleAmount: 2200, // Higher than book value
      bookValue: 2000,
    };
    
    const result = buildDispositionEntry(dataWithGain);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entry = result.data;
      
      // Check gain credit (2200 sale - 2000 book = 200 gain)
      const gainLine = entry.lines.find(l => l.accountCode === DEPRECIATION_CONFIG.ACCOUNTS.GAIN_ON_SALE);
      expect(gainLine).toBeDefined();
      expect(gainLine!.creditAmount).toBe(200);
      expect(gainLine!.lineType).toBe('credit');
    }
  });

  it('should build valid death disposition', () => {
    const deathData: DispositionData = {
      ...validDispositionData,
      dispositionType: 'death',
      saleAmount: 0,
      bookValue: 2000,
    };
    
    const result = buildDispositionEntry(deathData);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entry = result.data;
      
      // Should not have cash line for death
      const cashLine = entry.lines.find(l => l.accountCode === DEPRECIATION_CONFIG.ACCOUNTS.CASH);
      expect(cashLine).toBeUndefined();
      
      // Should have loss on dead cows
      const lossLine = entry.lines.find(l => l.accountCode === DEPRECIATION_CONFIG.ACCOUNTS.LOSS_ON_DEAD_COWS);
      expect(lossLine).toBeDefined();
      expect(lossLine!.debitAmount).toBe(2000); // Full book value as loss
    }
  });

  it('should reject invalid input data', () => {
    const invalidData = { ...validDispositionData, purchasePrice: -100 };
    const result = buildDispositionEntry(invalidData);
    
    expect(isErr(result)).toBe(true);
  });
});

describe('buildAcquisitionEntry', () => {
  const validAcquisitionData: AcquisitionData = {
    companyId: 'company-123',
    cowId: 'cow-456',
    cowTag: 'A001',
    entryDate: new Date('2025-01-31'),
    purchasePrice: 2500,
    acquisitionType: 'purchased',
  };

  it('should build valid purchased cow acquisition', () => {
    const result = buildAcquisitionEntry(validAcquisitionData);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entry = result.data;
      
      expect(entry.entryType).toBe(DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.ACQUISITION);
      expect(entry.lines).toHaveLength(2);
      
      // Check asset debit
      const assetLine = entry.lines.find(l => l.accountCode === DEPRECIATION_CONFIG.ACCOUNTS.DAIRY_COWS);
      expect(assetLine).toBeDefined();
      expect(assetLine!.debitAmount).toBe(2500);
      expect(assetLine!.lineType).toBe('debit');
      
      // Check cash credit
      const cashLine = entry.lines.find(l => l.accountCode === DEPRECIATION_CONFIG.ACCOUNTS.CASH);
      expect(cashLine).toBeDefined();
      expect(cashLine!.creditAmount).toBe(2500);
      expect(cashLine!.lineType).toBe('credit');
    }
  });

  it('should build valid raised cow acquisition', () => {
    const raisedData: AcquisitionData = {
      ...validAcquisitionData,
      acquisitionType: 'raised',
    };
    
    const result = buildAcquisitionEntry(raisedData);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entry = result.data;
      
      // Check asset debit
      const assetLine = entry.lines.find(l => l.accountCode === DEPRECIATION_CONFIG.ACCOUNTS.DAIRY_COWS);
      expect(assetLine).toBeDefined();
      expect(assetLine!.debitAmount).toBe(2500);
      
      // Check equity credit (simplified for raised cows)
      const equityLine = entry.lines.find(l => l.accountCode === '3000');
      expect(equityLine).toBeDefined();
      expect(equityLine!.creditAmount).toBe(2500);
    }
  });
});

describe('validateJournalBalance', () => {
  it('should validate balanced journal entry', () => {
    const balancedEntry = {
      companyId: 'company-123',
      entryDate: new Date('2025-01-31'),
      month: 1,
      year: 2025,
      entryType: 'test',
      description: 'Test entry',
      totalAmount: 100,
      lines: [
        {
          accountCode: '1000',
          accountName: 'Cash',
          description: 'Test debit',
          debitAmount: 100,
          creditAmount: 0,
          lineType: 'debit' as const,
        },
        {
          accountCode: '2000',
          accountName: 'Test Account',
          description: 'Test credit',
          debitAmount: 0,
          creditAmount: 100,
          lineType: 'credit' as const,
        },
      ],
    };
    
    const result = validateJournalBalance(balancedEntry);
    expect(isOk(result)).toBe(true);
  });

  it('should reject unbalanced journal entry', () => {
    const unbalancedEntry = {
      companyId: 'company-123',
      entryDate: new Date('2025-01-31'),
      month: 1,
      year: 2025,
      entryType: 'test',
      description: 'Test entry',
      totalAmount: 100,
      lines: [
        {
          accountCode: '1000',
          accountName: 'Cash',
          description: 'Test debit',
          debitAmount: 100,
          creditAmount: 0,
          lineType: 'debit' as const,
        },
        {
          accountCode: '2000',
          accountName: 'Test Account',
          description: 'Test credit',
          debitAmount: 0,
          creditAmount: 50, // Unbalanced!
          lineType: 'credit' as const,
        },
      ],
    };
    
    const result = validateJournalBalance(unbalancedEntry);
    expect(isErr(result)).toBe(true);
  });
});

describe('createJournalEntry', () => {
  it('should create and validate depreciation entry', () => {
    const data: DepreciationData = {
      companyId: 'company-123',
      cowId: 'cow-456',
      cowTag: 'A001',
      entryDate: new Date('2025-01-31'),
      depreciationAmount: 33.33,
    };
    
    const result = createJournalEntry('depreciation', data);
    
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entry = result.data;
      
      // Should be automatically balanced
      const totalDebits = entry.lines.reduce((sum, line) => sum + line.debitAmount, 0);
      const totalCredits = entry.lines.reduce((sum, line) => sum + line.creditAmount, 0);
      expect(Math.abs(totalDebits - totalCredits)).toBeLessThan(0.01);
    }
  });

  it('should reject unknown entry type', () => {
    const data: DepreciationData = {
      companyId: 'company-123',
      cowId: 'cow-456', 
      cowTag: 'A001',
      entryDate: new Date('2025-01-31'),
      depreciationAmount: 33.33,
    };
    
    const result = createJournalEntry('unknown' as any, data);
    expect(isErr(result)).toBe(true);
  });
});