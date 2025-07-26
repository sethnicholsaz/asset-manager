import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CowData {
  id: string
  tag_number: string
  name?: string
  birth_date: string
  freshen_date: string
  purchase_price?: number
  salvage_value: number
  current_value: number
  total_depreciation: number
  asset_type_id: string
  status: string
  depreciation_method: string
  acquisition_type: string
  company_id: string
  created_at?: string
}

interface DispositionData {
  id: string
  cow_id: string
  company_id: string
  disposition_type: 'sold' | 'died' | 'other'
  disposition_date: string
  sale_price?: number
  reason?: string
}

interface UploadResult {
  success: boolean
  processedCount: number
  journalsSummary: {
    acquisitions: number
    dispositions: number
    monthlyDepreciation: number
    totalProcessingTime: number
  }
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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get parameters
    const url = new URL(req.url);
    const companyId = url.searchParams.get('company_id');
    const uploadType = url.searchParams.get('type') || 'cows'; // 'cows' or 'dispositions'

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: 'Company ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: uploadData } = await req.json();
    
    if (!uploadData || !Array.isArray(uploadData)) {
      return new Response(
        JSON.stringify({ error: 'Invalid upload data format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result: UploadResult = {
      success: true,
      processedCount: 0,
      journalsSummary: {
        acquisitions: 0,
        dispositions: 0,
        monthlyDepreciation: 0,
        totalProcessingTime: 0
      },
      errors: []
    };

    const startTime = Date.now();

    if (uploadType === 'cows') {
      // Process cow uploads with immediate acquisition journals
      result.processedCount = await processCowUpload(supabase, companyId, uploadData as CowData[], result);
    } else if (uploadType === 'dispositions') {
      // Process disposition uploads with immediate disposition journals
      result.processedCount = await processDispositionUpload(supabase, companyId, uploadData as DispositionData[], result);
    }

    result.journalsSummary.totalProcessingTime = Date.now() - startTime;

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Upload processing error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        processedCount: 0,
        journalsSummary: { acquisitions: 0, dispositions: 0, monthlyDepreciation: 0, totalProcessingTime: 0 },
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Process cow uploads with optimized batch operations and immediate journal creation
 */
async function processCowUpload(
  supabase: any, 
  companyId: string, 
  cowData: CowData[], 
  result: UploadResult
): Promise<number> {
  try {
    // Step 1: Insert/update cows in batches
    const batchSize = 100;
    const newCows: CowData[] = [];
    
    for (let i = 0; i < cowData.length; i += batchSize) {
      const batch = cowData.slice(i, i + batchSize);
      
      // Upsert cows
      const { data: insertedCows, error } = await supabase
        .from('cows')
        .upsert(batch, { 
          onConflict: 'tag_number,company_id',
          ignoreDuplicates: false 
        })
        .select('id, tag_number, purchase_price, salvage_value, freshen_date, created_at');

      if (error) {
        result.errors.push(`Cow batch ${i}-${i + batch.length} failed: ${error.message}`);
        continue;
      }

      // Track new cows for journal creation
      if (insertedCows) {
        newCows.push(...insertedCows);
      }
    }

    // Step 2: Create acquisition journals for new cows using bulk database function
    if (newCows.length > 0) {
      const { data: journalResult, error: journalError } = await supabase
        .rpc('create_acquisition_journals_bulk', {
          company_id: companyId,
          cow_acquisitions: newCows.map(cow => ({
            id: cow.id,
            tag_number: cow.tag_number,
            purchase_price: cow.purchase_price,
            created_at: cow.created_at,
            freshen_date: cow.freshen_date
          }))
        });

      if (journalError) {
        result.errors.push(`Acquisition journal creation failed: ${journalError.message}`);
      } else if (journalResult?.success) {
        result.journalsSummary.acquisitions = journalResult.journal_entries_created || 0;
      }
    }

    // Skip background depreciation scheduling - handled by monthly processing

    return cowData.length;

  } catch (error) {
    result.errors.push(`Cow upload processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return 0;
  }
}

/**
 * Process disposition uploads with immediate journal creation
 */
async function processDispositionUpload(
  supabase: any,
  companyId: string,
  dispositionData: DispositionData[],
  result: UploadResult
): Promise<number> {
  try {
    // Step 1: Insert dispositions
    const { data: insertedDispositions, error: dispositionError } = await supabase
      .from('cow_dispositions')
      .upsert(dispositionData, { 
        onConflict: 'cow_id',
        ignoreDuplicates: false 
      })
      .select('*');

    if (dispositionError) {
      result.errors.push(`Disposition insert failed: ${dispositionError.message}`);
      return 0;
    }

    // Step 2: Update cow status to 'disposed'
    const cowIds = dispositionData.map(d => d.cow_id);
    const { error: updateError } = await supabase
      .from('cows')
      .update({ status: 'disposed' })
      .in('id', cowIds);

    if (updateError) {
      result.errors.push(`Cow status update failed: ${updateError.message}`);
    }

    // Step 3: Create disposition journals immediately using bulk database function
    const { data: journalResult, error: journalError } = await supabase
      .rpc('create_disposition_journals_bulk', {
        company_id: companyId,
        cow_dispositions: insertedDispositions
      });

    if (journalError) {
      result.errors.push(`Disposition journal creation failed: ${journalError.message}`);
    } else if (journalResult?.success) {
      result.journalsSummary.dispositions = journalResult.journal_entries_created || 0;
    }

    return dispositionData.length;

  } catch (error) {
    result.errors.push(`Disposition upload processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return 0;
  }
}

// Removed scheduleDepreciationCatchup function - depreciation handled by monthly processing