import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get user session
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      );
    }

    console.log('🔍 Processing missing acquisitions for user:', user.id);

    const { company_id } = await req.json();
    
    if (!company_id) {
      return new Response(
        JSON.stringify({ error: 'Company ID is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log('🏢 Processing company:', company_id);

    // Verify user has access to this company
    const { data: membership } = await supabase
      .from('company_memberships')
      .select('*')
      .eq('company_id', company_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'Access denied to company' }),
        { status: 403, headers: corsHeaders }
      );
    }

    // First, let's check how many cows need processing
    const { data: cowsNeedingProcessing, error: countError } = await supabase
      .from('cows')
      .select('id, tag_number, purchase_price, acquisition_type')
      .eq('company_id', company_id)
      .eq('acquisition_type', 'purchased');

    if (countError) {
      console.error('Error checking cows:', countError);
      return new Response(
        JSON.stringify({ error: 'Failed to check cows' }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Filter out cows that already have acquisition journals
    const cowsToProcess = [];
    for (const cow of cowsNeedingProcessing || []) {
      const { data: existingJournal } = await supabase
        .from('journal_lines')
        .select('id')
        .eq('cow_id', cow.id)
        .eq('journal_entries.entry_type', 'acquisition')
        .limit(1);

      if (!existingJournal || existingJournal.length === 0) {
        cowsToProcess.push(cow);
      }
    }

    console.log('📊 Summary:', {
      total_purchased_cows: cowsNeedingProcessing?.length || 0,
      cows_needing_processing: cowsToProcess.length
    });

    // Call the database function to process missing acquisitions
    const { data: result, error: processError } = await supabase
      .rpc('process_missing_acquisition_journals', {
        p_company_id: company_id
      });

    if (processError) {
      console.error('Error processing acquisitions:', processError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to process acquisitions', 
          details: processError.message 
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    console.log('✅ Processing complete:', result);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Missing acquisition journals processed successfully',
        summary: {
          total_processed: result.total_processed,
          total_amount: result.total_amount,
          error_count: result.error_count,
          cows_checked: cowsNeedingProcessing?.length || 0
        },
        details: result.results || []
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});