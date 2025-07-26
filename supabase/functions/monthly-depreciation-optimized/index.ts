import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Round currency to the nearest penny
const roundToPenny = (amount: number): number => {
  return Math.round(amount * 100) / 100;
}

interface DepreciationRequest {
  company_id: string
  month?: number
  year?: number
  force_recreate?: boolean
}

interface DepreciationResult {
  success: boolean
  journal_created: boolean
  total_depreciation: number
  cow_count: number
  processing_time: number 
  errors: string[]
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const requestData: DepreciationRequest = await req.json();
    
    if (!requestData.company_id) {
      return new Response(
        JSON.stringify({ error: 'Company ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startTime = Date.now();
    const currentDate = new Date();
    const targetMonth = requestData.month || (currentDate.getMonth() + 1);
    const targetYear = requestData.year || currentDate.getFullYear();

    const result: DepreciationResult = {
      success: true,
      journal_created: false,
      total_depreciation: 0,
      cow_count: 0,
      processing_time: 0,
      errors: []
    };

    // Step 1: Check if depreciation journal already exists
    if (!requestData.force_recreate) {
      const { data: existingJournal } = await supabase
        .from('journal_entries')
        .select('id, total_amount')
        .eq('company_id', requestData.company_id)
        .eq('entry_type', 'depreciation')
        .eq('month', targetMonth)
        .eq('year', targetYear)
        .limit(1);

      if (existingJournal && existingJournal.length > 0) {
        result.journal_created = false;
        result.total_depreciation = roundToPenny(existingJournal[0].total_amount || 0);
        result.processing_time = Date.now() - startTime;
        
        return new Response(
          JSON.stringify({
            ...result,
            message: 'Depreciation journal already exists for this period'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 2: Get all cows for the company, excluding those disposed before the target month
    const targetEndDate = new Date(targetYear, targetMonth, 0); // Last day of target month
    
    const { data: activeCows, error: cowsError } = await supabase
      .from('cows')
      .select(`
        id,
        tag_number,
        purchase_price,
        salvage_value,
        freshen_date,
        depreciation_method,
        cow_dispositions(disposition_date)
      `)
      .eq('company_id', requestData.company_id)
      .not('purchase_price', 'is', null)
      .not('salvage_value', 'is', null);

    if (cowsError) {
      result.errors.push(`Failed to fetch active cows: ${cowsError.message}`);
      result.success = false;
    } else if (!activeCows || activeCows.length === 0) {
      result.errors.push('No active cows found for depreciation calculation');
      result.success = false;
    } else {
      // Filter out cows that were disposed before the end of the target month
      const eligibleCows = activeCows.filter(cow => {
        if (!cow.cow_dispositions || cow.cow_dispositions.length === 0) {
          return true; // No disposition, cow is eligible
        }
        
        const dispositionDate = new Date(cow.cow_dispositions[0].disposition_date);
        return dispositionDate > targetEndDate; // Only include if disposed after target month
      });

      if (eligibleCows.length === 0) {
        result.errors.push('No eligible cows found for depreciation calculation (all disposed before target month)');
        result.success = false;
      } else {
        // Step 3: Calculate total monthly depreciation using database function
        const { data: depreciationResult, error: calcError } = await supabase
          .rpc('calculate_monthly_depreciation_bulk', {
            company_id: requestData.company_id,
            target_month: targetMonth,
            target_year: targetYear,
            cow_data: eligibleCows.map(cow => ({
              id: cow.id,
              tag_number: cow.tag_number,
              purchase_price: cow.purchase_price,
              salvage_value: cow.salvage_value,
              freshen_date: cow.freshen_date,
              depreciation_method: cow.depreciation_method || 'straight_line'
            }))
          });

        if (calcError) {
          result.errors.push(`Depreciation calculation failed: ${calcError.message}`);
          result.success = false;
        } else if (depreciationResult?.success) {
          result.total_depreciation = roundToPenny(depreciationResult.total_depreciation || 0);
          result.cow_count = depreciationResult.cow_count || 0;
          result.journal_created = true;

          // Log the depreciation processing
          await supabase.from('system_logs').insert({
            level: 'INFO',
            message: 'Monthly depreciation journal created',
            data: {
              company_id: requestData.company_id,
              month: targetMonth,
              year: targetYear,
              total_depreciation: result.total_depreciation,
              cow_count: result.cow_count,
              processing_time: Date.now() - startTime
            }
          });
        } else {
          result.errors.push('Depreciation calculation returned no results');
          result.success = false;
        }
      }
    }

    result.processing_time = Date.now() - startTime;

    return new Response(
      JSON.stringify(result),
      { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Monthly depreciation processing error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        journal_created: false,
        total_depreciation: 0,
        cow_count: 0,
        processing_time: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred']
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});