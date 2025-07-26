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
 * Process a disposition with proper order of operations:
 * 1. Catch up depreciation to disposition date
 * 2. Get accurate book values
 * 3. Create disposition record
 * 4. Update cow status
 * 5. Create journal entries with proper depreciation handling
 */
export async function processDisposition(input: DispositionInput): Promise<DispositionResult> {
  const { cowId, companyId, dispositionDate, dispositionType, saleAmount = 0, notes } = input;
  
  try {
    // Step 1: Catch up depreciation to disposition date
    console.log(`Processing disposition for cow ${cowId} - Step 1: Catching up depreciation to ${dispositionDate.toISOString().split('T')[0]}`);
    
    const { data: catchupResult, error: catchupError } = await supabase
      .rpc('catch_up_cow_depreciation_to_date', {
        p_cow_id: cowId,
        p_target_date: dispositionDate.toISOString().split('T')[0]
      });

    if (catchupError) {
      console.error("Depreciation catchup failed:", catchupError);
      return {
        success: false,
        error: `Depreciation catchup failed: ${catchupError.message}`
      };
    }

    // Step 2: Get updated cow data with accurate book values
    console.log(`Processing disposition for cow ${cowId} - Step 2: Getting updated cow data`);
    
    const { data: updatedCow, error: cowError } = await supabase
      .from('cows')
      .select('current_value, tag_number, total_depreciation, purchase_price')
      .eq('id', cowId)
      .single();

    if (cowError || !updatedCow) {
      return {
        success: false,
        error: `Failed to get updated cow data: ${cowError?.message || 'Cow not found'}`
      };
    }

    // Step 3: Calculate final values
    const finalBookValue = roundToPenny(updatedCow.current_value || 0);
    const saleAmountRounded = roundToPenny(saleAmount);
    const gainLoss = roundToPenny(saleAmountRounded - finalBookValue);

    // Step 4: Create disposition record
    console.log(`Processing disposition for cow ${cowId} - Step 3: Creating disposition record`);
    
    const dispositionData = {
      cow_id: cowId,
      disposition_date: dispositionDate.toISOString().split('T')[0],
      disposition_type: dispositionType,
      sale_amount: saleAmountRounded,
      final_book_value: finalBookValue,
      gain_loss: gainLoss,
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

    // Step 5: Update cow status
    console.log(`Processing disposition for cow ${cowId} - Step 4: Updating cow status`);
    
    const newStatus = dispositionType === 'sale' ? 'sold' : 'deceased';
    const { error: cowUpdateError } = await supabase
      .from('cows')
      .update({ 
        status: newStatus,
        disposition_id: dispositionRecord.id,
        // Set current_value to 0 for deceased cows since the asset no longer exists
        current_value: dispositionType === 'death' ? 0.00 : finalBookValue,
        updated_at: new Date().toISOString()
      })
      .eq('id', cowId);

    if (cowUpdateError) {
      return {
        success: false,
        error: `Failed to update cow status: ${cowUpdateError.message}`
      };
    }

    // Step 6: Create disposition journal entry with proper depreciation handling
    console.log(`Processing disposition for cow ${cowId} - Step 5: Creating journal entry`);
    
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
      finalBookValue,
      gainLoss
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