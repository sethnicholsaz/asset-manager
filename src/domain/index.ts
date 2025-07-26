/**
 * Domain layer exports
 * Centralizes access to all domain functionality
 */

// Configuration
export { 
  DEPRECIATION_CONFIG,
  getAccountName,
  getDispositionAccount,
  type AccountCode,
  type DepreciationMethod,
  type JournalEntryType,
  type DispositionType,
} from './config/depreciation-config';

// Types and Result handling
export {
  ok,
  err,
  isOk,
  isErr,
  map,
  chain,
  mapErr,
  unwrap,
  unwrapOr,
  sequence,
  ValidationError,
  CalculationError,
  DatabaseError,
  type Result,
  type Ok,
  type Err,
} from './types/result';

// Depreciation calculations
export {
  calculateMonthlyDepreciation,
  calculateCurrentDepreciation,
  generateDepreciationSchedule,
  calculateMonthsBetween,
  formatCurrency,
  formatDate,
  type DepreciationInput,
  type DepreciationResult,
  type DepreciationEntry,
} from './depreciation/depreciation-calculator';

// Journal entry building
export {
  buildDepreciationEntry,
  buildDispositionEntry,
  buildAcquisitionEntry,
  createJournalEntry,
  validateJournalBalance,
  type JournalEntry,
  type JournalLine,
  type DepreciationData,
  type DispositionData,
  type AcquisitionData,
} from './journal/journal-builder';

// Validation schemas
export {
  CowSchema,
  CreateCowSchema,
  UpdateCowSchema,
  CowDispositionSchema,
  DepreciationInputSchema,
  JournalEntrySchema,
  JournalLineSchema,
  validateCow,
  validateCreateCow,
  validateUpdateCow,
  validateDisposition,
  validateDepreciationInput,
  validateJournalEntry,
  validateJournalLine,
  type CowData,
  type CreateCowData,
  type UpdateCowData,
  type CowDispositionData,
  type DepreciationInputData,
  type JournalEntryData,
  type JournalLineData,
} from './validation/cow-schemas';

// Performance optimizations - Caching
export {
  calculateCurrentDepreciationCached,
  calculateBatchDepreciationCached,
  cachePriceDefaults,
  getCachedPriceDefaults,
  invalidateDepreciationCache,
  invalidatePriceDefaultsCache,
  getCacheStats,
} from './cache/depreciation-cache';

// Performance optimizations - Batch processing
export {
  processBatch,
  batchCalculateDepreciation,
  batchCreateJournalEntries,
  createDebounced,
  createThrottled,
  chunkArray,
  processWithRetry,
  createStreamProcessor,
  type BatchProcessingOptions,
  type BatchResult,
} from './batch/batch-processor';

// Journal automation and database operations
export {
  createAcquisitionJournals,
  createDispositionJournals,
  createMonthlyDepreciationJournals,
  processUploadJournals,
  processJournalsInBackground,
  type CowRecord,
  type DispositionRecord,
  type JournalBatch,
} from './journal/journal-automation';

export {
  persistJournalsBatch,
  checkDuplicateJournals,
  createUploadJournals,
  cleanupFailedJournals,
  getJournalSummary,
  type JournalPersistenceOptions,
  type JournalPersistenceResult,
} from './journal/journal-database';

// Disposition processing
export {
  processDisposition,
  processDispositionBatch,
  type DispositionInput,
  type DispositionResult,
} from './disposition/disposition-processor';