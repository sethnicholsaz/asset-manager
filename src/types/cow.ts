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
  acquisitionType: AcquisitionType;
  dispositionId?: string;
}

export interface CowDisposition {
  id: string;
  cowId: string;
  dispositionDate: Date;
  dispositionType: DispositionType;
  saleAmount: number;
  finalBookValue: number;
  gainLoss: number;
  notes?: string;
  journalEntryId?: string;
  createdAt: Date;
  updatedAt: Date;
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
  entryDate: Date;
  description: string;
  totalAmount: number;
  entryType: JournalEntryType;
  lines: JournalLine[];
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalLine {
  id: string;
  journalEntryId: string;
  accountCode: string;
  accountName: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  lineType: 'debit' | 'credit';
  createdAt: Date;
}

export type CowStatus = 'active' | 'sold' | 'deceased' | 'retired';
export type DepreciationMethod = 'straight-line' | 'declining-balance' | 'sum-of-years';
export type DispositionType = 'sale' | 'death' | 'culled';
export type JournalEntryType = 'depreciation' | 'disposition' | 'acquisition';
export type AcquisitionType = 'purchased' | 'raised';

export interface PurchasePriceDefault {
  id: string;
  birth_year: number;
  default_price: number;
  daily_accrual_rate: number;
  created_at: Date;
  updated_at: Date;
}

export interface DepreciationReport {
  month: number;
  year: number;
  totalDepreciation: number;
  entries: DepreciationEntry[];
  journalEntries: JournalEntry[];
}