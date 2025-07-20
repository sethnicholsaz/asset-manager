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

    // Create verification results
    const results: VerificationResult = {
      success: true,
      message: 'Master file verification completed successfully',
      data: {
        cowsNeedingDisposal: [],
        cowsMissingFromMaster: [],
        cowsMissingFreshenDate: [],
        totalMasterRecords: masterData.length,
        totalActiveInDb: activeCows?.length || 0
      }
    };

    // Check for cows missing freshen dates
    activeCows?.forEach(cow => {
      if (!cow.freshen_date) {
        results.data.cowsMissingFreshenDate.push({
          id: cow.id,
          tagNumber: cow.tag_number,
          birthDate: cow.birth_date,
          freshenDate: cow.freshen_date
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
        results.data.cowsNeedingDisposal.push({
          id: cow.id,
          tagNumber: cow.tag_number,
          birthDate: cow.birth_date,
          status: cow.status
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
        results.data.cowsMissingFromMaster.push({
          id: master.id,
          tagNumber: master.id,
          birthDate: processDate(master.birthdate),
          status: 'unknown'
        });
      }
    });

    console.log('Verification completed:', {
      totalMasterRecords: results.data.totalMasterRecords,
      totalActiveInDb: results.data.totalActiveInDb,
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