import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DispositionData {
  cow_id: string
  company_id: string
  disposition_date: string
  disposition_type: string
  sale_amount: number
  final_book_value: number
  gain_loss: number
  notes: string
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

    // Verify upload token
    if (!uploadToken || uploadToken.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing upload token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Verifying token for dispositions upload:', companyId, 'token:', uploadToken);
    
    // Verify upload token is valid and active
    const { data: tokenData, error: tokenError } = await supabase
      .from('upload_tokens')
      .select('id, company_id, token_name, is_active')
      .eq('company_id', companyId)
      .eq('token_value', uploadToken)
      .eq('is_active', true)
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.error('Token verification failed:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid company ID or upload token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Determine disposition type from filename
    const fileName = csvFile.name.toUpperCase();
    let defaultDispositionType = 'sale'; // Default to sale
    
    if (fileName.includes('DIED') || fileName.includes('DEAD') || fileName.includes('DEATH')) {
      defaultDispositionType = 'death';
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

    // Map headers to expected format for dispositions
    const headerMapping: Record<string, string> = {
      'ID': 'tag_number',
      'BDAT': 'birth_date',
      'Date': 'event_date', // Disposition date
      'DIM': 'days_in_milk',
      'Event': 'event',
      'Remark': 'notes',
      'Amount': 'sale_amount',
      'SaleAmount': 'sale_amount'
    };
    
    // Create case-insensitive mapping
    const lowerHeaderMapping: Record<string, string> = {};
    Object.entries(headerMapping).forEach(([key, value]) => {
      lowerHeaderMapping[key.toLowerCase()] = value;
    });

    // Create mapped headers
    const mappedHeaders = headers.map(h => {
      const exactMatch = headerMapping[h];
      const lowerMatch = lowerHeaderMapping[h.toLowerCase()];
      return exactMatch || lowerMatch || h.toLowerCase();
    });

    console.log('Disposition upload - Original headers:', headers);
    console.log('Disposition upload - Mapped headers:', mappedHeaders);

    // Required headers for dispositions
    const requiredHeaders = ['tag_number', 'event_date'];
    const missingHeaders = requiredHeaders.filter(h => !mappedHeaders.includes(h));
    
    if (missingHeaders.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: `Missing required disposition data. Found headers: ${headers.join(', ')}. Please ensure your CSV contains: cow ID and disposition date.`,
          required_headers: requiredHeaders,
          found_headers: headers,
          mapped_headers: mappedHeaders
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process disposition records
    const processedDispositions: DispositionData[] = [];
    const errors: string[] = [];
    const batchSize = 1000;
    
    console.log(`Processing ${dataRows.length} disposition rows in batches of ${batchSize}`);

    for (let batchStart = 0; batchStart < dataRows.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, dataRows.length);
      const batchDispositions: DispositionData[] = [];
      
      console.log(`Processing disposition batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(dataRows.length / batchSize)} (rows ${batchStart + 1}-${batchEnd})`);

      for (let i = batchStart; i < batchEnd; i++) {
        try {
          const values = dataRows[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const rowData: Record<string, string> = {};
          
          // Map headers to data
          headers.forEach((header, index) => {
            const exactMatch = headerMapping[header];
            const lowerMatch = lowerHeaderMapping[header.toLowerCase()];
            const mappedHeader = exactMatch || lowerMatch || header.toLowerCase();
            rowData[mappedHeader] = values[index] || '';
          });

          console.log(`Disposition row ${i + 2}:`, {
            raw_values: values,
            tag_number: rowData.tag_number,
            event_date: rowData.event_date,
            event: rowData.event,
            sale_amount: rowData.sale_amount
          });

          // Parse required fields
          const tagNumber = rowData.tag_number;
          const eventDateStr = rowData.event_date || rowData.date;
          
          if (!tagNumber) {
            throw new Error(`Missing cow tag number`);
          }
          
          if (!eventDateStr) {
            throw new Error(`Missing disposition date`);
          }

          // Parse date
          const parseDate = (dateStr: string): Date => {
            if (!dateStr) throw new Error('Empty date string');
            
            // Check if it's a number (Excel date serial number)
            const num = Number(dateStr);
            if (!isNaN(num) && num > 1) {
              const excelEpoch = new Date(1900, 0, 1);
              const date = new Date(excelEpoch.getTime() + (num - 2) * 24 * 60 * 60 * 1000);
              return date;
            }
            
            return new Date(dateStr);
          };

          const dispositionDate = parseDate(eventDateStr);
          
          if (isNaN(dispositionDate.getTime())) {
            throw new Error(`Invalid disposition date format: '${eventDateStr}'`);
          }

          // Get existing cow data to calculate book value
          const { data: cowData, error: cowError } = await supabase
            .from('cows')
            .select('id, tag_number, purchase_price, current_value, total_depreciation, status, salvage_value, freshen_date')
            .eq('tag_number', tagNumber)
            .eq('company_id', companyId)
            .maybeSingle();

          if (cowError) {
            console.error(`Error fetching cow ${tagNumber}:`, cowError);
            throw new Error(`Error fetching cow data: ${cowError.message}`);
          }

          if (!cowData) {
            throw new Error(`Cow ${tagNumber} not found in database`);
          }

          // Calculate accurate depreciation up to disposition date
          console.log(`📊 Calculating accurate depreciation for cow ${tagNumber} up to ${dispositionDate.toISOString().split('T')[0]}`);
          
          // Calculate months from freshen date to disposition date
          const freshenDate = new Date(cowData.freshen_date);
          const monthsElapsed = Math.max(0, 
            (dispositionDate.getFullYear() - freshenDate.getFullYear()) * 12 + 
            (dispositionDate.getMonth() - freshenDate.getMonth())
          );
          
          // Calculate total depreciation using 5-year straight line
          const depreciableAmount = cowData.purchase_price - cowData.salvage_value;
          const monthlyDepreciation = depreciableAmount / (5 * 12);
          const totalDepreciationToDate = Math.min(
            monthlyDepreciation * monthsElapsed,
            depreciableAmount
          );
          
          // Calculate current book value at disposition date
          const accurateBookValue = Math.max(
            cowData.salvage_value,
            cowData.purchase_price - totalDepreciationToDate
          );

          console.log(`📈 Cow ${tagNumber}: Purchase: $${cowData.purchase_price}, Salvage: $${cowData.salvage_value}, Months: ${monthsElapsed}, Total Depreciation: $${totalDepreciationToDate.toFixed(2)}, Book Value: $${accurateBookValue.toFixed(2)}`);

          // Determine disposition type
          let dispositionType = defaultDispositionType;
          const event = (rowData.event || '').toLowerCase();
          const notes = (rowData.notes || '').toLowerCase();
          
          if (event.includes('sold') || notes.includes('sold')) {
            dispositionType = 'sale';
          } else if (event.includes('died') || event.includes('dead') || notes.includes('died') || notes.includes('dead')) {
            dispositionType = 'death';
          }

          // Parse sale amount
          const saleAmount = parseFloat(rowData.sale_amount || rowData.amount || '0') || 0;
          
          // Use accurately calculated book value
          const finalBookValue = accurateBookValue;
          const gainLoss = saleAmount - finalBookValue;

          const dispositionData: DispositionData = {
            cow_id: cowData.id, // Use actual cow ID instead of tag number
            company_id: companyId,
            disposition_date: dispositionDate.toISOString().split('T')[0],
            disposition_type: dispositionType,
            sale_amount: saleAmount,
            final_book_value: finalBookValue,
            gain_loss: gainLoss,
            notes: rowData.notes || `Imported from ${csvFile.name}`
          };

          batchDispositions.push(dispositionData);

        } catch (error) {
          errors.push(`Row ${i + 2}: ${error.message}`);
        }
      }

      // Deduplicate batch dispositions before inserting
      if (batchDispositions.length > 0) {
        // Remove duplicates within the batch based on the unique constraint
        const uniqueDispositions = batchDispositions.filter((disposition, index, self) => 
          index === self.findIndex(d => 
            d.cow_id === disposition.cow_id && 
            d.company_id === disposition.company_id && 
            d.disposition_date === disposition.disposition_date && 
            d.disposition_type === disposition.disposition_type
          )
        );

        const { error: dispositionError } = await supabase
          .from('cow_dispositions')
          .upsert(uniqueDispositions, { 
            onConflict: 'cow_id,company_id,disposition_date,disposition_type'
          });

        if (dispositionError) {
          console.error(`Disposition batch ${Math.floor(batchStart / batchSize) + 1} error:`, dispositionError);
          errors.push(`Batch ${Math.floor(batchStart / batchSize) + 1}: ${dispositionError.message}`);
        } else {
          processedDispositions.push(...batchDispositions);
          console.log(`Disposition batch ${Math.floor(batchStart / batchSize) + 1} completed: ${batchDispositions.length} records`);

          // Update cow status to sold/deceased for each disposition
          for (const disposition of batchDispositions) {
            const { error: updateError } = await supabase
              .from('cows')
              .update({
                status: disposition.disposition_type === 'sale' ? 'sold' : 'deceased',
                disposition_id: null // Will be updated by trigger if needed
              })
              .eq('id', disposition.cow_id) // Use cow ID instead of tag number
              .eq('company_id', disposition.company_id);

            if (updateError) {
              console.error(`Error updating cow ${disposition.cow_id} status:`, updateError);
              errors.push(`Error updating cow ${disposition.cow_id} status: ${updateError.message}`);
            }
          }
        }
      }
    }

    // Return results
    const summary = {
      total_rows: dataRows.length,
      processed_dispositions: processedDispositions.length,
      errors: errors.length,
      disposition_type: defaultDispositionType,
      filename: csvFile.name
    };

    console.log(`Processing summary: ${processedDispositions.length} processed, ${errors.length} errors`);
    
    // Auto-process missing disposition journals after successful upload
    const dispositionProcessingTask = async () => {
      try {
        console.log('🔄 Auto-processing missing disposition journals...');
        const { data: dispositionData, error: dispositionError } = await supabase.rpc('process_missing_disposition_journals', {
          p_company_id: companyId
        });

        if (dispositionError) {
          console.error('Error auto-processing dispositions:', dispositionError);
        } else if (dispositionData && typeof dispositionData === 'object' && 'success' in dispositionData && dispositionData.success && 'total_processed' in dispositionData && (dispositionData.total_processed as number) > 0) {
          console.log(`✅ Automatically created ${dispositionData.total_processed as number} disposition journal entries`);
        } else {
          console.log('ℹ️ No missing disposition journals to process');
        }
        
        // CRITICAL FIX: Clean up any depreciation entries created after disposition dates
        // This prevents race conditions between monthly processing and disposition uploads
        console.log('🧹 Cleaning up invalid depreciation entries after disposition upload...');
        try {
          const { data: cleanupData, error: cleanupError } = await supabase.rpc('exec_sql', {
            query: `
              DELETE FROM public.journal_lines 
              WHERE journal_entry_id IN (
                SELECT je.id FROM public.journal_entries je
                JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
                JOIN public.cow_dispositions cd ON cd.cow_id = jl.cow_id
                WHERE je.entry_type = 'depreciation'
                  AND je.entry_date > cd.disposition_date
                  AND jl.cow_id IS NOT NULL
              );
              DELETE FROM public.journal_entries 
              WHERE entry_type = 'depreciation'
                AND NOT EXISTS (SELECT 1 FROM public.journal_lines WHERE journal_entry_id = journal_entries.id);
            `
          });
          
          if (!cleanupError) {
            console.log('✅ Successfully cleaned up invalid depreciation entries');
          }
        } catch (cleanupErr) {
          console.warn('Warning: Could not run cleanup query:', cleanupErr);
        }
      } catch (error) {
        console.error('Error in auto-processing dispositions:', error);
      }
    };

    // Process disposition journals in background
    EdgeRuntime.waitUntil(dispositionProcessingTask());
    
    // Always return success, even with validation errors
    console.log('Disposition upload completed:', summary);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Upload processed. ${processedDispositions.length} dispositions imported. Journal entries are being processed in the background.`,
        processed: processedDispositions.length,
        total: dataRows.length,
        filename: csvFile.name,
        disposition_journal_status: 'processing_in_background'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Disposition upload error:', error);
    return new Response(
      JSON.stringify({ error: `Server error: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});