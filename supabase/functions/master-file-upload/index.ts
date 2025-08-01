import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MasterFileData {
  id: string;
  birthdate: string;
}

interface VerificationResult {
  success: boolean;
  message: string;
  data: {
    cowsNeedingDisposal: Array<{
      id: string;
      tagNumber: string;
      birthDate: string;
      status: string;
    }>;
    cowsMissingFromMaster: Array<{
      id: string;
      tagNumber: string;
      birthDate: string;
      status: string;
    }>;
    cowsMissingFreshenDate: Array<{
      id: string;
      tagNumber: string;
      birthDate: string;
      freshenDate: string | null;
    }>;
    totalMasterRecords: number;
    totalActiveInDb: number;
  };
}

const parseCsvData = (csvContent: string): MasterFileData[] => {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
  
  console.log('CSV Headers found:', headers);
  
  const idIndex = headers.findIndex(h => h.includes('id') || h.includes('tag'));
  const birthdateIndex = headers.findIndex(h => h.includes('bdat') || h.includes('birth') || h.includes('date'));
  
  console.log(`ID column index: ${idIndex}, Birthdate column index: ${birthdateIndex}`);
  
  if (idIndex === -1 || birthdateIndex === -1) {
    throw new Error(`CSV must contain ID and birthdate columns. Found headers: ${headers.join(', ')}`);
  }

  const parsedData = lines.slice(1).map((line, lineIndex) => {
    const values = line.split(',').map(v => v.trim());
    const result = {
      id: values[idIndex],
      birthdate: values[birthdateIndex]
    };
    
    // Log first few rows for debugging
    if (lineIndex < 3) {
      console.log(`Row ${lineIndex + 1}: ID="${result.id}", Birthdate="${result.birthdate}"`);
    }
    
    return result;
  }).filter(row => row.id && row.birthdate);

  console.log(`Parsed ${parsedData.length} valid records from CSV`);
  return parsedData;
};

const processDate = (dateStr: string): string => {
  // Handle various date formats and clean the input
  const cleanDate = dateStr.replace(/['"]/g, '').trim();
  
  console.log(`Processing date: "${dateStr}" -> cleaned: "${cleanDate}"`);
  
  // If already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    console.log(`Date already in YYYY-MM-DD format: "${cleanDate}"`);
    return cleanDate;
  }
  
  // Handle M/D/YYYY or MM/DD/YYYY format (your CSV format)
  if (cleanDate.includes('/')) {
    const parts = cleanDate.split('/');
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0'); 
      let year = parts[2];
      
      // Handle 2-digit years by adding "20" prefix
      if (year.length === 2) {
        year = '20' + year;
      }
      
      const result = `${year}-${month}-${day}`;
      console.log(`Date conversion: "${cleanDate}" -> "${result}"`);
      return result;
    }
  }
  
  console.log(`Date format not recognized: "${cleanDate}"`);
  return cleanDate;
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    console.log('Processing master file upload request');
    
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse the multipart form data
    const formData = await req.formData();
    const file = formData.get('master') as File;
    const companyId = formData.get('company_id') as string;

    if (!file) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No file named "master" found in request' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!companyId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'company_id is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.log(`Processing file: ${file.name}, size: ${file.size} bytes for company: ${companyId}`);

    // Clear all existing staging data for this company since master file represents current state
    console.log(`Clearing all existing staging data for company: ${companyId}`);
    const { error: clearError } = await supabase
      .from('master_file_staging')
      .delete()
      .eq('company_id', companyId);

    if (clearError) {
      console.error('Error clearing staging data:', clearError);
      // Don't throw error, just log it - continue with processing
    }

    // Read and parse CSV content
    const csvContent = await file.text();
    const masterData = parseCsvData(csvContent);
    console.log(`Parsed ${masterData.length} records from master file`);

    // Get ALL active cows from database using pagination to avoid limits
    let allActiveCows: any[] = [];
    let hasMore = true;
    let offset = 0;
    const pageSize = 1000;
    
    while (hasMore) {
      const { data: pageData, error: pageError } = await supabase
        .from('cows')
        .select('id, tag_number, birth_date, freshen_date, status')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .range(offset, offset + pageSize - 1);

      if (pageError) {
        console.error('Database error:', pageError);
        throw pageError;
      }

      if (pageData && pageData.length > 0) {
        allActiveCows = allActiveCows.concat(pageData);
        offset += pageSize;
        hasMore = pageData.length === pageSize;
        console.log(`Loaded page: ${pageData.length} cows, total so far: ${allActiveCows.length}`);
      } else {
        hasMore = false;
      }
    }

    console.log(`Found ${allActiveCows.length} active cows in database`);
    console.log(`Expected 8253 active cows, got ${allActiveCows.length} - ${allActiveCows.length === 8253 ? 'SUCCESS!' : 'potential limit issue!'}`);
    
    const activeCows = allActiveCows;

    // Prepare staging records
    const stagingRecords = [];

    // Check for cows missing freshen dates
    activeCows?.forEach(cow => {
      if (!cow.freshen_date) {
        stagingRecords.push({
          company_id: companyId,
          discrepancy_type: 'missing_freshen_date',
          cow_id: cow.id,
          tag_number: cow.tag_number,
          birth_date: cow.birth_date,
          freshen_date: cow.freshen_date,
          current_status: cow.status,
          master_file_name: file.name,
          action_taken: 'pending'
        });
      }
    });

    // Create lookup for master data - normalize keys for comparison
    const masterLookup = new Set(
      masterData.map(m => {
        const processedDate = processDate(m.birthdate);
        const key = `${m.id.trim()}_${processedDate}`;
        return key;
      })
    );
    
    console.log('Master data sample:', masterData.slice(0, 3));
    console.log('Master lookup sample:', Array.from(masterLookup).slice(0, 3));

    // Check for cows in DB but not in master (potentially need disposal)
    activeCows?.forEach(cow => {
      const key = `${cow.tag_number.trim()}_${cow.birth_date}`;
      if (!masterLookup.has(key)) {
        stagingRecords.push({
          company_id: companyId,
          discrepancy_type: 'needs_disposal',
          cow_id: cow.id,
          tag_number: cow.tag_number,
          birth_date: cow.birth_date,
          freshen_date: cow.freshen_date,
          current_status: cow.status,
          master_file_name: file.name,
          action_taken: 'pending'
        });
      }
    });

    // Create lookup for DB data - normalize keys for comparison
    const dbLookup = new Set(
      activeCows?.map(cow => `${cow.tag_number.trim()}_${cow.birth_date}`) || []
    );
    
    console.log('DB data sample:', activeCows?.slice(0, 3));
    console.log('DB lookup sample:', Array.from(dbLookup).slice(0, 3));

    // Check for cows in master but not in DB (missing from database)
    masterData.forEach(master => {
      const masterKey = `${master.id.trim()}_${processDate(master.birthdate)}`;
      if (!dbLookup.has(masterKey)) {
        // Special logging for cow #40875 to debug the issue
        if (master.id.trim() === '40875') {
          console.log(`DEBUG cow #40875:`);
          console.log(`  Master ID: "${master.id}" (length: ${master.id.length})`);
          console.log(`  Master birthdate: "${master.birthdate}" (length: ${master.birthdate.length})`);
          console.log(`  Processed master birthdate: "${processDate(master.birthdate)}"`);
          console.log(`  Master key: "${masterKey}" (length: ${masterKey.length})`);
          console.log(`  DB lookup has this key: ${dbLookup.has(masterKey)}`);
          console.log(`  DB lookup keys containing 40875:`, Array.from(dbLookup).filter(k => k.includes('40875')));
          console.log(`  Master key bytes:`, Array.from(masterKey).map(c => c.charCodeAt(0)));
          const dbKey40875 = Array.from(dbLookup).find(k => k.includes('40875'));
          if (dbKey40875) {
            console.log(`  DB key bytes:`, Array.from(dbKey40875).map(c => c.charCodeAt(0)));
          }
        }
        
        console.log(`Cow ${master.id} found in master but not in DB. Master key: ${masterKey}`);
        stagingRecords.push({
          company_id: companyId,
          discrepancy_type: 'missing_from_database',
          cow_id: null,
          tag_number: master.id.trim(),
          birth_date: processDate(master.birthdate),
          freshen_date: null,
          current_status: 'not_in_db',
          master_file_name: file.name,
          action_taken: 'pending'
        });
      }
    });

    // Insert staging records
    if (stagingRecords.length > 0) {
      const { error: stagingError } = await supabase
        .from('master_file_staging')
        .insert(stagingRecords);

      if (stagingError) {
        console.error('Error inserting staging records:', stagingError);
        throw stagingError;
      }
    }

    // Create verification results for backward compatibility
    const results: VerificationResult = {
      success: true,
      message: `Master file verification completed. ${stagingRecords.length} discrepancies found and stored for review.`,
      data: {
        cowsNeedingDisposal: stagingRecords.filter(r => r.discrepancy_type === 'needs_disposal').map(r => ({
          id: r.cow_id || '',
          tagNumber: r.tag_number,
          birthDate: r.birth_date,
          status: r.current_status || ''
        })),
        cowsMissingFromMaster: stagingRecords.filter(r => r.discrepancy_type === 'missing_from_database').map(r => ({
          id: r.cow_id || '',
          tagNumber: r.tag_number,
          birthDate: r.birth_date,
          status: r.current_status || ''
        })),
        cowsMissingFreshenDate: stagingRecords.filter(r => r.discrepancy_type === 'missing_freshen_date').map(r => ({
          id: r.cow_id || '',
          tagNumber: r.tag_number,
          birthDate: r.birth_date,
          freshenDate: r.freshen_date
        })),
        totalMasterRecords: masterData.length,
        totalActiveInDb: activeCows?.length || 0
      }
    };

    console.log('Verification completed:', {
      totalMasterRecords: results.data.totalMasterRecords,
      totalActiveInDb: results.data.totalActiveInDb,
      totalDiscrepancies: stagingRecords.length,
      cowsNeedingDisposal: results.data.cowsNeedingDisposal.length,
      cowsMissingFromMaster: results.data.cowsMissingFromMaster.length,
      cowsMissingFreshenDate: results.data.cowsMissingFreshenDate.length
    });

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error: any) {
    console.error('Error processing master file:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An error occurred during verification',
        details: error.toString()
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);