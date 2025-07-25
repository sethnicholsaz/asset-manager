/**
 * High-performance database operations for journal entries
 * Optimized for bulk operations and minimal database round trips
 */

import { createClient } from '@supabase/supabase-js';
import { type JournalEntry, type JournalLine } from './journal-builder';
import { type Result, type Err, ok, err, isErr } from '../types/result';

export interface JournalPersistenceOptions {
  batchSize?: number;
  retryAttempts?: number;
  validateBalance?: boolean;
}

export interface JournalPersistenceResult {
  journalEntriesCreated: number;
  journalLinesCreated: number;
  errors: string[];
  processingTime: number;
}

/**
 * Efficiently persist journal entries to database using bulk operations
 */
export const persistJournalsBatch = async (
  supabase: ReturnType<typeof createClient>,
  journals: JournalEntry[],
  options: JournalPersistenceOptions = {}
): Promise<Result<JournalPersistenceResult, Error>> => {
  const {
    batchSize = 100,
    retryAttempts = 3,
    validateBalance = true,
  } = options;

  const startTime = Date.now();
  let journalEntriesCreated = 0;
  let journalLinesCreated = 0;
  const errors: string[] = [];

  try {
    // Validate journal balance before persistence
    if (validateBalance) {
      for (const journal of journals) {
        const totalDebits = journal.lines.reduce((sum, line) => sum + line.debitAmount, 0);
        const totalCredits = journal.lines.reduce((sum, line) => sum + line.creditAmount, 0);
        
        if (Math.abs(totalDebits - totalCredits) > 0.01) {
          errors.push(`Journal ${journal.description} is not balanced: Debits=${totalDebits}, Credits=${totalCredits}`);
        }
      }
      
      if (errors.length > 0) {
        return err(new Error(`Journal validation failed: ${errors.join('; ')}`));
      }
    }

    // Process journals in batches
    for (let i = 0; i < journals.length; i += batchSize) {
      const batch = journals.slice(i, i + batchSize);
      
      try {
        await persistJournalBatch(supabase, batch, retryAttempts);
        journalEntriesCreated += batch.length;
        journalLinesCreated += batch.reduce((sum, j) => sum + j.lines.length, 0);
      } catch (error) {
        const errorMsg = `Batch ${i}-${i + batch.length - 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    const result: JournalPersistenceResult = {
      journalEntriesCreated,
      journalLinesCreated,
      errors,
      processingTime: Date.now() - startTime,
    };

    return ok(result);

  } catch (error) {
    return err(error instanceof Error ? error : new Error('Unknown persistence error'));
  }
};

/**
 * Persist a single batch of journals with retry logic
 */
const persistJournalBatch = async (
  supabase: ReturnType<typeof createClient>,
  journals: JournalEntry[],
  retryAttempts: number
): Promise<void> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retryAttempts; attempt++) {
    try {
      // Start transaction
      const { data, error } = await supabase.rpc('persist_journal_batch', {
        journal_entries: journals.map(j => ({
          company_id: j.companyId,
          entry_date: j.entryDate.toISOString(),
          month: j.month,
          year: j.year,
          entry_type: j.entryType,
          description: j.description,
          total_amount: j.totalAmount,
          status: 'posted',
        })),
        journal_lines: journals.flatMap(j => 
          j.lines.map(line => ({
            journal_entry_temp_id: j.description, // Temporary ID for matching
            cow_id: line.cowId,
            account_code: line.accountCode,
            account_name: line.accountName,
            description: line.description,
            debit_amount: line.debitAmount,
            credit_amount: line.creditAmount,
            line_type: line.lineType,
          }))
        ),
      });

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      // Success - exit retry loop
      return;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown database error');
      
      if (attempt < retryAttempts - 1) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw lastError || new Error('Max retry attempts exceeded');
};

/**
 * Check for duplicate journal entries before creation
 */
export const checkDuplicateJournals = async (
  supabase: ReturnType<typeof createClient>,
  journals: JournalEntry[]
): Promise<Result<JournalEntry[], Error>> => {
  try {
    const uniqueEntries: JournalEntry[] = [];
    
    // Check each journal for duplicates
    for (const journal of journals) {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('company_id', journal.companyId)
        .eq('entry_type', journal.entryType)
        .eq('month', journal.month)
        .eq('year', journal.year)
        .limit(1);

      if (error) {
        return err(new Error(`Duplicate check failed: ${error.message}`));
      }

      if (data.length === 0) {
        uniqueEntries.push(journal);
      }
    }

    return ok(uniqueEntries);

  } catch (error) {
    return err(error instanceof Error ? error : new Error('Duplicate check error'));
  }
};

/**
 * Fast journal creation for upload scenarios
 * Optimized for minimal database locks and maximum throughput
 */
export const createUploadJournals = async (
  supabase: ReturnType<typeof createClient>,
  journals: JournalEntry[],
  options: {
    skipDuplicateCheck?: boolean;
    backgroundMode?: boolean;
  } = {}
): Promise<Result<JournalPersistenceResult, Error>> => {
  try {
    let journalsToCreate = journals;

    // Check for duplicates unless skipped
    if (!options.skipDuplicateCheck) {
      const duplicateResult = await checkDuplicateJournals(supabase, journals);
      if (isErr(duplicateResult)) {
        return err((duplicateResult as Err<Error>).error);
      }
      journalsToCreate = duplicateResult.data;
    }

    if (journalsToCreate.length === 0) {
      return ok({
        journalEntriesCreated: 0,
        journalLinesCreated: 0,
        errors: [],
        processingTime: 0,
      });
    }

    // Use different batch sizes based on mode
    const batchSize = options.backgroundMode ? 200 : 50;
    
    return await persistJournalsBatch(supabase, journalsToCreate, {
      batchSize,
      retryAttempts: 2,
      validateBalance: true,
    });

  } catch (error) {
    return err(error instanceof Error ? error : new Error('Upload journal creation failed'));
  }
};

/**
 * Clean up failed or incomplete journal entries
 */
export const cleanupFailedJournals = async (
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  olderThanMinutes = 30
): Promise<void> => {
  try {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - olderThanMinutes);

    // Find journal entries without corresponding lines (incomplete)
    const { error } = await supabase.rpc('cleanup_incomplete_journals', {
      company_id: companyId,
      cutoff_time: cutoffTime.toISOString(),
    });

    if (error) {
      console.error('Journal cleanup failed:', error);
    }

  } catch (error) {
    console.error('Journal cleanup error:', error);
  }
};

/**
 * Get journal summary for reporting
 */
export const getJournalSummary = async (
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  month: number,
  year: number
): Promise<Result<{
  acquisitions: number;
  dispositions: number;
  depreciation: number;
  totalAmount: number;
}, Error>> => {
  try {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('entry_type, total_amount')
      .eq('company_id', companyId)
      .eq('month', month)
      .eq('year', year)
      .eq('status', 'posted');

    if (error) {
      return err(new Error(`Journal summary query failed: ${error.message}`));
    }

    const summary = {
      acquisitions: 0,
      dispositions: 0,
      depreciation: 0,
      totalAmount: 0,
    };

    data.forEach(entry => {
      const totalAmount = Number(entry.total_amount) || 0;
      summary.totalAmount += totalAmount;
      
      switch (entry.entry_type) {
        case 'acquisition':
          summary.acquisitions += totalAmount;
          break;
        case 'disposition':
          summary.dispositions += totalAmount;
          break;
        case 'depreciation':
          summary.depreciation += totalAmount;
          break;
      }
    });

    return ok(summary);

  } catch (error) {
    return err(error instanceof Error ? error : new Error('Journal summary error'));
  }
};