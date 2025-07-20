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
    return cleanDate;
  }
  
  if (cleanDate.includes('/')) {
    const parts = cleanDate.split('/');
    if (parts.length === 3) {
      let month, day, year;
      
      // Handle M/D/YYYY or MM/DD/YYYY format (your CSV format)
      if (parts[2].length === 4) {
        month = parts[0];
        day = parts[1]; 
        year = parts[2];
      } else {
        // Handle MM/DD/YY format
        month = parts[0];
        day = parts[1];
        year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
      }
      
      const result = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      console.log(`Date conversion: "${cleanDate}" -> "${result}"`);
      return result;
    }
  }
  
  // If in MM-DD-YYYY or DD-MM-YYYY format with dashes
  if (cleanDate.includes('-') && cleanDate.length >= 8) {
    const parts = cleanDate.split('-');
    if (parts[0].length === 4) {
      // Already YYYY-MM-DD
      return cleanDate;
    } else {
      // Assume MM-DD-YYYY format
      const [month, day, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
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

    // Get all active cows from database for the company
    const { data: activeCows, error: cowsError } = await supabase
      .from('cows')
      .select('id, tag_number, birth_date, freshen_date, status')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .limit(50000); // Set a high limit to ensure we get all cows

    if (cowsError) {
      console.error('Database error:', cowsError);
      throw cowsError;
    }

    console.log(`Found ${activeCows?.length || 0} active cows in database`);

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
        if (master.id === '40875') {
          console.log(`DEBUG cow #40875:`);
          console.log(`  Master ID: "${master.id}"`);
          console.log(`  Master birthdate: "${master.birthdate}"`);
          console.log(`  Processed master birthdate: "${processDate(master.birthdate)}"`);
          console.log(`  Master key: "${masterKey}"`);
          console.log(`  DB lookup has this key: ${dbLookup.has(masterKey)}`);
          console.log(`  DB lookup keys containing 40875:`, Array.from(dbLookup).filter(k => k.includes('40875')));
          console.log(`  All DB keys sample:`, Array.from(dbLookup).slice(0, 5));
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