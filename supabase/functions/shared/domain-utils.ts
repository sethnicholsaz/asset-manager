/**
 * Shared domain utilities for Edge Functions
 * Provides functional domain logic in Deno/TypeScript environment
 */

// Round currency to the nearest penny
export const roundToPenny = (amount: number): number => {
  return Math.round(amount * 100) / 100;
};

// Configuration constants (mirrored from domain config)
export const DEPRECIATION_CONFIG = {
  DEFAULT_YEARS: 5,
  ACCOUNTS: {
    DAIRY_COWS: '1500',
    ACCUMULATED_DEPRECIATION: '1500.1',
    CASH: '1000',
    DEPRECIATION_EXPENSE: '6100',
    GAIN_ON_SALE: '8000',
    LOSS_ON_SALE: '9002',
    LOSS_ON_DEAD_COWS: '9001',
    LOSS_ON_CULLED_COWS: '9003',
    LOSS_ON_SALE_OF_ASSETS: '9000',
  },
  ACCOUNT_NAMES: {
    '1500': 'Dairy Cows',
    '1500.1': 'Accumulated Depreciation - Dairy Cows',
    '1000': 'Cash',
    '6100': 'Depreciation Expense',
    '8000': 'Gain on Sale of Cows',
    '9002': 'Loss on Sale of Cows',
    '9001': 'Loss on Dead Cows',
    '9003': 'Loss on Culled Cows',
    '9000': 'Loss on Sale of Assets',
  },
  JOURNAL_ENTRY_TYPES: {
    DEPRECIATION: 'depreciation' as const,
    DISPOSITION: 'disposition' as const,
    ACQUISITION: 'acquisition' as const,
  },
  DISPOSITION_ACCOUNTS: {
    sale: { gain: '8000', loss: '9002' },
    death: { loss: '9001' },
    culled: { loss: '9003' },
  },
} as const;

// Type definitions
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

export interface JournalLine {
  readonly cowId?: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly description: string;
  readonly debitAmount: number;
  readonly creditAmount: number;
  readonly lineType: 'debit' | 'credit';
}

export interface DepreciationData {
  readonly companyId: string;
  readonly cowId: string;
  readonly cowTag: string;
  readonly entryDate: Date;
  readonly depreciationAmount: number;
}

export interface DispositionData {
  readonly companyId: string;
  readonly cowId: string;
  readonly cowTag: string;
  readonly entryDate: Date;
  readonly dispositionType: 'sale' | 'death' | 'culled';
  readonly purchasePrice: number;
  readonly accumulatedDepreciation: number;
  readonly saleAmount: number;
  readonly bookValue: number;
}

// Pure utility functions
export const formatCurrency = (amount: number): string => {
  const rounded = Math.round(amount * 100) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
};

export const getAccountName = (code: string): string => {
  return DEPRECIATION_CONFIG.ACCOUNT_NAMES[code as keyof typeof DEPRECIATION_CONFIG.ACCOUNT_NAMES] || 'Unknown Account';
};

export const getDispositionAccount = (
  dispositionType: 'sale' | 'death' | 'culled',
  isGain: boolean
): { code: string; name: string } => {
  const accounts = DEPRECIATION_CONFIG.DISPOSITION_ACCOUNTS[dispositionType];
  
  if ('gain' in accounts && isGain) {
    return { 
      code: accounts.gain, 
      name: getAccountName(accounts.gain) 
    };
  }
  
  return { 
    code: accounts.loss, 
    name: getAccountName(accounts.loss) 
  };
};

// Journal line builder
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

// Journal entry builders
export const buildDepreciationEntry = (data: DepreciationData): JournalEntry => {
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

  return {
    companyId: data.companyId,
    entryDate: data.entryDate,
    month: data.entryDate.getMonth() + 1,
    year: data.entryDate.getFullYear(),
    entryType: DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.DEPRECIATION,
    description: `Monthly Depreciation - ${data.entryDate.getFullYear()}-${(data.entryDate.getMonth() + 1).toString().padStart(2, '0')} - Cow #${data.cowTag}`,
    totalAmount: data.depreciationAmount,
    lines,
  };
};

export const buildDispositionEntry = (data: DispositionData): JournalEntry => {
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
        `${gainLossText} on ${data.dispositionType} of cow #${data.cowTag} (Sale: ${formatCurrency(data.saleAmount)}, Book: ${formatCurrency(data.bookValue)})`,
        Math.abs(gainLoss),
        isGain ? 'credit' : 'debit',
        data.cowId
      )
    );
  }

  const totalAmount = Math.max(data.saleAmount, data.purchasePrice);

  return {
    companyId: data.companyId,
    entryDate: data.entryDate,
    month: data.entryDate.getMonth() + 1,
    year: data.entryDate.getFullYear(),
    entryType: DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.DISPOSITION,
    description: `Cow Disposition - ${data.dispositionType} - Cow #${data.cowTag}`,
    totalAmount,
    lines,
  };
};

// Validation function
export const validateJournalBalance = (entry: JournalEntry): { isValid: boolean; error?: string } => {
  const totalDebits = entry.lines.reduce((sum, line) => sum + line.debitAmount, 0);
  const totalCredits = entry.lines.reduce((sum, line) => sum + line.creditAmount, 0);
  
  const difference = Math.abs(totalDebits - totalCredits);
  
  if (difference > 0.01) { // Allow for small rounding differences
    return {
      isValid: false,
      error: `Journal entry is unbalanced: Debits ${formatCurrency(totalDebits)}, Credits ${formatCurrency(totalCredits)}`
    };
  }
  
  return { isValid: true };
};

// Depreciation calculation functions
export const calculateMonthlyDepreciation = (
  purchasePrice: number,
  salvageValue: number,
  depreciationYears = DEPRECIATION_CONFIG.DEFAULT_YEARS
): number => {
  const depreciableAmount = purchasePrice - salvageValue;
  return roundToPenny(depreciableAmount / (depreciationYears * 12));
};

export const calculateMonthsSinceStart = (startDate: Date, currentDate: Date): number => {
  const yearDiff = currentDate.getFullYear() - startDate.getFullYear();
  const monthDiff = currentDate.getMonth() - startDate.getMonth();
  return Math.max(0, yearDiff * 12 + monthDiff);
};