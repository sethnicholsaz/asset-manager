/**
 * Standardized disposition processing system
 * Ensures consistent order of operations for all disposition creation flows
 */

import { supabase } from '@/integrations/supabase/client';
import { roundToPenny } from '@/lib/currency-utils';

export interface DispositionInput {
  cowId: string;
  companyId: string;
  dispositionDate: Date;
  dispositionType: 'sale' | 'death' | 'culled';
  saleAmount?: number;
  notes?: string;
}

export interface DispositionResult {
  success: boolean;
  dispositionId?: string;
  journalEntryId?: string;
  finalBookValue?: number;
  gainLoss?: number;
  error?: string;
}

/**
 * Process a disposition using the proven working database function
 * that handles depreciation catchup and journal creation correctly
 */
export async function processDisposition(input: DispositionInput): Promise<DispositionResult> {
  const { cowId, companyId, dispositionDate, dispositionType, saleAmount = 0, notes } = input;
  
  try {
    console.log(`Processing disposition for cow ${cowId} using database function`);
    
    // Step 1: Create disposition record first
    const dispositionData = {
      cow_id: cowId,
      disposition_date: dispositionDate.toISOString().split('T')[0],
      disposition_type: dispositionType,
      sale_amount: roundToPenny(saleAmount),
      final_book_value: 0, // Will be calculated by the database function
      gain_loss: 0, // Will be calculated by the database function
      notes: notes || null,
      company_id: companyId
    };

    const { data: dispositionRecord, error: dispositionError } = await supabase
      .from('cow_dispositions')
      .insert(dispositionData)
      .select()
      .single();
    
    if (dispositionError) {
      return {
        success: false,
        error: `Failed to create disposition record: ${dispositionError.message}`
      };
    }

    // Step 2: Update cow status
    const newStatus = dispositionType === 'sale' ? 'sold' : 'deceased';
    const { error: cowUpdateError } = await supabase
      .from('cows')
      .update({ 
        status: newStatus,
        disposition_id: dispositionRecord.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', cowId);

    if (cowUpdateError) {
      return {
        success: false,
        error: `Failed to update cow status: ${cowUpdateError.message}`
      };
    }

    // Step 3: Use the proven working function that handles depreciation catchup and journal creation
    const { data: journalResult, error: journalError } = await supabase
      .rpc('process_disposition_journal_with_catchup', {
        p_disposition_id: dispositionRecord.id
      });

    if (journalError) {
      console.error("Journal creation failed:", journalError);
      return {
        success: false,
        error: `Journal creation failed: ${journalError.message}`
      };
    }

    const journalResultParsed = journalResult as any;
    
    if (!journalResultParsed?.success) {
      return {
        success: false,
        error: `Journal creation failed: ${journalResultParsed?.error || 'Unknown error'}`
      };
    }

    console.log(`Successfully processed disposition for cow ${cowId}`);
    
    return {
      success: true,
      dispositionId: dispositionRecord.id,
      journalEntryId: journalResultParsed.journal_entry_id,
      finalBookValue: journalResultParsed.actual_book_value,
      gainLoss: journalResultParsed.gain_loss
    };

  } catch (error) {
    console.error("Disposition processing error:", error);
    return {
      success: false,
      error: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Process multiple dispositions in sequence to avoid race conditions
 */
export async function processDispositionBatch(inputs: DispositionInput[]): Promise<DispositionResult[]> {
  const results: DispositionResult[] = [];
  
  for (const input of inputs) {
    const result = await processDisposition(input);
    results.push(result);
    
    // Small delay between dispositions to avoid overwhelming the system
    if (inputs.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}