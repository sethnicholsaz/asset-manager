/**
 * Zod validation schemas for cow-related data structures
 */

import { z } from 'zod';
import { DEPRECIATION_CONFIG } from '../config/depreciation-config';

/**
 * Schema for cow basic information
 */
export const CowSchema = z.object({
  id: z.string().uuid('Invalid cow ID format'),
  tagNumber: z.string().min(1, 'Tag number is required').max(50, 'Tag number too long'),
  name: z.string().max(100, 'Name too long').optional(),
  birthDate: z.date().max(new Date(), 'Birth date cannot be in the future'),
  freshenDate: z.date().max(new Date(), 'Freshen date cannot be in the future'),
  purchasePrice: z.number().positive('Purchase price must be positive'),
  salvageValue: z.number().min(0, 'Salvage value cannot be negative'),
  assetType: z.string().min(1, 'Asset type is required'),
  status: z.enum(['active', 'sold', 'deceased', 'retired'], {
    errorMap: () => ({ message: 'Invalid status' })
  }),
  depreciationMethod: z.enum([
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.DECLINING_BALANCE,
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.SUM_OF_YEARS,
  ] as const, {
    errorMap: () => ({ message: 'Invalid depreciation method' })
  }),
  currentValue: z.number().min(0, 'Current value cannot be negative'),
  totalDepreciation: z.number().min(0, 'Total depreciation cannot be negative'),
  acquisitionType: z.enum(['purchased', 'raised'], {
    errorMap: () => ({ message: 'Invalid acquisition type' })
  }),
  companyId: z.string().uuid('Invalid company ID format'),
}).refine(
  (data) => data.salvageValue < data.purchasePrice,
  {
    message: 'Salvage value must be less than purchase price',
    path: ['salvageValue'],
  }
).refine(
  (data) => data.freshenDate >= data.birthDate,
  {
    message: 'Freshen date must be after birth date',
    path: ['freshenDate'],
  }
);

/**
 * Schema for cow creation (without generated fields)
 */
export const CreateCowSchema = z.object({
  id: z.string().uuid('Invalid cow ID format').optional(),
  tagNumber: z.string().min(1, 'Tag number is required').max(50, 'Tag number too long'),
  name: z.string().max(100, 'Name too long').optional(),
  birthDate: z.date().max(new Date(), 'Birth date cannot be in the future'),
  freshenDate: z.date().max(new Date(), 'Freshen date cannot be in the future'),
  purchasePrice: z.number().positive('Purchase price must be positive'),
  salvageValue: z.number().min(0, 'Salvage value cannot be negative'),
  assetType: z.string().min(1, 'Asset type is required'),
  status: z.enum(['active', 'sold', 'deceased', 'retired'], {
    errorMap: () => ({ message: 'Invalid status' })
  }),
  depreciationMethod: z.enum([
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.DECLINING_BALANCE,
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.SUM_OF_YEARS,
  ] as const, {
    errorMap: () => ({ message: 'Invalid depreciation method' })
  }),
  currentValue: z.number().min(0, 'Current value cannot be negative').optional(),
  totalDepreciation: z.number().min(0, 'Total depreciation cannot be negative').optional(),
  acquisitionType: z.enum(['purchased', 'raised'], {
    errorMap: () => ({ message: 'Invalid acquisition type' })
  }),
  companyId: z.string().uuid('Invalid company ID format'),
}).refine(
  (data) => data.salvageValue < data.purchasePrice,
  {
    message: 'Salvage value must be less than purchase price',
    path: ['salvageValue'],
  }
).refine(
  (data) => data.freshenDate >= data.birthDate,
  {
    message: 'Freshen date must be after birth date',
    path: ['freshenDate'],
  }
);

/**
 * Schema for cow updates (all fields optional except ID)
 */
export const UpdateCowSchema = z.object({
  id: z.string().uuid('Invalid cow ID format'),
  tagNumber: z.string().min(1, 'Tag number is required').max(50, 'Tag number too long').optional(),
  name: z.string().max(100, 'Name too long').optional(),
  birthDate: z.date().max(new Date(), 'Birth date cannot be in the future').optional(),
  freshenDate: z.date().max(new Date(), 'Freshen date cannot be in the future').optional(),
  purchasePrice: z.number().positive('Purchase price must be positive').optional(),
  salvageValue: z.number().min(0, 'Salvage value cannot be negative').optional(),
  assetType: z.string().min(1, 'Asset type is required').optional(),
  status: z.enum(['active', 'sold', 'deceased', 'retired']).optional(),
  depreciationMethod: z.enum([
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.DECLINING_BALANCE,
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.SUM_OF_YEARS,
  ] as const).optional(),
  currentValue: z.number().min(0, 'Current value cannot be negative').optional(),
  totalDepreciation: z.number().min(0, 'Total depreciation cannot be negative').optional(),
  acquisitionType: z.enum(['purchased', 'raised']).optional(),
  companyId: z.string().uuid('Invalid company ID format').optional(),
});

/**
 * Schema for cow disposition
 */
export const CowDispositionSchema = z.object({
  id: z.string().uuid('Invalid disposition ID format').optional(),
  cowId: z.string().uuid('Invalid cow ID format'),
  dispositionDate: z.date().max(new Date(), 'Disposition date cannot be in the future'),
  dispositionType: z.enum(['sale', 'death', 'culled'], {
    errorMap: () => ({ message: 'Invalid disposition type' })
  }),
  saleAmount: z.number().min(0, 'Sale amount cannot be negative'),
  finalBookValue: z.number().min(0, 'Final book value cannot be negative'),
  gainLoss: z.number(),
  notes: z.string().max(500, 'Notes too long').optional(),
  companyId: z.string().uuid('Invalid company ID format'),
}).refine(
  (data) => {
    // If it's a death or culled, sale amount should be 0
    if (data.dispositionType !== 'sale' && data.saleAmount > 0) {
      return false;
    }
    return true;
  },
  {
    message: 'Sale amount should be 0 for non-sale dispositions',
    path: ['saleAmount'],
  }
);

/**
 * Schema for depreciation input
 */
export const DepreciationInputSchema = z.object({
  purchasePrice: z.number().positive('Purchase price must be positive'),
  salvageValue: z.number().min(0, 'Salvage value cannot be negative'),
  freshenDate: z.date().max(new Date(), 'Freshen date cannot be in the future'),
  depreciationMethod: z.enum([
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.DECLINING_BALANCE,
    DEPRECIATION_CONFIG.DEPRECIATION_METHODS.SUM_OF_YEARS,
  ] as const),
  currentValue: z.number().min(0).optional(),
}).refine(
  (data) => data.salvageValue < data.purchasePrice,
  {
    message: 'Salvage value must be less than purchase price',
    path: ['salvageValue'],
  }
);

/**
 * Schema for journal entry
 */
export const JournalEntrySchema = z.object({
  id: z.string().uuid().optional(),
  companyId: z.string().uuid('Invalid company ID format'),
  entryDate: z.date(),
  month: z.number().int().min(1, 'Month must be 1-12').max(12, 'Month must be 1-12'),
  year: z.number().int().min(1900, 'Invalid year').max(2100, 'Invalid year'),
  entryType: z.enum([
    DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.DEPRECIATION,
    DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.DISPOSITION,
    DEPRECIATION_CONFIG.JOURNAL_ENTRY_TYPES.ACQUISITION,
  ] as const),
  description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
  totalAmount: z.number().min(0, 'Total amount cannot be negative'),
});

/**
 * Schema for journal line
 */
export const JournalLineSchema = z.object({
  id: z.string().uuid().optional(),
  journalEntryId: z.string().uuid('Invalid journal entry ID format'),
  cowId: z.string().max(50).optional(),
  accountCode: z.string().min(1, 'Account code is required').max(20, 'Account code too long'),
  accountName: z.string().min(1, 'Account name is required').max(100, 'Account name too long'),
  description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
  debitAmount: z.number().min(0, 'Debit amount cannot be negative'),
  creditAmount: z.number().min(0, 'Credit amount cannot be negative'),
  lineType: z.enum(['debit', 'credit'], {
    errorMap: () => ({ message: 'Invalid line type' })
  }),
}).refine(
  (data) => (data.debitAmount > 0) !== (data.creditAmount > 0),
  {
    message: 'Entry must have either debit or credit amount, but not both',
    path: ['debitAmount', 'creditAmount'],
  }
).refine(
  (data) => (data.lineType === 'debit') === (data.debitAmount > 0),
  {
    message: 'Line type must match the amount type',
    path: ['lineType'],
  }
);

/**
 * Utility function to safely parse and validate data
 */
export const validateCow = (data: unknown) => {
  return CowSchema.safeParse(data);
};

export const validateCreateCow = (data: unknown) => {
  return CreateCowSchema.safeParse(data);
};

export const validateUpdateCow = (data: unknown) => {
  return UpdateCowSchema.safeParse(data);
};

export const validateDisposition = (data: unknown) => {
  return CowDispositionSchema.safeParse(data);
};

export const validateDepreciationInput = (data: unknown) => {
  return DepreciationInputSchema.safeParse(data);
};

export const validateJournalEntry = (data: unknown) => {
  return JournalEntrySchema.safeParse(data);
};

export const validateJournalLine = (data: unknown) => {
  return JournalLineSchema.safeParse(data);
};

/**
 * Type definitions derived from schemas
 */
export type CowData = z.infer<typeof CowSchema>;
export type CreateCowData = z.infer<typeof CreateCowSchema>;
export type UpdateCowData = z.infer<typeof UpdateCowSchema>;
export type CowDispositionData = z.infer<typeof CowDispositionSchema>;
export type DepreciationInputData = z.infer<typeof DepreciationInputSchema>;
export type JournalEntryData = z.infer<typeof JournalEntrySchema>;
export type JournalLineData = z.infer<typeof JournalLineSchema>;