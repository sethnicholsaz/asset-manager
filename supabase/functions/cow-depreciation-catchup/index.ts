import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CowDepreciationRequest {
  cow_id: string;
  company_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { cow_id, company_id }: CowDepreciationRequest = await req.json();

    console.log(`Processing depreciation catch-up for cow ${cow_id}`);

    // Get cow details
    const { data: cow, error: cowError } = await supabase
      .from("cows")
      .select("*")
      .eq("id", cow_id)
      .eq("company_id", company_id)
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

    // Get depreciation settings
    const { data: depreciationSettings } = await supabase
      .from("depreciation_settings")
      .select("*")
      .eq("company_id", company_id)
      .single();

    const defaultDepreciationYears = depreciationSettings?.default_depreciation_years || 5;
    const monthsInService = defaultDepreciationYears * 12;
    const monthlyDepreciation = (cow.purchase_price - cow.salvage_value) / monthsInService;

    console.log(`Cow ${cow.tag_number}: Monthly depreciation = $${monthlyDepreciation.toFixed(2)}`);

    const freshenDate = new Date(cow.freshen_date);
    const currentDate = new Date();
    const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);

    // Don't go before 2024
    const earliestDate = new Date('2024-01-01');
    const startDate = freshenDate < earliestDate ? earliestDate : freshenDate;

    let processDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const entriesCreated = [];
    let accumulatedDepreciation = 0;

    console.log(`Processing from ${processDate.toISOString().split('T')[0]} to ${lastMonth.toISOString().split('T')[0]}`);

    while (processDate <= lastMonth) {
      const year = processDate.getFullYear();
      const month = processDate.getMonth() + 1;
      
      // Check if this cow was active this month (after freshen date)
      const monthEnd = new Date(year, month, 0);
      if (freshenDate <= monthEnd) {
        console.log(`Processing ${year}-${month.toString().padStart(2, '0')}`);

        // Calculate months elapsed from freshen date to end of this month
        const monthsElapsed = (year - freshenDate.getFullYear()) * 12 + 
                             (month - (freshenDate.getMonth() + 1)) + 1;
        
        accumulatedDepreciation = Math.min(
          monthlyDepreciation * Math.max(0, monthsElapsed),
          cow.purchase_price - cow.salvage_value
        );

        const currentValue = cow.purchase_price - accumulatedDepreciation;

        // Check if we already have a depreciation record for this month
        const { data: existingRecord } = await supabase
          .from("cow_monthly_depreciation")
          .select("id")
          .eq("cow_id", cow_id)
          .eq("company_id", company_id)
          .eq("year", year)
          .eq("month", month)
          .single();

        if (!existingRecord) {
          // Create journal entry for this month
          const journalEntry = {
            description: `Monthly Depreciation - ${year}-${month.toString().padStart(2, '0')} - Cow #${cow.tag_number}`,
            entry_date: `${year}-${month.toString().padStart(2, '0')}-${monthEnd.getDate().toString().padStart(2, '0')}`,
            entry_type: 'depreciation',
            total_amount: monthlyDepreciation,
            company_id: company_id,
            posting_year: year,
            posting_month: month
          };

          const { data: newJournalEntry, error: journalError } = await supabase
            .from("journal_entries")
            .insert(journalEntry)
            .select()
            .single();

          if (journalError) {
            console.error("Error creating journal entry:", journalError);
            throw journalError;
          }

          // Create journal lines
          const journalLines = [
            {
              journal_entry_id: newJournalEntry.id,
              account_code: "6100",
              account_name: "Depreciation Expense",
              description: `Monthly depreciation - Cow #${cow.tag_number}`,
              line_type: "debit",
              debit_amount: monthlyDepreciation,
              credit_amount: 0
            },
            {
              journal_entry_id: newJournalEntry.id,
              account_code: "1510",
              account_name: "Accumulated Depreciation - Dairy Cows",
              description: `Monthly depreciation - Cow #${cow.tag_number}`,
              line_type: "credit",
              debit_amount: 0,
              credit_amount: monthlyDepreciation
            }
          ];

          const { error: linesError } = await supabase
            .from("journal_lines")
            .insert(journalLines);

          if (linesError) {
            console.error("Error creating journal lines:", linesError);
            throw linesError;
          }

          // Create cow monthly depreciation record
          const depreciationRecord = {
            cow_id: cow_id,
            company_id: company_id,
            year: year,
            month: month,
            monthly_depreciation_amount: monthlyDepreciation,
            accumulated_depreciation: accumulatedDepreciation,
            asset_value: currentValue,
            journal_entry_id: newJournalEntry.id
          };

          const { error: depreciationError } = await supabase
            .from("cow_monthly_depreciation")
            .insert(depreciationRecord);

          if (depreciationError) {
            console.error("Error creating depreciation record:", depreciationError);
            throw depreciationError;
          }

          entriesCreated.push({
            period: `${year}-${month.toString().padStart(2, '0')}`,
            depreciation: monthlyDepreciation,
            accumulated: accumulatedDepreciation,
            journal_id: newJournalEntry.id
          });

          console.log(`Created entry for ${year}-${month}: $${monthlyDepreciation.toFixed(2)}, accumulated: $${accumulatedDepreciation.toFixed(2)}`);
        }
      }

      // Move to next month
      processDate.setMonth(processDate.getMonth() + 1);
    }

    // Update cow with final depreciation values
    if (entriesCreated.length > 0) {
      const { error: cowUpdateError } = await supabase
        .from("cows")
        .update({
          total_depreciation: accumulatedDepreciation,
          current_value: cow.purchase_price - accumulatedDepreciation
        })
        .eq("id", cow_id);

      if (cowUpdateError) {
        console.error("Error updating cow:", cowUpdateError);
        throw cowUpdateError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${entriesCreated.length} months of depreciation for cow ${cow.tag_number}`,
        cow_tag: cow.tag_number,
        entries_created: entriesCreated.length,
        total_accumulated_depreciation: accumulatedDepreciation,
        current_value: cow.purchase_price - accumulatedDepreciation,
        entries: entriesCreated
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

serve(handler);