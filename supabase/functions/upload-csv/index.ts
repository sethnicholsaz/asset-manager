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
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get parameters
    const url = new URL(req.url);
    const companyId = url.searchParams.get('company_id');
    const uploadToken = url.searchParams.get('token');

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: 'Missing company_id parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For now, we'll use a simple token check. In production, you'd want more secure authentication
    if (!uploadToken || uploadToken.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing upload token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify upload token is valid and active
    const { data: tokenData, error: tokenError } = await supabase
      .from('upload_tokens')
      .select('id, company_id, token_name, is_active')
      .eq('company_id', companyId)
      .eq('token_value', uploadToken)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      console.error('Token verification failed:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid company ID or upload token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get company information
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

    // Required headers
    const requiredHeaders = ['tag_number', 'birth_date', 'freshen_date'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: `Missing required headers: ${missingHeaders.join(', ')}`,
          required_headers: requiredHeaders,
          found_headers: headers
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get purchase price defaults
    const { data: priceDefaults } = await supabase
      .from('purchase_price_defaults')
      .select('*')
      .eq('company_id', companyId);

    // Process each row
    const processedCows: CowData[] = [];
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      try {
        const values = dataRows[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const rowData: Record<string, string> = {};
        
        headers.forEach((header, index) => {
          rowData[header] = values[index] || '';
        });

        // Parse dates
        const birthDate = new Date(rowData.birth_date);
        const freshenDate = new Date(rowData.freshen_date);
        
        if (isNaN(birthDate.getTime()) || isNaN(freshenDate.getTime())) {
          errors.push(`Row ${i + 2}: Invalid date format`);
          continue;
        }

        // Calculate purchase price if not provided
        let purchasePrice = parseFloat(rowData.purchase_price) || 0;
        if (purchasePrice === 0 && priceDefaults && priceDefaults.length > 0) {
          const birthYear = birthDate.getFullYear();
          const matchingDefault = priceDefaults.find(pd => pd.birth_year === birthYear);
          
          if (matchingDefault) {
            const daysDiff = Math.floor((freshenDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
            purchasePrice = matchingDefault.default_price + (daysDiff * (matchingDefault.daily_accrual_rate || 0));
          } else {
            purchasePrice = 2000; // Default fallback
          }
        }

        const cowData: CowData = {
          id: rowData.id || `cow_${Date.now()}_${i}`,
          tag_number: rowData.tag_number,
          name: rowData.name || null,
          birth_date: birthDate.toISOString().split('T')[0],
          freshen_date: freshenDate.toISOString().split('T')[0],
          purchase_price: purchasePrice,
          salvage_value: parseFloat(rowData.salvage_value) || (purchasePrice * 0.1),
          current_value: purchasePrice,
          total_depreciation: 0,
          asset_type_id: rowData.asset_type_id || 'dairy-cow',
          status: rowData.status || 'active',
          depreciation_method: rowData.depreciation_method || 'straight-line',
          acquisition_type: rowData.acquisition_type || 'purchased',
          company_id: companyId
        };

        processedCows.push(cowData);
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
      }
    }

    if (processedCows.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No valid cow data to process',
          errors: errors
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert into database
    const { data: insertedCows, error: insertError } = await supabase
      .from('cows')
      .insert(processedCows)
      .select();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to save cow data',
          details: insertError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully processed ${processedCows.length} cows for company ${company.name}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully imported ${processedCows.length} cows`,
        imported_count: processedCows.length,
        errors: errors.length > 0 ? errors : undefined,
        company: company.name
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Upload CSV error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});