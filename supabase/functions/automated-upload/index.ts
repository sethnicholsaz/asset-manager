import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AutomatedCowData {
  ID: string
  BDAT: string
  EVENT: string
  DIM: string
  DATE: string
  REMARK: string
  PROTOCOLS: string
  TECHNICIAN: string
}

interface ProcessingResult {
  processed: number
  skipped: number
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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get parameters
    const url = new URL(req.url);
    const companyId = url.searchParams.get('company_id');
    const uploadToken = url.searchParams.get('token');

    console.log(`Processing automated upload for company: ${companyId}`);

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: 'Missing company_id parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!uploadToken) {
      return new Response(
        JSON.stringify({ error: 'Missing upload token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify upload token
    const { data: tokenData, error: tokenError } = await supabase
      .from('upload_tokens')
      .select('*')
      .eq('token_value', uploadToken)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      console.error('Token verification failed:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive upload token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update token last used timestamp
    await supabase
      .from('upload_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    // Verify company exists
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      console.error('Company verification failed:', companyError);
      return new Response(
        JSON.stringify({ error: 'Invalid company ID' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    const csvFile = formData.get('file') as File;

    if (!csvFile) {
      return new Response(
        JSON.stringify({ error: 'No CSV file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file type
    if (!csvFile.name.toLowerCase().endsWith('.csv') && csvFile.type !== 'text/csv') {
      return new Response(
        JSON.stringify({ error: 'File must be a CSV' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Read and parse CSV
    const csvText = await csvFile.text();
    const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length < 2) {
      return new Response(
        JSON.stringify({ error: 'CSV must contain headers and at least one data row' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse headers and data
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const dataRows = lines.slice(1);

    // Expected headers for automated upload
    const expectedHeaders = ['ID', 'BDAT', 'EVENT', 'DIM', 'DATE', 'REMARK', 'PROTOCOLS', 'TECHNICIAN'];
    const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: `Missing required headers: ${missingHeaders.join(', ')}`,
          expected_headers: expectedHeaders,
          found_headers: headers
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse CSV data
    const rowData: AutomatedCowData[] = [];
    const parseErrors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      try {
        const values = dataRows[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row: Record<string, string> = {};
        
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        rowData.push(row as AutomatedCowData);
      } catch (error) {
        parseErrors.push(`Row ${i + 2}: Failed to parse - ${error.message}`);
      }
    }

    if (rowData.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No valid data rows found',
          parse_errors: parseErrors
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get purchase price defaults
    const { data: priceDefaults } = await supabase
      .from('purchase_price_defaults')
      .select('*')
      .eq('company_id', companyId);

    // Process fresh cows and dispositions
    const results: ProcessingResult = { processed: 0, skipped: 0, errors: [] };

    for (const row of rowData) {
      try {
        if (row.EVENT === 'Fresh') {
          // Process fresh cow
          const result = await processFreshCow(supabase, row, companyId, priceDefaults);
          if (result.success) {
            results.processed++;
          } else {
            results.skipped++;
            results.errors.push(result.error || 'Unknown error processing fresh cow');
          }
        } else if (['Died', 'Sold'].includes(row.EVENT)) {
          // Process disposition
          const result = await processDisposition(supabase, row, companyId);
          if (result.success) {
            results.processed++;
          } else {
            results.skipped++;
            results.errors.push(result.error || 'Unknown error processing disposition');
          }
        } else {
          // Skip unknown events
          results.skipped++;
        }
      } catch (error) {
        results.errors.push(`Error processing ${row.ID}: ${error.message}`);
        results.skipped++;
      }
    }

    console.log(`Automated upload completed for ${company.name}:`, results);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.processed} records successfully`,
        processed: results.processed,
        skipped: results.skipped,
        errors: results.errors.length > 0 ? results.errors : undefined,
        company: company.name
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Automated upload error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processFreshCow(supabase: any, row: AutomatedCowData, companyId: string, priceDefaults: any[]) {
  try {
    // Check if cow already exists
    const { data: existingCow } = await supabase
      .from('cows')
      .select('id')
      .eq('tag_number', row.ID)
      .eq('company_id', companyId)
      .single();

    if (existingCow) {
      return { success: false, error: `Cow ${row.ID} already exists` };
    }

    // Parse dates
    const birthDate = new Date(row.BDAT);
    const freshenDate = new Date(row.DATE);

    if (isNaN(birthDate.getTime()) || isNaN(freshenDate.getTime())) {
      return { success: false, error: `Invalid date format for cow ${row.ID}` };
    }

    // Calculate purchase price
    let purchasePrice = 1500; // Default fallback
    if (priceDefaults && priceDefaults.length > 0) {
      const birthYear = birthDate.getFullYear();
      const matchingDefault = priceDefaults.find(pd => pd.birth_year === birthYear);
      
      if (matchingDefault) {
        const daysDiff = Math.floor((freshenDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
        purchasePrice = Number(matchingDefault.default_price) + (daysDiff * Number(matchingDefault.daily_accrual_rate || 0));
      }
    }

    const cowData = {
      id: row.ID,
      tag_number: row.ID,
      birth_date: birthDate.toISOString().split('T')[0],
      freshen_date: freshenDate.toISOString().split('T')[0],
      purchase_price: purchasePrice,
      current_value: purchasePrice,
      salvage_value: purchasePrice * 0.1, // 10% default
      asset_type_id: 'dairy-cow',
      status: 'active',
      depreciation_method: 'straight-line',
      total_depreciation: 0,
      acquisition_type: 'purchased',
      company_id: companyId
    };

    const { error } = await supabase
      .from('cows')
      .insert(cowData);

    if (error) {
      return { success: false, error: `Failed to insert cow ${row.ID}: ${error.message}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: `Error processing fresh cow ${row.ID}: ${error.message}` };
  }
}

async function processDisposition(supabase: any, row: AutomatedCowData, companyId: string) {
  try {
    // Find existing cow
    const { data: existingCow, error: cowError } = await supabase
      .from('cows')
      .select('*')
      .eq('tag_number', row.ID)
      .eq('company_id', companyId)
      .single();

    if (cowError || !existingCow) {
      return { success: false, error: `Cow ${row.ID} not found for disposition` };
    }

    // Parse disposition date
    const dispositionDate = new Date(row.DATE);
    if (isNaN(dispositionDate.getTime())) {
      return { success: false, error: `Invalid disposition date for cow ${row.ID}` };
    }

    const dispositionType = row.EVENT === 'Died' ? 'death' : 'sale';
    const newStatus = row.EVENT === 'Died' ? 'deceased' : 'sold';

    // Create disposition record
    const dispositionData = {
      cow_id: existingCow.id,
      disposition_date: dispositionDate.toISOString().split('T')[0],
      disposition_type: dispositionType,
      sale_amount: 0, // Default to 0 as requested
      final_book_value: Number(existingCow.current_value),
      gain_loss: 0 - Number(existingCow.current_value), // Loss = 0 - current_value
      company_id: companyId
    };

    const { data: disposition, error: dispositionError } = await supabase
      .from('cow_dispositions')
      .insert(dispositionData)
      .select()
      .single();

    if (dispositionError) {
      return { success: false, error: `Failed to create disposition for cow ${row.ID}: ${dispositionError.message}` };
    }

    // Update cow status and link to disposition
    const { error: updateError } = await supabase
      .from('cows')
      .update({
        status: newStatus,
        disposition_id: disposition.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingCow.id);

    if (updateError) {
      return { success: false, error: `Failed to update cow ${row.ID} status: ${updateError.message}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: `Error processing disposition ${row.ID}: ${error.message}` };
  }
}