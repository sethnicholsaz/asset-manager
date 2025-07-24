/**
 * Batch processing utilities for handling large datasets efficiently
 * Prevents UI blocking and improves performance for bulk operations
 */

import { 
  calculateCurrentDepreciationCached,
  type DepreciationInput,
  type DepreciationResult,
} from '../cache/depreciation-cache';
import { 
  createJournalEntry,
  type DepreciationData,
  type DispositionData,
  type AcquisitionData,
  type JournalEntry,
} from '../journal/journal-builder';
import { isOk, type Result } from '../types/result';

export interface BatchProcessingOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  onProgress?: (processed: number, total: number) => void;
  onBatchComplete?: (batchIndex: number, batchResults: any[]) => void;
}

export interface BatchResult<T> {
  success: boolean;
  results: T[];
  errors: string[];
  totalProcessed: number;
  processingTime: number;
}

/**
 * Process items in batches to prevent UI blocking
 */
export const processBatch = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R> | R,
  options: BatchProcessingOptions = {}
): Promise<BatchResult<R>> => {
  const {
    batchSize = 50,
    delayBetweenBatches = 10,
    onProgress,
    onBatchComplete,
  } = options;

  const startTime = Date.now();
  const results: R[] = [];
  const errors: string[] = [];
  let processed = 0;

  // Split items into batches
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchResults: R[] = [];

    // Process items in current batch
    for (const item of batch) {
      try {
        const result = await processor(item);
        results.push(result);
        batchResults.push(result);
        processed++;
        
        // Report progress
        onProgress?.(processed, items.length);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Item ${processed}: ${errorMessage}`);
        processed++;
      }
    }

    // Notify batch completion
    onBatchComplete?.(batchIndex, batchResults);

    // Delay between batches to prevent blocking
    if (batchIndex < batches.length - 1 && delayBetweenBatches > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  const processingTime = Date.now() - startTime;

  return {
    success: errors.length === 0,
    results,
    errors,
    totalProcessed: processed,
    processingTime,
  };
};

/**
 * Batch depreciation calculations
 */
export const batchCalculateDepreciation = async (
  inputs: DepreciationInput[],
  options: BatchProcessingOptions = {}
): Promise<BatchResult<DepreciationResult | null>> => {
  return processBatch(
    inputs,
    (input) => {
      const result = calculateCurrentDepreciationCached(input);
      return isOk(result) ? result.data : null;
    },
    options
  );
};

/**
 * Batch journal entry creation
 */
export const batchCreateJournalEntries = async (
  entries: Array<{
    type: 'depreciation' | 'disposition' | 'acquisition';
    data: DepreciationData | DispositionData | AcquisitionData;
  }>,
  options: BatchProcessingOptions = {}
): Promise<BatchResult<JournalEntry | null>> => {
  return processBatch(
    entries,
    (entry) => {
      const result = createJournalEntry(entry.type, entry.data);
      return isOk(result) ? result.data : null;
    },
    options
  );
};

/**
 * Debounced function creator for user input
 */
export const createDebounced = <T extends any[]>(
  func: (...args: T) => void,
  delay: number
): ((...args: T) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return (...args: T) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

/**
 * Throttled function creator for frequent updates
 */
export const createThrottled = <T extends any[]>(
  func: (...args: T) => void,
  limit: number
): ((...args: T) => void) => {
  let inThrottle: boolean;
  
  return (...args: T) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Chunk array into smaller arrays
 */
export const chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

/**
 * Process items with retry logic
 */
export const processWithRetry = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  maxRetries = 3,
  retryDelay = 1000
): Promise<BatchResult<R>> => {
  const results: R[] = [];
  const errors: string[] = [];
  const startTime = Date.now();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let lastError: Error | null = null;
    let success = false;

    // Retry logic
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await processor(item);
        results.push(result);
        success = true;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < maxRetries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        }
      }
    }

    if (!success && lastError) {
      errors.push(`Item ${i}: ${lastError.message} (failed after ${maxRetries + 1} attempts)`);
    }
  }

  return {
    success: errors.length === 0,
    results,
    errors,
    totalProcessed: items.length,
    processingTime: Date.now() - startTime,
  };
};

/**
 * Memory-efficient streaming processor for very large datasets
 */
export const createStreamProcessor = <T, R>(
  processor: (item: T) => Promise<R> | R,
  options: {
    onResult?: (result: R, index: number) => void;
    onError?: (error: string, index: number) => void;
    batchSize?: number;
  } = {}
) => {
  const { onResult, onError, batchSize = 100 } = options;
  let currentBatch: T[] = [];
  let index = 0;

  const processBatch = async () => {
    if (currentBatch.length === 0) return;

    const batch = [...currentBatch];
    currentBatch = [];

    for (const item of batch) {
      try {
        const result = await processor(item);
        onResult?.(result, index);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        onError?.(errorMessage, index);
      }
      index++;
    }
  };

  return {
    add: async (item: T) => {
      currentBatch.push(item);
      if (currentBatch.length >= batchSize) {
        await processBatch();
      }
    },
    
    flush: async () => {
      await processBatch();
    },
    
    getProcessedCount: () => index,
  };
};