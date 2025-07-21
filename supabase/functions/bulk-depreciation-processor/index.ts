import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { company_id, batch_size = 100 } = await req.json();
    
    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Starting bulk depreciation processing for company ${company_id}`);

    // Get all active cows for the company
    const { data: cows, error: cowsError } = await supabase
      .from("cows")
      .select("id, tag_number, purchase_price, salvage_value, freshen_date, company_id, current_value, total_depreciation")
      .eq("company_id", company_id)
      .eq("status", "active");

    if (cowsError) {
      console.error("Error fetching cows:", cowsError);
      throw cowsError;
    }

    if (!cows || cows.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active cows found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Found ${cows.length} active cows to process`);

    // Process cows in batches
    const totalCows = cows.length;
    const batches = Math.ceil(totalCows / batch_size);
    let processedCount = 0;
    let totalDepreciationRecords = 0;
    let totalJournalEntries = 0;

    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const startIndex = batchIndex * batch_size;
      const endIndex = Math.min(startIndex + batch_size, totalCows);
      const batchCows = cows.slice(startIndex, endIndex);

      console.log(`Processing batch ${batchIndex + 1}/${batches} (${batchCows.length} cows)`);

      const batchResult = await processCowBatch(supabase, batchCows);
      processedCount += batchResult.processedCount;
      totalDepreciationRecords += batchResult.depreciationRecords;
      totalJournalEntries += batchResult.journalEntries;

      console.log(`Batch ${batchIndex + 1} completed: ${batchResult.processedCount} cows processed`);
    }

    return new Response(
      JSON.stringify({
        message: "Bulk depreciation processing completed",
        total_cows: totalCows,
        processed_cows: processedCount,
        depreciation_records_created: totalDepreciationRecords,
        journal_entries_created: totalJournalEntries,
        batches_processed: batches
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in bulk depreciation processing:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

async function processCowBatch(supabase: any, cows: any[]) {
  const currentDate = new Date();
  const endOf2024 = new Date('2024-12-31');
  const start2025 = new Date('2025-01-01');
  
  const depreciationRecords = [];
  const journalEntries = [];
  const journalLines = [];
  const cowUpdates = [];

  for (const cow of cows) {
    const monthlyDepreciation = (cow.purchase_price - cow.salvage_value) / (5 * 12);
    const freshenDate = new Date(cow.freshen_date);
    let accumulatedDepreciation = 0;

    // Calculate historical periods (freshen date through 2024)
    if (freshenDate <= endOf2024) {
      const bulkPeriods = [];
      let periodDate = new Date(freshenDate.getFullYear(), freshenDate.getMonth(), 1);
      
      while (periodDate <= endOf2024) {
        bulkPeriods.push({
          year: periodDate.getFullYear(),
          month: periodDate.getMonth() + 1
        });
        periodDate.setMonth(periodDate.getMonth() + 1);
      }

      if (bulkPeriods.length > 0) {
        const bulkDepreciation = monthlyDepreciation * bulkPeriods.length;
        
        // Create bulk journal entry for historical periods
        const bulkJournalEntry = {
          id: crypto.randomUUID(),
          company_id: cow.company_id,
          description: `Historical depreciation through 2024 - Cow #${cow.tag_number}`,
          entry_date: '2024-12-31',
          entry_type: 'depreciation',
          total_amount: bulkDepreciation,
          posting_year: 2024,
          posting_month: 12
        };
        
        journalEntries.push(bulkJournalEntry);

        // Create journal lines for the bulk entry
        journalLines.push({
          id: crypto.randomUUID(),
          journal_entry_id: bulkJournalEntry.id,
          account_code: "6100",
          account_name: "Depreciation Expense",
          description: `Historical depreciation through 2024 - Cow #${cow.tag_number}`,
          line_type: "debit",
          debit_amount: bulkDepreciation,
          credit_amount: 0
        });

        journalLines.push({
          id: crypto.randomUUID(),
          journal_entry_id: bulkJournalEntry.id,
          account_code: "1510",
          account_name: "Accumulated Depreciation - Dairy Cows",
          description: `Historical depreciation through 2024 - Cow #${cow.tag_number}`,
          line_type: "credit",
          debit_amount: 0,
          credit_amount: bulkDepreciation
        });

        // Create individual depreciation records for each period
        let runningAccumulated = 0;
        for (const period of bulkPeriods) {
          runningAccumulated += monthlyDepreciation;
          const currentValue = cow.purchase_price - runningAccumulated;
          
          depreciationRecords.push({
            id: crypto.randomUUID(),
            cow_id: cow.id,
            company_id: cow.company_id,
            year: period.year,
            month: period.month,
            monthly_depreciation_amount: monthlyDepreciation,
            accumulated_depreciation: runningAccumulated,
            asset_value: currentValue,
            journal_entry_id: bulkJournalEntry.id
          });
        }

        accumulatedDepreciation = runningAccumulated;
      }
    }

    // Create monthly entries for 2025 onwards
    const effectiveStartDate = freshenDate > start2025 ? freshenDate : start2025;
    
    if (effectiveStartDate <= currentDate) {
      let monthlyDate = new Date(effectiveStartDate.getFullYear(), effectiveStartDate.getMonth(), 1);
      
      while (monthlyDate <= currentDate) {
        const year = monthlyDate.getFullYear();
        const month = monthlyDate.getMonth() + 1;
        
        // Skip current month if we're not at month end yet
        if (year === currentDate.getFullYear() && month === currentDate.getMonth() + 1) {
          break;
        }
        
        accumulatedDepreciation += monthlyDepreciation;
        const currentValue = cow.purchase_price - accumulatedDepreciation;
        const lastDayOfMonth = new Date(year, month, 0);
        
        // Create journal entry for this month
        const monthlyJournalEntry = {
          id: crypto.randomUUID(),
          company_id: cow.company_id,
          description: `Monthly Depreciation - ${year}-${month.toString().padStart(2, '0')} - Cow #${cow.tag_number}`,
          entry_date: lastDayOfMonth.toISOString().split('T')[0],
          entry_type: 'depreciation',
          total_amount: monthlyDepreciation,
          posting_year: year,
          posting_month: month
        };
        
        journalEntries.push(monthlyJournalEntry);

        // Create journal lines
        journalLines.push({
          id: crypto.randomUUID(),
          journal_entry_id: monthlyJournalEntry.id,
          account_code: "6100",
          account_name: "Depreciation Expense",
          description: `Monthly Depreciation - ${year}-${month.toString().padStart(2, '0')} - Cow #${cow.tag_number}`,
          line_type: "debit",
          debit_amount: monthlyDepreciation,
          credit_amount: 0
        });

        journalLines.push({
          id: crypto.randomUUID(),
          journal_entry_id: monthlyJournalEntry.id,
          account_code: "1510",
          account_name: "Accumulated Depreciation - Dairy Cows",
          description: `Monthly Depreciation - ${year}-${month.toString().padStart(2, '0')} - Cow #${cow.tag_number}`,
          line_type: "credit",
          debit_amount: 0,
          credit_amount: monthlyDepreciation
        });

        // Create cow monthly depreciation record
        depreciationRecords.push({
          id: crypto.randomUUID(),
          cow_id: cow.id,
          company_id: cow.company_id,
          year: year,
          month: month,
          monthly_depreciation_amount: monthlyDepreciation,
          accumulated_depreciation: accumulatedDepreciation,
          asset_value: currentValue,
          journal_entry_id: monthlyJournalEntry.id
        });
        
        monthlyDate.setMonth(monthlyDate.getMonth() + 1);
      }
    }

    // Prepare cow update
    cowUpdates.push({
      id: cow.id,
      total_depreciation: accumulatedDepreciation,
      current_value: cow.purchase_price - accumulatedDepreciation,
      updated_at: new Date().toISOString()
    });
  }

  // Perform bulk inserts
  console.log(`Inserting ${journalEntries.length} journal entries`);
  if (journalEntries.length > 0) {
    const { error: journalError } = await supabase
      .from("journal_entries")
      .insert(journalEntries);
    
    if (journalError) {
      console.error("Error inserting journal entries:", journalError);
      throw journalError;
    }
  }

  console.log(`Inserting ${journalLines.length} journal lines`);
  if (journalLines.length > 0) {
    const { error: linesError } = await supabase
      .from("journal_lines")
      .insert(journalLines);
    
    if (linesError) {
      console.error("Error inserting journal lines:", linesError);
      throw linesError;
    }
  }

  // Use upsert for depreciation records to handle duplicates
  console.log(`Upserting ${depreciationRecords.length} depreciation records`);
  if (depreciationRecords.length > 0) {
    const { error: depreciationError } = await supabase
      .from("cow_monthly_depreciation")
      .upsert(depreciationRecords, { 
        onConflict: 'cow_id,company_id,year,month',
        ignoreDuplicates: false 
      });
    
    if (depreciationError) {
      console.error("Error upserting depreciation records:", depreciationError);
      throw depreciationError;
    }
  }

  // Update cows in bulk - do individual updates since we're only updating specific fields
  console.log(`Updating ${cowUpdates.length} cow records`);
  if (cowUpdates.length > 0) {
    for (const cowUpdate of cowUpdates) {
      const { error: updateError } = await supabase
        .from("cows")
        .update({
          total_depreciation: cowUpdate.total_depreciation,
          current_value: cowUpdate.current_value,
          updated_at: cowUpdate.updated_at
        })
        .eq('id', cowUpdate.id);
      
      if (updateError) {
        console.error(`Error updating cow ${cowUpdate.id}:`, updateError);
        throw updateError;
      }
    }
  }

  return {
    processedCount: cows.length,
    depreciationRecords: depreciationRecords.length,
    journalEntries: journalEntries.length
  };
}

serve(handler);