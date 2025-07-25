/**
 * High-performance journal automation system
 * Handles acquisition, depreciation, and disposition journals efficiently
 */

import { 
  buildDepreciationEntry,
  buildDispositionEntry,
  buildAcquisitionEntry,
  type JournalEntry,
  type DepreciationData,
  type DispositionData,
  type AcquisitionData,
} from './journal-builder';
import { 
  calculateCurrentDepreciationCached,
  type DepreciationInput,
} from '../cache/depreciation-cache';
import { 
  processBatch,
  type BatchProcessingOptions,
  type BatchResult,
} from '../batch/batch-processor';
import { DEPRECIATION_CONFIG } from '../config/depreciation-config';
import { isOk, ok, err, type Result } from '../types/result';

// Database types for journal operations
export interface CowRecord {
  id: string;
  tag_number: string;
  company_id: string;
  purchase_price: number;
  salvage_value: number;
  freshen_date: string;
  status: 'active' | 'disposed';
  created_at?: string;
}

export interface DispositionRecord {
  id: string;
  cow_id: string;
  company_id: string;
  disposition_type: 'sale' | 'death' | 'culled';
  disposition_date: string;
  sale_price?: number;
  reason?: string;
}

export interface JournalBatch {
  acquisitions: CowRecord[];
  dispositions: DispositionRecord[];
  monthlyDepreciation: {
    company_id: string;
    month: number;
    year: number;
    cows: CowRecord[];
  }[];
}

/**
 * Fast acquisition journal creation for new cows
 */
export const createAcquisitionJournals = async (
  cows: CowRecord[],
  options: BatchProcessingOptions = {}
): Promise<BatchResult<JournalEntry>> => {
  const processor = (cow: CowRecord): JournalEntry => {
    const acquisitionData: AcquisitionData = {
      companyId: cow.company_id,
      cowId: cow.id,
      cowTag: cow.tag_number,
      entryDate: new Date(cow.created_at || cow.freshen_date),
      purchasePrice: cow.purchase_price,
      acquisitionType: 'purchased',
    };

    const result = buildAcquisitionEntry(acquisitionData);
    if (!isOk(result)) {
      throw new Error(`Failed to create acquisition journal for cow ${cow.tag_number}: ${result.error.message}`);
    }
    
    return result.data;
  };

  return processBatch(cows, processor, {
    batchSize: 100, // Process 100 cows at a time
    delayBetweenBatches: 5, // 5ms delay to prevent blocking
    ...options,
  });
};

/**
 * Fast disposition journal creation for sold/died cows
 */
export const createDispositionJournals = async (
  dispositions: DispositionRecord[],
  cowData: Map<string, CowRecord>,
  options: BatchProcessingOptions = {}
): Promise<BatchResult<JournalEntry>> => {
  const processor = async (disposition: DispositionRecord): Promise<JournalEntry> => {
    const cow = cowData.get(disposition.cow_id);
    if (!cow) {
      throw new Error(`Cow data not found for disposition ${disposition.id}`);
    }

    // Calculate current book value at disposition date
    const depreciationInput: DepreciationInput = {
      purchasePrice: cow.purchase_price,
      salvageValue: cow.salvage_value,
      freshenDate: new Date(cow.freshen_date),
      depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
      currentValue: 0, // Will be calculated
    };

    const depreciationResult = calculateCurrentDepreciationCached(depreciationInput);
    if (!isOk(depreciationResult)) {
      throw new Error(`Failed to calculate depreciation for cow ${cow.tag_number}: ${depreciationResult.error.message}`);
    }

    const dispositionData: DispositionData = {
      companyId: cow.company_id,
      cowId: cow.id,
      cowTag: cow.tag_number,
      entryDate: new Date(disposition.disposition_date),
      dispositionType: disposition.disposition_type,
      purchasePrice: cow.purchase_price,
      accumulatedDepreciation: cow.purchase_price - depreciationResult.data.currentValue,
      bookValue: depreciationResult.data.currentValue,
      saleAmount: disposition.sale_price || 0,
    };

    const result = buildDispositionEntry(dispositionData);
    if (!isOk(result)) {
      throw new Error(`Failed to create disposition journal for cow ${cow.tag_number}: ${result.error.message}`);
    }
    
    return result.data;
  };

  return processBatch(dispositions, processor, {
    batchSize: 50, // Smaller batches due to calculations
    delayBetweenBatches: 10,
    ...options,
  });
};

/**
 * Monthly depreciation journal creation (optimized for large herds)
 */
export const createMonthlyDepreciationJournals = async (
  companyId: string,
  month: number,
  year: number,
  activeCows: CowRecord[],
  options: BatchProcessingOptions = {}
): Promise<Result<JournalEntry, Error>> => {
  try {
    // Calculate total depreciation for all active cows
    let totalMonthlyDepreciation = 0;
    const cowDepreciations: Array<{
      cowId: string;
      tagNumber: string;
      monthlyDepreciation: number;
    }> = [];

    // Process cows in batches to avoid memory issues
    const batchProcessor = async (cow: CowRecord) => {
      const depreciationInput: DepreciationInput = {
        purchasePrice: cow.purchase_price,
        salvageValue: cow.salvage_value,
        freshenDate: new Date(cow.freshen_date),
        depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
        currentValue: 0,
      };

      const result = calculateCurrentDepreciationCached(depreciationInput);
      if (isOk(result)) {
        const monthlyDepreciation = result.data.monthlyDepreciation;
        totalMonthlyDepreciation += monthlyDepreciation;
        cowDepreciations.push({
          cowId: cow.id,
          tagNumber: cow.tag_number,
          monthlyDepreciation,
        });
      }
      return result;
    };

    // Process all cows
    const batchResult = await processBatch(activeCows, batchProcessor, {
      batchSize: 200, // Large batches for depreciation calculations
      delayBetweenBatches: 5,
      ...options,
    });

    if (!batchResult.success || batchResult.errors.length > 0) {
      return err(new Error(`Depreciation calculation failed: ${batchResult.errors.join(', ')}`));
    }

    // Create single journal entry for the month (using first cow as example)
    const depreciationData: DepreciationData = {
      companyId,
      cowId: activeCows[0]?.id || '',
      cowTag: `Monthly for ${activeCows.length} cows`,
      entryDate: new Date(year, month - 1, 1),
      depreciationAmount: totalMonthlyDepreciation,
    };

    const journalResult = buildDepreciationEntry(depreciationData);
    return journalResult;

  } catch (error) {
    return err(error instanceof Error ? error : new Error('Unknown error in monthly depreciation'));
  }
};

/**
 * Unified journal processor for uploads
 * Handles all journal types efficiently during data uploads
 */
export const processUploadJournals = async (
  batch: JournalBatch,
  options: {
    onProgress?: (type: string, processed: number, total: number) => void;
    onError?: (type: string, error: string) => void;
  } = {}
): Promise<{
  acquisitions: BatchResult<JournalEntry>;
  dispositions: BatchResult<JournalEntry>;
  monthlyDepreciation: Array<Result<JournalEntry, Error>>;
  summary: {
    totalJournals: number;
    totalErrors: number;
    processingTime: number;
  };
}> => {
  const startTime = Date.now();
  
  // Process acquisitions
  const acquisitionResult = await createAcquisitionJournals(batch.acquisitions, {
    onProgress: (processed, total) => options.onProgress?.('acquisitions', processed, total),
  });

  // Process dispositions (need cow data for calculations)
  const cowDataMap = new Map<string, CowRecord>();
  batch.acquisitions.forEach(cow => cowDataMap.set(cow.id, cow));
  
  const dispositionResult = await createDispositionJournals(
    batch.dispositions, 
    cowDataMap,
    {
      onProgress: (processed, total) => options.onProgress?.('dispositions', processed, total),
    }
  );

  // Process monthly depreciation
  const monthlyResults: Array<Result<JournalEntry, Error>> = [];
  for (const monthlyData of batch.monthlyDepreciation) {
    const result = await createMonthlyDepreciationJournals(
      monthlyData.company_id,
      monthlyData.month,
      monthlyData.year,
      monthlyData.cows,
      {
        onProgress: (processed, total) => options.onProgress?.('monthly', processed, total),
      }
    );
    monthlyResults.push(result);
  }

  const totalJournals = acquisitionResult.results.length + 
                       dispositionResult.results.length + 
                       monthlyResults.filter(r => isOk(r)).length;
  
  const totalErrors = acquisitionResult.errors.length + 
                     dispositionResult.errors.length + 
                     monthlyResults.filter(r => !isOk(r)).length;

  return {
    acquisitions: acquisitionResult,
    dispositions: dispositionResult,
    monthlyDepreciation: monthlyResults,
    summary: {
      totalJournals,
      totalErrors,
      processingTime: Date.now() - startTime,
    },
  };
};

/**
 * Background journal processing for large operations
 * Uses streaming approach to handle very large datasets
 */
export const processJournalsInBackground = async (
  batch: JournalBatch,
  onComplete?: (summary: any) => void
): Promise<void> => {
  // This would be called from Edge functions without blocking the upload response
  try {
    const result = await processUploadJournals(batch, {
      onProgress: (type, processed, total) => {
        console.log(`Processing ${type}: ${processed}/${total}`);
      },
      onError: (type, error) => {
        console.error(`Error in ${type}: ${error}`);
      },
    });

    onComplete?.(result.summary);
  } catch (error) {
    console.error('Background journal processing failed:', error);
    onComplete?.({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
};