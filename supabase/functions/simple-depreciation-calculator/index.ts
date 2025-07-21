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

    console.log(`Starting simple depreciation calculation for company ${company_id}`);

    // Get all active cows
    const { data: cows, error: cowsError } = await supabase
      .from("cows")
      .select("id, tag_number, purchase_price, salvage_value, freshen_date")
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

    console.log(`Calculating depreciation for ${cows.length} active cows`);

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    let processedCount = 0;
    let totalDepreciationAmount = 0;

    // Process each cow with simple depreciation calculation
    for (const cow of cows) {
      try {
        const freshenDate = new Date(cow.freshen_date);
        
        // Calculate monthly depreciation (5-year straight line)
        const monthlyDepreciation = (cow.purchase_price - cow.salvage_value) / (5 * 12);
        
        // Calculate months since freshen date
        const monthsSinceFreshen = Math.max(0, 
          (currentYear - freshenDate.getFullYear()) * 12 + 
          (currentMonth - freshenDate.getMonth() - 1)
        );
        
        // Calculate total depreciation (but don't exceed depreciable amount)
        const maxDepreciation = cow.purchase_price - cow.salvage_value;
        const totalDepreciation = Math.min(
          monthlyDepreciation * monthsSinceFreshen,
          maxDepreciation
        );
        
        // Calculate current value
        const currentValue = Math.max(
          cow.salvage_value,
          cow.purchase_price - totalDepreciation
        );

        // Update cow directly - no journal entries, no complications
        const { error: updateError } = await supabase
          .from("cows")
          .update({
            total_depreciation: totalDepreciation,
            current_value: currentValue,
            updated_at: new Date().toISOString()
          })
          .eq('id', cow.id);

        if (updateError) {
          console.error(`Error updating cow ${cow.tag_number}:`, updateError);
          continue;
        }

        processedCount++;
        totalDepreciationAmount += totalDepreciation;
        
        console.log(`✓ Cow ${cow.tag_number}: $${totalDepreciation.toFixed(2)} depreciation, $${currentValue.toFixed(2)} current value`);

      } catch (error) {
        console.error(`Error processing cow ${cow.tag_number}:`, error);
        continue;
      }
    }

    console.log(`Completed: ${processedCount}/${cows.length} cows processed, total depreciation: $${totalDepreciationAmount.toFixed(2)}`);

    return new Response(
      JSON.stringify({
        message: "Simple depreciation calculation completed",
        total_cows: cows.length,
        processed_cows: processedCount,
        total_depreciation: totalDepreciationAmount,
        average_depreciation: processedCount > 0 ? totalDepreciationAmount / processedCount : 0
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in simple depreciation calculation:", error);
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