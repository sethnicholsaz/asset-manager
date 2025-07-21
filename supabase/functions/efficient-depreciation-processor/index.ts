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

    const { company_id } = await req.json();
    
    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Starting efficient depreciation processing for company ${company_id}`);

    // First, clear all existing depreciation records to start fresh
    console.log("Clearing existing depreciation records...");
    const { error: clearError } = await supabase
      .from("cow_monthly_depreciation")
      .delete()
      .eq("company_id", company_id);

    if (clearError) {
      console.error("Error clearing records:", clearError);
      // Continue anyway
    }

    // Get all active cows
    const { data: cows, error: cowsError } = await supabase
      .from("cows")
      .select("id, tag_number, purchase_price, salvage_value, freshen_date, company_id")
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

    console.log(`Processing ${cows.length} cows with efficient depreciation calculation`);

    // Process cows in smaller batches to avoid memory issues
    const batchSize = 20;
    const batches = Math.ceil(cows.length / batchSize);
    let totalProcessed = 0;

    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min(startIndex + batchSize, cows.length);
      const batchCows = cows.slice(startIndex, endIndex);

      console.log(`Processing batch ${batchIndex + 1}/${batches} (${batchCows.length} cows)`);

      await processCowBatchEfficient(supabase, batchCows);
      totalProcessed += batchCows.length;

      console.log(`Batch ${batchIndex + 1} completed`);
    }

    return new Response(
      JSON.stringify({
        message: "Efficient depreciation processing completed",
        total_cows: cows.length,
        processed_cows: totalProcessed,
        batches_processed: batches
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in efficient depreciation processing:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

async function processCowBatchEfficient(supabase: any, cows: any[]) {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  
  // Only process records from 2024 onwards (much more reasonable)
  const startYear = 2024;
  
  const cowUpdates = [];

  for (const cow of cows) {
    const monthlyDepreciation = (cow.purchase_price - cow.salvage_value) / (5 * 12);
    const freshenDate = new Date(cow.freshen_date);
    
    // Calculate total depreciation based on months since freshen date
    const monthsSinceFreshen = Math.max(0, 
      (currentYear - freshenDate.getFullYear()) * 12 + 
      (currentMonth - freshenDate.getMonth() - 1)
    );
    
    const totalDepreciation = Math.min(
      monthlyDepreciation * monthsSinceFreshen,
      cow.purchase_price - cow.salvage_value
    );
    
    const currentValue = Math.max(
      cow.salvage_value,
      cow.purchase_price - totalDepreciation
    );

    // Only create ONE summary record per cow instead of monthly records
    const summaryRecord = {
      id: crypto.randomUUID(),
      cow_id: cow.id,
      company_id: cow.company_id,
      year: currentYear,
      month: currentMonth,
      monthly_depreciation_amount: monthlyDepreciation,
      accumulated_depreciation: totalDepreciation,
      asset_value: currentValue,
      posting_period: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`
    };

    // Insert the single summary record
    const { error: insertError } = await supabase
      .from("cow_monthly_depreciation")
      .insert(summaryRecord);

    if (insertError) {
      console.error(`Error inserting record for cow ${cow.id}:`, insertError);
      continue;
    }

    // Update cow with calculated values
    const { error: updateError } = await supabase
      .from("cows")
      .update({
        total_depreciation: totalDepreciation,
        current_value: currentValue,
        updated_at: new Date().toISOString()
      })
      .eq('id', cow.id);

    if (updateError) {
      console.error(`Error updating cow ${cow.id}:`, updateError);
    }
  }
}

serve(handler);