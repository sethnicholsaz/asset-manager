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
    // Initialize Supabase client with service role key for admin access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

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

    console.log('Verifying token for company:', companyId, 'token:', uploadToken);
    
    // Verify upload token is valid and active
    const { data: tokenData, error: tokenError } = await supabase
      .from('upload_tokens')
      .select('id, company_id, token_name, is_active')
      .eq('company_id', companyId)
      .eq('token_value', uploadToken)
      .eq('is_active', true)
      .maybeSingle();

    console.log('Token query result:', { tokenData, tokenError });

    if (tokenError || !tokenData) {
      console.error('Token verification failed:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid company ID or upload token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token validated successfully, getting company info...');

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

    console.log('Company validated:', company.name);

    // Update last_used_at for the token
    await supabase
      .from('upload_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    // Parse multipart form data
    const formData = await req.formData();
    const csvFile = formData.get('file') as File;

    if (!csvFile) {
      return new Response(
        JSON.stringify({ error: 'No CSV file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine status and disposition type from filename
    const fileName = csvFile.name.toUpperCase();
    let cowStatus = 'active';
    let dispositionType: string | null = null;
    
    if (fileName.includes('SOLD')) {
      cowStatus = 'sold';
      dispositionType = 'sale';
    } else if (fileName.includes('DIED') || fileName.includes('DEAD')) {
      cowStatus = 'deceased';
      dispositionType = 'death';
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

    // Map headers to expected format
    const headerMapping = {
      'ID': 'tag_number',
      'BDAT': 'birth_date', 
      'Date': 'freshen_date',
      'DIM': 'freshen_date', // fallback if Date is not freshen date
      'Event': 'event',
      'Remark': 'notes'
    };

    // Create mapped headers
    const mappedHeaders = headers.map(h => headerMapping[h] || h.toLowerCase());
    
    console.log('Original headers:', headers);
    console.log('Mapped headers:', mappedHeaders);

    // Required mapped headers
    const requiredHeaders = ['tag_number', 'birth_date', 'freshen_date'];
    const missingHeaders = requiredHeaders.filter(h => !mappedHeaders.includes(h));
    
    if (missingHeaders.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: `Missing required data. Found headers: ${headers.join(', ')}. Please ensure your CSV contains: cow ID, birth date, and freshen date.`,
          required_headers: requiredHeaders,
          found_headers: headers,
          mapped_headers: mappedHeaders
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get purchase price defaults
    const { data: priceDefaults } = await supabase
      .from('purchase_price_defaults')
      .select('*')
      .eq('company_id', companyId);

    // Handle large files by processing in chunks - no file size limit
    console.log(`Processing ${dataRows.length} total rows automatically in chunks`);

    // Process rows in batches for better performance
    const processedCows: CowData[] = [];
    const errors: string[] = [];
    const batchSize = 250;
    
    console.log(`Processing ${dataRows.length} rows in batches of ${batchSize}`);

    for (let batchStart = 0; batchStart < dataRows.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, dataRows.length);
      const batchCows: CowData[] = [];
      
      console.log(`Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(dataRows.length / batchSize)} (rows ${batchStart + 1}-${batchEnd})`);

      for (let i = batchStart; i < batchEnd; i++) {
        try {
          const values = dataRows[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const rowData: Record<string, string> = {};
          
          // Map original headers to data using the mapping
          headers.forEach((header, index) => {
            const mappedHeader = headerMapping[header] || header.toLowerCase();
            rowData[mappedHeader] = values[index] || '';
          });

          // Parse dates using mapped headers
          const birthDate = new Date(rowData['birth_date'] || rowData['BDAT']);
          const freshenDate = new Date(rowData['freshen_date'] || rowData['Date']);
          
          if (isNaN(birthDate.getTime()) || isNaN(freshenDate.getTime())) {
            errors.push(`Row ${i + 2}: Invalid date format. Birth: ${rowData['birth_date'] || rowData['BDAT']}, Freshen: ${rowData['freshen_date'] || rowData['Date']}`);
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
            status: cowStatus, // Use determined status from filename
            depreciation_method: rowData.depreciation_method || 'straight-line',
            acquisition_type: rowData.acquisition_type || 'purchased',
            company_id: companyId
          };

          batchCows.push(cowData);
        } catch (error) {
          errors.push(`Row ${i + 2}: ${error.message}`);
        }
      }

      // Insert batch if we have data
      if (batchCows.length > 0) {
        const { error: batchError } = await supabase
          .from('cows')
          .upsert(batchCows, {
            onConflict: 'tag_number,company_id',
            ignoreDuplicates: false
          });

        if (batchError) {
          console.error(`Batch ${Math.floor(batchStart / batchSize) + 1} error:`, batchError);
          errors.push(`Batch ${Math.floor(batchStart / batchSize) + 1}: ${batchError.message}`);
        } else {
          processedCows.push(...batchCows);
          console.log(`Batch ${Math.floor(batchStart / batchSize) + 1} completed: ${batchCows.length} records`);
          
          // Create disposition records for sold/deceased cows
          if (dispositionType && cowStatus !== 'active') {
            const dispositionRecords = batchCows.map(cow => ({
              cow_id: cow.tag_number, // Using tag_number as cow_id for dispositions
              company_id: companyId,
              disposition_date: cow.freshen_date, // Use freshen_date as disposition date
              disposition_type: dispositionType,
              sale_amount: dispositionType === 'sale' ? cow.purchase_price * 0.8 : 0, // Estimated sale amount
              final_book_value: cow.current_value,
              gain_loss: dispositionType === 'sale' ? (cow.purchase_price * 0.8) - cow.current_value : -cow.current_value,
              notes: `Imported from ${csvFile.name}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }));

            const { error: dispositionError } = await supabase
              .from('cow_dispositions')
              .upsert(dispositionRecords, {
                onConflict: 'cow_id,company_id',
                ignoreDuplicates: false
              });

            if (dispositionError) {
              console.error(`Disposition batch ${Math.floor(batchStart / batchSize) + 1} error:`, dispositionError);
              errors.push(`Disposition batch ${Math.floor(batchStart / batchSize) + 1}: ${dispositionError.message}`);
            } else {
              console.log(`Disposition batch ${Math.floor(batchStart / batchSize) + 1} completed: ${dispositionRecords.length} records`);
            }
          }
        }
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