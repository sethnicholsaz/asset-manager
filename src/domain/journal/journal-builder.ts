/**
 * Functional journal entry builder
 * Creates properly structured journal entries for different business events
 */

import { 
  DEPRECIATION_CONFIG, 
  getAccountName, 
  getDispositionAccount,
  type DispositionType 
} from '../config/depreciation-config';
import { Result, ok, err, ValidationError } from '../types/result';

/**
 * Journal entry structure
 */
export interface JournalEntry {
  readonly companyId: string;
  readonly entryDate: Date;
  readonly month: number;
  readonly year: number;
  readonly entryType: string;
  readonly description: string;
  readonly totalAmount: number;
  readonly lines: JournalLine[];
}

/**
 * Journal line structure
 */
export interface JournalLine {
  readonly cowId?: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly description: string;
  readonly debitAmount: number;
  readonly creditAmount: number;
  readonly lineType: 'debit' | 'credit';
}

/**
 * Data required for depreciation journal entry
 */
export interface DepreciationData {
  readonly companyId: string;
  readonly cowId: string;
  readonly cowTag: string;
  readonly entryDate: Date;
  readonly depreciationAmount: number;
}

/**
 * Data required for disposition journal entry
 */
export interface DispositionData {
  readonly companyId: string;
  readonly cowId: string;
  readonly cowTag: string;
  readonly entryDate: Date;
  readonly dispositionType: DispositionType;
  readonly purchasePrice: number;
  readonly accumulatedDepreciation: number;
  readonly saleAmount: number;
  readonly bookValue: number;
}

/**
 * Data required for acquisition journal entry
 */
export interface AcquisitionData {
  readonly companyId: string;
  readonly cowId: string;
  readonly cowTag: string;
  readonly entryDate: Date;
  readonly purchasePrice: number;
  readonly acquisitionType: 'purchased' | 'raised';
}

/**
 * Create a journal line
 */
const createJournalLine = (
  accountCode: string,
  description: string,
  amount: number,
  type: 'debit' | 'credit',
  cowId?: string
): JournalLine => ({
  cowId,
  accountCode,
  accountName: getAccountName(accountCode),
  description,
  debitAmount: type === 'debit' ? amount : 0,
  creditAmount: type === 'credit' ? amount : 0,
  lineType: type,
});

/**
 * Build depreciation journal entry
 */
export const buildDepreciationEntry = (
  data: DepreciationData
): Result<JournalEntry, ValidationError> => {
  if (data.depreciationAmount <= 0) {
    return err(new ValidationError('Depreciation amount must be positive'));
  }

  const lines: JournalLine[] = [
    // Debit: Depreciation Expense
    createJournalLine(
      DEPRECIATION_CONFIG.ACCOUNTS.DEPRECIATION_EXPENSE,
      `Monthly depreciation - Cow #${data.cowTag}`,
      data.depreciationAmount,
      'debit',
      data.cowId
    ),
    // Credit: Accumulated Depreciation
    createJournalLine(
      DEPRECIATION_CONFIG.ACCOUNTS.ACCUMULATED_DEPRECIATION,
      `Monthly depreciation - Cow #${data.cowTag}`,
      data.depreciationAmount,
      'credit',
      data.cowId
    ),
  ];

  return ok({
    companyId: data.companyId,
    entryDate: data.entryDate,
    month: data.entryDate.getMonth() + 1,
    year: data.entryDate.getFullYear(),
    entryType: DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.DEPRECIATION,
    description: `Monthly Depreciation - ${data.entryDate.getFullYear()}-${(data.entryDate.getMonth() + 1).toString().padStart(2, '0')} - Cow #${data.cowTag}`,
    totalAmount: data.depreciationAmount,
    lines,
  });
};

/**
 * Build disposition journal entry
 */
export const buildDispositionEntry = (
  data: DispositionData
): Result<JournalEntry, ValidationError> => {
  if (data.purchasePrice <= 0) {
    return err(new ValidationError('Purchase price must be positive'));
  }

  if (data.accumulatedDepreciation < 0) {
    return err(new ValidationError('Accumulated depreciation cannot be negative'));
  }

  if (data.saleAmount < 0) {
    return err(new ValidationError('Sale amount cannot be negative'));
  }

  const lines: JournalLine[] = [];
  const gainLoss = data.saleAmount - data.bookValue;

  // Cash entry (for sales with actual sale amount)
  if (data.dispositionType === 'sale' && data.saleAmount > 0) {
    lines.push(
      createJournalLine(
        DEPRECIATION_CONFIG.ACCOUNTS.CASH,
        `Cash received from sale of cow #${data.cowTag}`,
        data.saleAmount,
        'debit',
        data.cowId
      )
    );
  }

  // Accumulated Depreciation removal (write back) - for all dispositions
  if (data.accumulatedDepreciation > 0) {
    lines.push(
      createJournalLine(
        DEPRECIATION_CONFIG.ACCOUNTS.ACCUMULATED_DEPRECIATION,
        `Remove accumulated depreciation for cow #${data.cowTag} (${data.dispositionType})`,
        data.accumulatedDepreciation,
        'debit',
        data.cowId
      )
    );
  }

  // Asset removal (take off books) - for all dispositions
  lines.push(
    createJournalLine(
      DEPRECIATION_CONFIG.ACCOUNTS.DAIRY_COWS,
      `Remove cow asset #${data.cowTag} - ${data.dispositionType}`,
      data.purchasePrice,
      'credit',
      data.cowId
    )
  );

  // Gain or Loss handling - only if there's an actual gain or loss
  if (Math.abs(gainLoss) > 0.01) {
    const isGain = gainLoss > 0;
    const account = getDispositionAccount(data.dispositionType, isGain);
    const gainLossText = isGain ? 'Gain' : 'Loss';
    
    lines.push(
      createJournalLine(
        account.code,
        `${gainLossText} on ${data.dispositionType} of cow #${data.cowTag} (Sale: $${data.saleAmount.toFixed(2)}, Book: $${data.bookValue.toFixed(2)})`,
        Math.abs(gainLoss),
        isGain ? 'credit' : 'debit',
        data.cowId
      )
    );
  }

  const totalAmount = Math.max(data.saleAmount, data.purchasePrice);

  return ok({
    companyId: data.companyId,
    entryDate: data.entryDate,
    month: data.entryDate.getMonth() + 1,
    year: data.entryDate.getFullYear(),
    entryType: DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.DISPOSITION,
    description: `Cow Disposition - ${data.dispositionType} - Cow #${data.cowTag}`,
    totalAmount,
    lines,
  });
};

/**
 * Build acquisition journal entry
 */
export const buildAcquisitionEntry = (
  data: AcquisitionData
): Result<JournalEntry, ValidationError> => {
  if (data.purchasePrice <= 0) {
    return err(new ValidationError('Purchase price must be positive'));
  }

  const lines: JournalLine[] = [];

  if (data.acquisitionType === 'purchased') {
    // For purchased cows: Debit Asset, Credit Cash
    lines.push(
      createJournalLine(
        DEPRECIATION_CONFIG.ACCOUNTS.DAIRY_COWS,
        `Cow acquisition - Purchase #${data.cowTag}`,
        data.purchasePrice,
        'debit',
        data.cowId
      ),
      createJournalLine(
        DEPRECIATION_CONFIG.ACCOUNTS.CASH,
        `Cash paid for cow #${data.cowTag}`,
        data.purchasePrice,
        'credit',
        data.cowId
      )
    );
  } else {
    // For raised cows: Debit Asset, Credit Equity/Revenue (simplified)
    // In practice, this might involve multiple accounts for feed, labor, etc.
    lines.push(
      createJournalLine(
        DEPRECIATION_CONFIG.ACCOUNTS.DAIRY_COWS,
        `Cow acquisition - Raised #${data.cowTag}`,
        data.purchasePrice,
        'debit',
        data.cowId
      ),
      createJournalLine(
        '3000', // Equity account (simplified)
        `Investment in raised cow #${data.cowTag}`,
        data.purchasePrice,
        'credit',
        data.cowId
      )
    );
  }

  return ok({
    companyId: data.companyId,
    entryDate: data.entryDate,
    month: data.entryDate.getMonth() + 1,
    year: data.entryDate.getFullYear(),
    entryType: DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.ACQUISITION,
    description: `Cow Acquisition - ${data.acquisitionType} - Cow #${data.cowTag}`,
    totalAmount: data.purchasePrice,
    lines,
  });
};

/**
 * Validate that journal entry is balanced (debits = credits)
 */
export const validateJournalBalance = (entry: JournalEntry): Result<JournalEntry, ValidationError> => {
  const totalDebits = entry.lines.reduce((sum, line) => sum + line.debitAmount, 0);
  const totalCredits = entry.lines.reduce((sum, line) => sum + line.creditAmount, 0);
  
  const difference = Math.abs(totalDebits - totalCredits);
  
  if (difference > 0.01) { // Allow for small rounding differences
    return err(new ValidationError(
      `Journal entry is unbalanced: Debits $${totalDebits.toFixed(2)}, Credits $${totalCredits.toFixed(2)}`
    ));
  }
  
  return ok(entry);
};

/**
 * Create journal entry with automatic validation
 */
export const createJournalEntry = (
  type: 'depreciation' | 'disposition' | 'acquisition',
  data: DepreciationData | DispositionData | AcquisitionData
): Result<JournalEntry, ValidationError> => {
  let entryResult: Result<JournalEntry, ValidationError>;
  
  switch (type) {
    case 'depreciation':
      entryResult = buildDepreciationEntry(data as DepreciationData);
      break;
    case 'disposition':
      entryResult = buildDispositionEntry(data as DispositionData);
      break;
    case 'acquisition':
      entryResult = buildAcquisitionEntry(data as AcquisitionData);
      break;
    default:
      return err(new ValidationError(`Unknown journal entry type: ${type}`));
  }
  
  if (!entryResult.success) {
    return entryResult;
  }
  
  return validateJournalBalance(entryResult.data);
};