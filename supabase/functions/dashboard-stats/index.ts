import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DashboardStats {
  active_cow_count: number;
  total_asset_value: number;
  total_accumulated_depreciation: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { company_id } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: 'Company ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Calculating dashboard stats for company:', company_id);

    // Get active cow count using direct SQL aggregation
    const { data: cowCountData, error: cowCountError } = await supabaseClient
      .rpc('get_dashboard_stats', { p_company_id: company_id });

    if (cowCountError) {
      console.error('Error getting dashboard stats:', cowCountError);
      throw cowCountError;
    }

    const stats: DashboardStats = cowCountData || {
      active_cow_count: 0,
      total_asset_value: 0,
      total_accumulated_depreciation: 0
    };

    console.log('Dashboard stats calculated:', stats);

    return new Response(
      JSON.stringify(stats),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in dashboard-stats function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});