/**
 * Centralized configuration for depreciation calculations and accounting
 */

export const DEPRECIATION_CONFIG = {
  /** Standard depreciation period for dairy cows in years */
  DEFAULT_YEARS: 5,
  
  /** Chart of accounts used in journal entries */
  ACCOUNTS: {
    // Asset accounts
    DAIRY_COWS: '1500',
    ACCUMULATED_DEPRECIATION: '1500.1',
    CASH: '1000',
    
    // Expense accounts
    DEPRECIATION_EXPENSE: '6100',
    
    // Gain/Loss accounts
    GAIN_ON_SALE: '8000',
    LOSS_ON_SALE: '9002',
    LOSS_ON_DEAD_COWS: '9001',
    LOSS_ON_CULLED_COWS: '9003',
    LOSS_ON_SALE_OF_ASSETS: '9000',
  },
  
  /** Account names for journal entries */
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
  
  /** Depreciation methods supported */
  DEPRECIATION_METHODS: {
    STRAIGHT_LINE: 'straight-line',
    DECLINING_BALANCE: 'declining-balance',
    SUM_OF_YEARS: 'sum-of-years',
  },
  
  /** Journal entry types */
  JOURNAL_ENTRY_TYPES: {
    DEPRECIATION: 'depreciation',
    DISPOSITION: 'disposition', 
    ACQUISITION: 'acquisition',
  },
  
  /** Disposition types and their corresponding loss accounts */
  DISPOSITION_ACCOUNTS: {
    sale: { gain: '8000', loss: '9002' },
    death: { loss: '9001' },
    culled: { loss: '9003' },
  },
} as const;

/**
 * Type-safe access to account codes
 */
export type AccountCode = keyof typeof DEPRECIATION_CONFIG.ACCOUNT_NAMES;
export type DepreciationMethod = typeof DEPRECIATION_CONFIG.DEPRECIATION_METHODS[keyof typeof DEPRECIATION_CONFIG.DEPRECIATION_METHODS];
export type JournalEntryType = typeof DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES[keyof typeof DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES];
export type DispositionType = keyof typeof DEPRECIATION_CONFIG.DISPOSITION_ACCOUNTS;

/**
 * Helper function to get account name by code
 */
export const getAccountName = (code: string): string => {
  return DEPRECIATION_CONFIG.ACCOUNT_NAMES[code as AccountCode] || 'Unknown Account';
};

/**
 * Helper function to get gain/loss account for disposition
 */
export const getDispositionAccount = (
  dispositionType: DispositionType,
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