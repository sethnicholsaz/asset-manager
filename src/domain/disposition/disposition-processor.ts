/**
 * Enhanced disposition processing system
 * Handles partial month depreciation and ensures accurate book value calculations
 */

import { supabase } from '@/integrations/supabase/client';
import { roundToPenny } from '@/lib/currency-utils';
import { calculateCurrentDepreciation } from '../depreciation/depreciation-calculator';

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
  partialMonthDepreciation?: number;
  error?: string;
}

/**
 * Calculate partial month depreciation up to disposition date
 */
const calculatePartialMonthDepreciation = (
  purchasePrice: number,
  salvageValue: number,
  freshenDate: Date,
  dispositionDate: Date
): number => {
  const monthlyDepreciation = (purchasePrice - salvageValue) / (5 * 12);
  const dispositionDay = dispositionDate.getDate();
  const daysInMonth = new Date(dispositionDate.getFullYear(), dispositionDate.getMonth() + 1, 0).getDate();
  
  // Calculate partial month depreciation based on days in month
  const partialDepreciation = (monthlyDepreciation * dispositionDay) / daysInMonth;
  
  return roundToPenny(partialDepreciation);
};

/**
 * Enhanced disposition processing with proper depreciation calculations
 */
export async function processDisposition(input: DispositionInput): Promise<DispositionResult> {
  const { cowId, companyId, dispositionDate, dispositionType, saleAmount = 0, notes } = input;
  
  try {
    console.log(`Processing enhanced disposition for cow ${cowId} on ${dispositionDate.toISOString().split('T')[0]}`);
    
    // Check if disposition already exists for this cow
    const { data: existingDisposition, error: checkError } = await supabase
      .from('cow_dispositions')
      .select('*')
      .eq('cow_id', cowId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing disposition:', checkError);
      return { 
        success: false, 
        error: `Failed to check existing disposition: ${checkError.message}` 
      };
    }

    if (existingDisposition) {
      console.log('Disposition already exists for this cow:', existingDisposition);
      return { 
        success: false, 
        error: 'A disposition record already exists for this cow. Please use the reinstate function to reverse the existing disposition before creating a new one.' 
      };
    }

    // Get cow details for calculations
    const { data: cow, error: cowError } = await supabase
      .from('cows')
      .select('*')
      .eq('id', cowId)
      .single();

    if (cowError || !cow) {
      return {
        success: false,
        error: `Failed to fetch cow details: ${cowError?.message || 'Cow not found'}`
      };
    }

    // Calculate partial month depreciation if disposition is mid-month
    const dispositionDay = dispositionDate.getDate();
    const daysInMonth = new Date(dispositionDate.getFullYear(), dispositionDate.getMonth() + 1, 0).getDate();
    const isMidMonth = dispositionDay < daysInMonth;
    
    let partialMonthDepreciation = 0;
    if (isMidMonth) {
      partialMonthDepreciation = calculatePartialMonthDepreciation(
        cow.purchase_price,
        cow.salvage_value,
        new Date(cow.freshen_date),
        dispositionDate
      );
      console.log(`Partial month depreciation calculated: $${partialMonthDepreciation} (${dispositionDay}/${daysInMonth} days)`);
    }

    // Step 1: Create disposition record with calculated values
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

    // Step 3: Use the enhanced database function that handles partial month depreciation
    const { data: journalResult, error: journalError } = await supabase
      .rpc('process_disposition_journal_enhanced', {
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
    console.log(`Final book value: $${journalResultParsed.actual_book_value}`);
    console.log(`Gain/Loss: $${journalResultParsed.gain_loss}`);
    
    return {
      success: true,
      dispositionId: dispositionRecord.id,
      journalEntryId: journalResultParsed.journal_entry_id,
      finalBookValue: journalResultParsed.actual_book_value,
      gainLoss: journalResultParsed.gain_loss,
      partialMonthDepreciation: isMidMonth ? partialMonthDepreciation : undefined
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