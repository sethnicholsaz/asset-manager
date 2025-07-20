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
  
  const idIndex = headers.findIndex(h => h.includes('id') || h.includes('tag'));
  const birthdateIndex = headers.findIndex(h => h.includes('birth') || h.includes('bdat'));
  
  if (idIndex === -1 || birthdateIndex === -1) {
    throw new Error('CSV must contain ID and birthdate columns');
  }

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    return {
      id: values[idIndex],
      birthdate: values[birthdateIndex]
    };
  }).filter(row => row.id && row.birthdate);
};

const processDate = (dateStr: string): string => {
  // Handle various date formats
  const cleanDate = dateStr.replace(/['"]/g, '');
  
  if (cleanDate.includes('/')) {
    const [month, day, year] = cleanDate.split('/');
    const fullYear = year.length === 2 ? '20' + year : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
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

    // Clear previous staging data for this company (optional - you might want to keep history)
    await supabase
      .from('master_file_staging')
      .delete()
      .eq('company_id', companyId)
      .eq('action_taken', 'pending');

    // Read and parse CSV content
    const csvContent = await file.text();
    const masterData = parseCsvData(csvContent);
    console.log(`Parsed ${masterData.length} records from master file`);

    // Get all active cows from database for the company
    const { data: activeCows, error: cowsError } = await supabase
      .from('cows')
      .select('id, tag_number, birth_date, freshen_date, status')
      .eq('company_id', companyId)
      .eq('status', 'active');

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

    // Create lookup for master data
    const masterLookup = new Set(
      masterData.map(m => `${m.id}_${processDate(m.birthdate)}`)
    );

    // Check for cows in DB but not in master (potentially need disposal)
    activeCows?.forEach(cow => {
      const key = `${cow.tag_number}_${cow.birth_date}`;
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

    // Create lookup for DB data
    const dbLookup = new Set(
      activeCows?.map(cow => `${cow.tag_number}_${cow.birth_date}`) || []
    );

    // Check for cows in master but not in DB (missing from database)
    masterData.forEach(master => {
      const key = `${master.id}_${processDate(master.birthdate)}`;
      if (!dbLookup.has(key)) {
        stagingRecords.push({
          company_id: companyId,
          discrepancy_type: 'missing_from_master',
          cow_id: null,
          tag_number: master.id,
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
        cowsMissingFromMaster: stagingRecords.filter(r => r.discrepancy_type === 'missing_from_master').map(r => ({
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