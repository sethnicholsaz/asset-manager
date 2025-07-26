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

    // This endpoint is now specifically for FRESH cow uploads
    // Sold/died animals should use the upload-dispositions endpoint
    const fileName = csvFile.name.toUpperCase();
    const cowStatus = 'active'; // Fresh cows are always active
    
    // Check if this looks like a disposition file (should use different endpoint)
    if (fileName.includes('SOLD') || fileName.includes('DIED') || fileName.includes('DEAD')) {
      return new Response(
        JSON.stringify({ 
          error: 'This endpoint is for fresh cow uploads only. Please use the upload-dispositions endpoint for sold/died animals.',
          suggested_endpoint: 'upload-dispositions'
        }),
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

    // Map headers to expected format for fresh cows
    const headerMapping: Record<string, string> = {
      'ID': 'tag_number',
      'BDAT': 'birth_date', 
      'FDAT': 'freshen_date', // Fresh date for new cows
      'Date': 'freshen_date', // Alternative mapping for freshen date
      'DIM': 'days_in_milk',
      'Event': 'event',
      'Remark': 'notes'
    };
    
    // Also create a lowercase version for case-insensitive matching
    const lowerHeaderMapping: Record<string, string> = {};
    Object.entries(headerMapping).forEach(([key, value]) => {
      lowerHeaderMapping[key.toLowerCase()] = value;
    });

    // Create mapped headers with better case handling
    const mappedHeaders = headers.map(h => {
      const exactMatch = headerMapping[h];
      const lowerMatch = lowerHeaderMapping[h.toLowerCase()];
      return exactMatch || lowerMatch || h.toLowerCase();
    });
    
    console.log('Original headers:', headers);
    console.log('Mapped headers:', mappedHeaders);
    console.log('Header mapping applied:', headerMapping);

    // Required mapped headers - event_date is optional for disposition files
    const requiredHeaders = ['tag_number', 'birth_date'];
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

    // Get purchase price defaults and acquisition settings
    const { data: priceDefaults } = await supabase
      .from('purchase_price_defaults')
      .select('*')
      .eq('company_id', companyId);

    const { data: acquisitionSettings } = await supabase
      .from('acquisition_settings')
      .select('default_acquisition_type')
      .eq('company_id', companyId)
      .maybeSingle();

    // Get depreciation settings for default salvage percentage
    const { data: depreciationSettings } = await supabase
      .from('depreciation_settings')
      .select('default_salvage_percentage')
      .eq('company_id', companyId)
      .maybeSingle();
    
    const defaultAcquisitionType = acquisitionSettings?.default_acquisition_type || 'purchased';

    // Handle large files by processing in chunks - no file size limit
    console.log(`Processing ${dataRows.length} total rows automatically in chunks`);

    // Process rows in batches for better performance
    const processedCows: CowData[] = [];
    const errors: string[] = [];
    const batchSize = 1000; // Increased batch size to reduce DB calls
    
    console.log(`Processing ${dataRows.length} rows in batches of ${batchSize}`);

    for (let batchStart = 0; batchStart < dataRows.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, dataRows.length);
      const batchCows: CowData[] = [];
      
      console.log(`Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(dataRows.length / batchSize)} (rows ${batchStart + 1}-${batchEnd})`);

      for (let i = batchStart; i < batchEnd; i++) {
        try {
          const values = dataRows[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const rowData: Record<string, string> = {};
          
          // Map original headers to data using improved mapping
          headers.forEach((header, index) => {
            const exactMatch = headerMapping[header];
            const lowerMatch = lowerHeaderMapping[header.toLowerCase()];
            const mappedHeader = exactMatch || lowerMatch || header.toLowerCase();
            rowData[mappedHeader] = values[index] || '';
          });
          
          // Debug: Show raw values for first row to understand the structure
          if (i === 0) {
            console.log(`FIRST ROW DEBUG - Raw values:`, values);
            console.log(`FIRST ROW DEBUG - Headers:`, headers);
            console.log(`FIRST ROW DEBUG - Mapped rowData:`, rowData);
          }
          
          console.log(`Row ${i + 2}: Full rowData for first few fields:`, {
            tag_number: rowData.tag_number,
            birth_date: rowData.birth_date,
            freshen_date: rowData.freshen_date,
            event: rowData.event
          });

          // Parse dates using mapped headers - STRICT PARSING
          const birthDateStr = rowData['birth_date'] || rowData['BDAT'];
          const freshenDateStr = rowData['freshen_date'] || rowData['Date'] || rowData['date'];
          
          console.log(`Row ${i + 2}: birthDateStr='${birthDateStr}', freshenDateStr='${freshenDateStr}'`);
          
          // Validate required date strings
          if (!birthDateStr) {
            throw new Error(`Missing required birth date. Birth date: '${birthDateStr}'`);
          }
          
          if (!freshenDateStr) {
            throw new Error(`Missing required freshen date. Freshen date: '${freshenDateStr}'`);
          }
          
          // Helper function to parse dates that might be Excel serial numbers
          const parseDate = (dateStr: string): Date => {
            if (!dateStr) throw new Error('Empty date string');
            
            // Check if it's a number (Excel date serial number)
            const num = Number(dateStr);
            if (!isNaN(num) && num > 1) {
              // Excel date serial number (days since 1900-01-01, with some adjustments)
              const excelEpoch = new Date(1900, 0, 1);
              const date = new Date(excelEpoch.getTime() + (num - 2) * 24 * 60 * 60 * 1000);
              return date;
            }
            
            // Try to parse as regular date
            return new Date(dateStr);
          };
          
          const birthDate = parseDate(birthDateStr);
          const freshenDate = parseDate(freshenDateStr);
          
          console.log(`Row ${i + 2}: Parsed freshenDate=${freshenDate.toISOString()}`);
          
          // STRICT: Fail immediately if dates are invalid
          if (isNaN(birthDate.getTime())) {
            throw new Error(`Invalid birth date format: '${birthDateStr}'. Expected format: MM/DD/YYYY, YYYY-MM-DD, or Excel date number`);
          }
          
          if (isNaN(freshenDate.getTime())) {
            throw new Error(`Invalid freshen date format: '${freshenDateStr}'. Expected format: MM/DD/YYYY, YYYY-MM-DD, or Excel date number`);
          }
          
          // Validate date ranges
          if (birthDate > new Date()) {
            throw new Error(`Birth date '${birthDateStr}' cannot be in the future`);
          }
          
          if (freshenDate < birthDate) {
            throw new Error(`Freshen date '${freshenDateStr}' cannot be before birth date '${birthDateStr}'`);
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
            freshen_date: freshenDate.toISOString().split('T')[0], // Use actual freshen date
            purchase_price: purchasePrice,
            salvage_value: rowData.salvage_value !== undefined && rowData.salvage_value !== '' ? parseFloat(rowData.salvage_value) : (purchasePrice * (depreciationSettings?.default_salvage_percentage ?? 10) / 100),
            current_value: purchasePrice,
            total_depreciation: 0,
            asset_type_id: rowData.asset_type_id || 'dairy-cow',
            status: cowStatus, // Fresh cows are always active
            depreciation_method: rowData.depreciation_method || 'straight-line',
            acquisition_type: rowData.acquisition_type || defaultAcquisitionType || 'purchased',
            company_id: companyId
          };

          batchCows.push(cowData);
        } catch (error) {
          errors.push(`Row ${i + 2}: ${error.message}`);
        }
      }

      // Insert batch if we have data
      if (batchCows.length > 0) {
        // For fresh cow uploads, include all cow data including freshen_date
        const cowsForInsert = batchCows;
        
        // Deduplicate by tag_number to prevent conflict errors
        const uniqueCowsMap = new Map();
        cowsForInsert.forEach(cow => {
          const key = `${cow.tag_number}_${cow.company_id}`;
          if (!uniqueCowsMap.has(key)) {
            uniqueCowsMap.set(key, cow);
          } else {
            console.log(`Duplicate tag number found in batch: ${cow.tag_number}, keeping first occurrence`);
          }
        });
        const uniqueCows = Array.from(uniqueCowsMap.values());
        
        const { error: batchError } = await supabase
          .from('cows')
          .upsert(uniqueCows, {
            onConflict: 'tag_number,company_id',
            ignoreDuplicates: false
          });

        if (batchError) {
          console.error(`Batch ${Math.floor(batchStart / batchSize) + 1} error:`, batchError);
          errors.push(`Batch ${Math.floor(batchStart / batchSize) + 1}: ${batchError.message}`);
        } else {
          processedCows.push(...batchCows);
          console.log(`Fresh cow batch ${Math.floor(batchStart / batchSize) + 1} completed: ${batchCows.length} records`);
          
          // OPTIMIZED: Create acquisition journals in batch using direct SQL
          console.log(`Creating acquisition journals for ${batchCows.length} cows in batch ${Math.floor(batchStart / batchSize) + 1}`);
          try {
            // Prepare batch data for journal entries and lines
            const journalEntries: any[] = [];
            const journalLines: any[] = [];
            
            for (const cow of batchCows) {
              const journalEntryId = crypto.randomUUID();
              
              // Create journal entry
              journalEntries.push({
                id: journalEntryId,
                company_id: cow.company_id,
                entry_date: cow.freshen_date,
                month: new Date(cow.freshen_date).getMonth() + 1,
                year: new Date(cow.freshen_date).getFullYear(),
                entry_type: 'acquisition',
                description: `Asset Acquisition - Cow #${cow.tag_number} (${cow.acquisition_type})`,
                total_amount: cow.purchase_price
              });
              
              // Create journal lines (debit dairy cow asset, credit based on acquisition type)
              journalLines.push({
                id: crypto.randomUUID(),
                journal_entry_id: journalEntryId,
                account_code: '1500',
                account_name: 'Dairy Cows',
                description: `Acquire cow asset - Cow #${cow.tag_number}`,
                debit_amount: cow.purchase_price,
                credit_amount: 0,
                line_type: 'debit',
                cow_id: cow.id
              });
              
              if (cow.acquisition_type === 'purchased') {
                // Credit cash for purchased cows
                journalLines.push({
                  id: crypto.randomUUID(),
                  journal_entry_id: journalEntryId,
                  account_code: '1000',
                  account_name: 'Cash',
                  description: `Payment for cow acquisition - Cow #${cow.tag_number}`,
                  debit_amount: 0,
                  credit_amount: cow.purchase_price,
                  line_type: 'credit',
                  cow_id: cow.id
                });
              } else {
                // Credit heifer asset for raised cows
                journalLines.push({
                  id: crypto.randomUUID(),
                  journal_entry_id: journalEntryId,
                  account_code: '1400',
                  account_name: 'Heifers',
                  description: `Transfer from heifer to dairy cow - Cow #${cow.tag_number}`,
                  debit_amount: 0,
                  credit_amount: cow.purchase_price,
                  line_type: 'credit',
                  cow_id: cow.id
                });
              }
            }
            
            // Batch insert journal entries and lines
            const { error: entriesError } = await supabase
              .from('journal_entries')
              .insert(journalEntries);
              
            if (entriesError) {
              console.error(`Journal entries batch insert error:`, entriesError);
              errors.push(`Batch ${Math.floor(batchStart / batchSize) + 1} acquisition entries: ${entriesError.message}`);
            } else {
              const { error: linesError } = await supabase
                .from('journal_lines')
                .insert(journalLines);
                
              if (linesError) {
                console.error(`Journal lines batch insert error:`, linesError);
                errors.push(`Batch ${Math.floor(batchStart / batchSize) + 1} acquisition lines: ${linesError.message}`);
              } else {
                console.log(`✅ Acquisition journals created for ${batchCows.length} cows in batch ${Math.floor(batchStart / batchSize) + 1}`);
              }
            }
          } catch (acquisitionBatchError) {
            console.error(`Batch acquisition processing error:`, acquisitionBatchError);
            errors.push(`Batch ${Math.floor(batchStart / batchSize) + 1} acquisition processing: ${acquisitionBatchError.message}`);
          }
          
          // Skip background depreciation scheduling - handled by monthly processing
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
        message: `Successfully imported ${processedCows.length} cows. Acquisition journals created immediately. Depreciation calculations are being processed in the background.`,
        imported_count: processedCows.length,
        depreciation_status: 'processing_in_background',
        acquisition_status: 'completed_synchronously',
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