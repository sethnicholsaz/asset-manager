import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BulkJournalRequest {
  company_id: string;
  start_year: number;
  start_month: number;
  end_year: number;
  end_month: number;
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

    const { company_id, start_year, start_month, end_year, end_month }: BulkJournalRequest = await req.json();

    console.log(`Creating bulk depreciation journals for company ${company_id} from ${start_year}-${start_month} to ${end_year}-${end_month}`);

    // Get all active cows for the company
    const { data: cows, error: cowsError } = await supabase
      .from("cows")
      .select("*")
      .eq("company_id", company_id)
      .eq("status", "active");

    if (cowsError) {
      console.error("Error fetching cows:", cowsError);
      throw cowsError;
    }

    console.log(`Found ${cows?.length || 0} active cows`);

    // Get depreciation settings
    const { data: depreciationSettings } = await supabase
      .from("depreciation_settings")
      .select("*")
      .eq("company_id", company_id)
      .single();

    const defaultDepreciationYears = depreciationSettings?.default_depreciation_years || 5;

    let currentYear = start_year;
    let currentMonth = start_month;
    const journalsCreated = [];

    while (currentYear < end_year || (currentYear === end_year && currentMonth <= end_month)) {
      console.log(`Processing ${currentYear}-${String(currentMonth).padStart(2, '0')}`);

      const monthEndDate = new Date(currentYear, currentMonth, 0); // Last day of the month
      const activeCowsForMonth = cows?.filter(cow => {
        const freshenDate = new Date(cow.freshen_date);
        return freshenDate <= monthEndDate;
      }) || [];

      if (activeCowsForMonth.length === 0) {
        // Move to next month
        currentMonth++;
        if (currentMonth > 12) {
          currentMonth = 1;
          currentYear++;
        }
        continue;
      }

      let totalMonthlyDepreciation = 0;
      const depreciationRecords = [];

      // Calculate depreciation for each cow
      for (const cow of activeCowsForMonth) {
        const monthsInService = defaultDepreciationYears * 12;
        const monthlyDepreciation = (cow.purchase_price - cow.salvage_value) / monthsInService;
        
        // Calculate accumulated depreciation up to this month
        const freshenDate = new Date(cow.freshen_date);
        const monthsElapsed = (currentYear - freshenDate.getFullYear()) * 12 + 
                             (currentMonth - (freshenDate.getMonth() + 1)) + 1;
        
        const accumulatedDepreciation = Math.min(
          monthlyDepreciation * Math.max(0, monthsElapsed),
          cow.purchase_price - cow.salvage_value
        );

        totalMonthlyDepreciation += monthlyDepreciation;

        depreciationRecords.push({
          cow_id: cow.id,
          company_id: company_id,
          year: currentYear,
          month: currentMonth,
          monthly_depreciation_amount: monthlyDepreciation,
          accumulated_depreciation: accumulatedDepreciation,
          asset_value: cow.purchase_price - accumulatedDepreciation
        });
      }

      if (totalMonthlyDepreciation > 0) {
        // Create journal entry
        const journalEntry = {
          description: `Monthly Depreciation - ${currentYear}-${String(currentMonth).padStart(2, '0')}`,
          entry_date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`,
          entry_type: 'depreciation',
          total_amount: totalMonthlyDepreciation,
          company_id: company_id,
          posting_year: currentYear,
          posting_month: currentMonth
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
            description: `Monthly depreciation for ${activeCowsForMonth.length} cows`,
            line_type: "debit",
            debit_amount: totalMonthlyDepreciation,
            credit_amount: 0
          },
          {
            journal_entry_id: newJournalEntry.id,
            account_code: "1510",
            account_name: "Accumulated Depreciation - Dairy Cows",
            description: `Monthly depreciation for ${activeCowsForMonth.length} cows`,
            line_type: "credit",
            debit_amount: 0,
            credit_amount: totalMonthlyDepreciation
          }
        ];

        const { error: linesError } = await supabase
          .from("journal_lines")
          .insert(journalLines);

        if (linesError) {
          console.error("Error creating journal lines:", linesError);
          throw linesError;
        }

        // Update depreciation records with journal entry ID
        const updatedDepreciationRecords = depreciationRecords.map(record => ({
          ...record,
          journal_entry_id: newJournalEntry.id
        }));

        // Insert or update cow monthly depreciation records
        const { error: depreciationError } = await supabase
          .from("cow_monthly_depreciation")
          .upsert(updatedDepreciationRecords, {
            onConflict: "cow_id,company_id,year,month"
          });

        if (depreciationError) {
          console.error("Error creating depreciation records:", depreciationError);
          throw depreciationError;
        }

        // Update cows with current depreciation
        for (const record of updatedDepreciationRecords) {
          await supabase
            .from("cows")
            .update({
              total_depreciation: record.accumulated_depreciation,
              current_value: record.asset_value
            })
            .eq("id", record.cow_id);
        }

        journalsCreated.push({
          period: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
          cows_count: activeCowsForMonth.length,
          total_depreciation: totalMonthlyDepreciation,
          journal_id: newJournalEntry.id
        });

        console.log(`Created journal for ${currentYear}-${currentMonth}: ${activeCowsForMonth.length} cows, $${totalMonthlyDepreciation.toFixed(2)}`);
      }

      // Move to next month
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Created ${journalsCreated.length} depreciation journal entries`,
        journals: journalsCreated,
        total_entries: journalsCreated.length
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in bulk depreciation journals:", error);
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