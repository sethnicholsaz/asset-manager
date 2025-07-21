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

    // Handle both URL parameters and JSON body
    let cow_id: string | undefined;
    let company_id: string | undefined;

    const url = new URL(req.url);
    cow_id = url.searchParams.get("cow_id") || undefined;
    company_id = url.searchParams.get("company_id") || undefined;

    // If no URL params, try to get from JSON body
    if (!cow_id || !company_id) {
      try {
        const body = await req.json();
        cow_id = cow_id || body.cow_id;
        company_id = company_id || body.company_id;
      } catch (e) {
        // No JSON body, continue with URL params only
      }
    }

    // If no cow_id provided, process all active cows
    if (!cow_id) {
      console.log("Processing all active cows for depreciation catch-up");
      
      // Get all active cows
      const { data: cows, error: cowsError } = await supabase
        .from("cows")
        .select("*")
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

      // Process each cow
      const results = [];
      for (const cow of cows) {
        try {
          const result = await processCowDepreciation(supabase, cow);
          results.push(result);
        } catch (error) {
          console.error(`Error processing cow ${cow.id}:`, error);
          results.push({
            cow_id: cow.id,
            cow_tag: cow.tag_number,
            error: error.message
          });
        }
      }

      return new Response(
        JSON.stringify({
          message: "Bulk depreciation processing completed",
          processed_cows: results.length,
          results: results
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Processing depreciation catch-up for cow ${cow_id}`);

    // Get cow details
    const { data: cow, error: cowError } = await supabase
      .from("cows")
      .select("*")
      .eq("id", cow_id)
      .single();

    if (cowError) {
      console.error("Error fetching cow:", cowError);
      throw cowError;
    }

    if (!cow || cow.status !== 'active') {
      return new Response(
        JSON.stringify({ message: "Cow not found or not active" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const result = await processCowDepreciation(supabase, cow);

    return new Response(
      JSON.stringify({
        message: "Depreciation catch-up completed successfully",
        ...result
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in cow depreciation catch-up:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

async function processCowDepreciation(supabase: any, cow: any) {
  const { id: cow_id, company_id } = cow;

  // Check if cow already has depreciation records
  const { data: existingRecords, error: recordsError } = await supabase
    .from("cow_monthly_depreciation")
    .select("*")
    .eq("cow_id", cow_id)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1);

  if (recordsError) {
    console.error("Error checking existing records:", recordsError);
    throw recordsError;
  }

  // Calculate monthly depreciation
  const monthlyDepreciation = (cow.purchase_price - cow.salvage_value) / (5 * 12);
  console.log(`Cow ${cow.tag_number}: Monthly depreciation = $${monthlyDepreciation.toFixed(2)}`);

  // Calculate periods to process
  const freshenDate = new Date(cow.freshen_date);
  const endOf2024 = new Date('2024-12-31');
  const currentDate = new Date();
  
  let accumulatedDepreciation = 0;
  const entriesCreated = [];

  // Generate bulk entry for historical periods (freshen date through 2024)
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
      
      console.log(`Processing from ${freshenDate.toISOString().split('T')[0]} with bulk through 2024-12-31, then monthly from 2025-01-01`);

      // Create bulk journal entry for historical periods
      const { data: bulkJournalEntry, error: bulkJournalError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: company_id,
          description: `Historical depreciation through 2024 - Cow #${cow.tag_number}`,
          entry_date: '2024-12-31',
          entry_type: 'depreciation',
          total_amount: bulkDepreciation,
          posting_year: 2024,
          posting_month: 12
        })
        .select()
        .single();

      if (bulkJournalError) {
        console.error("Error creating bulk journal entry:", bulkJournalError);
        throw bulkJournalError;
      }

      // Create journal lines for the bulk entry
      const journalLines = [
        {
          journal_entry_id: bulkJournalEntry.id,
          account_code: "6100",
          account_name: "Depreciation Expense",
          description: `Historical depreciation through 2024 - Cow #${cow.tag_number}`,
          line_type: "debit",
          debit_amount: bulkDepreciation,
          credit_amount: 0
        },
        {
          journal_entry_id: bulkJournalEntry.id,
          account_code: "1510",
          account_name: "Accumulated Depreciation - Dairy Cows",
          description: `Historical depreciation through 2024 - Cow #${cow.tag_number}`,
          line_type: "credit",
          debit_amount: 0,
          credit_amount: bulkDepreciation
        }
      ];

      const { error: linesError } = await supabase
        .from("journal_lines")
        .insert(journalLines);

      if (linesError) {
        console.error("Error creating bulk journal lines:", linesError);
        throw linesError;
      }

      // Create individual cow monthly depreciation records for each period
      const depreciationRecords = [];
      let runningAccumulated = 0;
      
      for (const period of bulkPeriods) {
        runningAccumulated += monthlyDepreciation;
        const currentValue = cow.purchase_price - runningAccumulated;
        
        depreciationRecords.push({
          cow_id: cow_id,
          company_id: company_id,
          year: period.year,
          month: period.month,
          monthly_depreciation_amount: monthlyDepreciation,
          accumulated_depreciation: runningAccumulated,
          asset_value: currentValue,
          journal_entry_id: bulkJournalEntry.id
        });
      }

      const { error: depreciationError } = await supabase
        .from("cow_monthly_depreciation")
        .insert(depreciationRecords);

      if (depreciationError) {
        console.error("Error creating bulk depreciation records:", depreciationError);
        throw depreciationError;
      }

      accumulatedDepreciation = runningAccumulated;
      entriesCreated.push({
        type: 'bulk-2024',
        periods: bulkPeriods.length,
        total_depreciation: bulkDepreciation,
        accumulated: accumulatedDepreciation,
        journal_entry_id: bulkJournalEntry.id
      });

      console.log(`Created bulk 2024 entry for ${bulkPeriods.length} periods: $${bulkDepreciation.toFixed(2)}, accumulated: $${accumulatedDepreciation.toFixed(2)}`);
    }
  }

  // Create monthly entries for 2025 onwards
  const start2025 = new Date('2025-01-01');
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
      const { data: journalEntry, error: journalError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: company_id,
          description: `Monthly Depreciation - ${year}-${month.toString().padStart(2, '0')} - Cow #${cow.tag_number}`,
          entry_date: lastDayOfMonth.toISOString().split('T')[0],
          entry_type: 'depreciation',
          total_amount: monthlyDepreciation,
          posting_year: year,
          posting_month: month
        })
        .select()
        .single();

      if (journalError) {
        console.error("Error creating monthly journal entry:", journalError);
        throw journalError;
      }

      // Create journal lines
      const journalLines = [
        {
          journal_entry_id: journalEntry.id,
          account_code: "6100",
          account_name: "Depreciation Expense",
          description: `Monthly Depreciation - ${year}-${month.toString().padStart(2, '0')} - Cow #${cow.tag_number}`,
          line_type: "debit",
          debit_amount: monthlyDepreciation,
          credit_amount: 0
        },
        {
          journal_entry_id: journalEntry.id,
          account_code: "1510",
          account_name: "Accumulated Depreciation - Dairy Cows",
          description: `Monthly Depreciation - ${year}-${month.toString().padStart(2, '0')} - Cow #${cow.tag_number}`,
          line_type: "credit",
          debit_amount: 0,
          credit_amount: monthlyDepreciation
        }
      ];

      const { error: linesError } = await supabase
        .from("journal_lines")
        .insert(journalLines);

      if (linesError) {
        console.error("Error creating monthly journal lines:", linesError);
        throw linesError;
      }

      // Create cow monthly depreciation record
      const { error: depreciationError } = await supabase
        .from("cow_monthly_depreciation")
        .insert({
          cow_id: cow_id,
          company_id: company_id,
          year: year,
          month: month,
          monthly_depreciation_amount: monthlyDepreciation,
          accumulated_depreciation: accumulatedDepreciation,
          asset_value: currentValue,
          journal_entry_id: journalEntry.id
        });

      if (depreciationError) {
        console.error("Error creating monthly depreciation record:", depreciationError);
        throw depreciationError;
      }

      entriesCreated.push({
        type: 'monthly',
        period: `${year}-${month.toString().padStart(2, '0')}`,
        depreciation: monthlyDepreciation,
        accumulated: accumulatedDepreciation,
        journal_entry_id: journalEntry.id
      });

      console.log(`Created monthly entry for ${year}-${month}: $${monthlyDepreciation.toFixed(2)}, accumulated: $${accumulatedDepreciation.toFixed(2)}`);
      
      monthlyDate.setMonth(monthlyDate.getMonth() + 1);
    }
  }

  // Update cow's total depreciation and current value
  const { error: updateError } = await supabase
    .from("cows")
    .update({
      total_depreciation: accumulatedDepreciation,
      current_value: cow.purchase_price - accumulatedDepreciation,
      updated_at: new Date().toISOString()
    })
    .eq("id", cow_id);

  if (updateError) {
    console.error("Error updating cow:", updateError);
    throw updateError;
  }

  return {
    cow_id: cow_id,
    cow_tag: cow.tag_number,
    entries_created: entriesCreated.length,
    total_accumulated_depreciation: accumulatedDepreciation,
    current_value: cow.purchase_price - accumulatedDepreciation,
    entries: entriesCreated
  };
}

serve(handler);