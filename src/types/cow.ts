export interface Cow {
  id: string;
  tagNumber: string;
  name?: string;
  birthDate: Date;
  freshenDate: Date;
  purchasePrice: number;
  salvageValue: number;
  assetType: AssetType;
  status: CowStatus;
  depreciationMethod: DepreciationMethod;
  currentValue: number;
  totalDepreciation: number;
}

export interface AssetType {
  id: string;
  name: string;
  defaultDepreciationYears: number;
  defaultDepreciationMethod: DepreciationMethod;
  defaultSalvagePercentage: number;
}

export interface DepreciationEntry {
  id: string;
  cowId: string;
  month: number;
  year: number;
  depreciationAmount: number;
  accumulatedDepreciation: number;
  bookValue: number;
  journalEntryId?: string;
}

export interface JournalEntry {
  id: string;
  date: Date;
  description: string;
  debits: JournalLine[];
  credits: JournalLine[];
  totalAmount: number;
}

export interface JournalLine {
  account: string;
  description: string;
  amount: number;
}

export type CowStatus = 'active' | 'sold' | 'deceased' | 'retired';
export type DepreciationMethod = 'straight-line' | 'declining-balance' | 'sum-of-years';

export interface DepreciationReport {
  month: number;
  year: number;
  totalDepreciation: number;
  entries: DepreciationEntry[];
  journalEntries: JournalEntry[];
}