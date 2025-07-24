/**
 * Functional Monthly Journal Processor
 * Uses domain-driven architecture for journal entry creation
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  buildDepreciationEntry,
  buildDispositionEntry,
  validateJournalBalance,
  formatCurrency,
  calculateMonthlyDepreciation,
  calculateMonthsSinceStart,
  type DepreciationData,
  type DispositionData,
  type JournalEntry,
} from "../shared/domain-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Company {
  id: string;
  name: string;
}

interface Cow {
  id: string;
  tag_number: string;
  purchase_price: number;
  salvage_value: number;
  freshen_date: string;
  total_depreciation: number;
  status: string;
  acquisition_type: string;
}

interface Disposition {
  id: string;
  cow_id: string;
  disposition_date: string;
  disposition_type: string;
  sale_amount: number;
  final_book_value: number;
  gain_loss: number;
}

// Pure function to get month name
const getMonthName = (month: number): string => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1];
};

// Pure function to check if entry already exists
const checkExistingEntry = async (
  supabase: any,
  companyId: string,
  month: number,
  year: number,
  entryType: string
): Promise<boolean> => {
  const { data: existingEntries } = await supabase
    .from('journal_entries')
    .select('entry_type')
    .eq('company_id', companyId)
    .eq('month', month)
    .eq('year', year)
    .eq('entry_type', entryType);

  return (existingEntries?.length || 0) > 0;
};

// Pure function to process company depreciation
const processCompanyDepreciation = async (
  supabase: any,
  company: Company,
  targetMonth: number,
  targetYear: number
): Promise<{ success: boolean; amount?: number; cows?: number; error?: string }> => {
  console.log(`Processing depreciation for ${company.name}`);

  try {
    // Check if depreciation entry already exists
    const hasDepreciationEntry = await checkExistingEntry(
      supabase, 
      company.id, 
      targetMonth, 
      targetYear, 
      'depreciation'
    );

    if (hasDepreciationEntry) {
      console.log(`Depreciation entry already exists for ${company.name}`);
      return { success: true, amount: 0, cows: 0 };
    }

    // Use the database function for consistency
    const { data: result, error: depreciationError } = await supabase
      .rpc('process_monthly_depreciation', {
        p_company_id: company.id,
        p_target_month: targetMonth,
        p_target_year: targetYear
      });

    if (depreciationError) {
      throw depreciationError;
    }

    if (result?.success) {
      console.log(`Created depreciation entry: ${formatCurrency(result.total_amount)} for ${result.cows_processed} cows`);
      return { 
        success: true, 
        amount: result.total_amount, 
        cows: result.cows_processed 
      };
    }

    return { success: true, amount: 0, cows: 0 };

  } catch (error) {
    console.error(`Error processing depreciation for ${company.name}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

// Pure function to create journal entry in database
const createJournalEntryInDB = async (
  supabase: any,
  entry: JournalEntry
): Promise<{ success: boolean; journalEntryId?: string; error?: string }> => {
  try {
    // Validate journal balance
    const validation = validateJournalBalance(entry);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Create journal entry
    const { data: journalEntry, error: journalError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: entry.companyId,
        entry_date: entry.entryDate.toISOString().split('T')[0],
        month: entry.month,
        year: entry.year,
        entry_type: entry.entryType,
        description: entry.description,
        total_amount: entry.totalAmount
      })
      .select('id')
      .single();

    if (journalError) throw journalError;

    // Create journal lines
    const journalLinesToInsert = entry.lines.map(line => ({
      journal_entry_id: journalEntry.id,
      cow_id: line.cowId || null,
      account_code: line.accountCode,
      account_name: line.accountName,
      description: line.description,
      debit_amount: line.debitAmount,
      credit_amount: line.creditAmount,
      line_type: line.lineType
    }));

    const { error: linesError } = await supabase
      .from('journal_lines')
      .insert(journalLinesToInsert);

    if (linesError) throw linesError;

    return { success: true, journalEntryId: journalEntry.id };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

// Pure function to process company dispositions
const processCompanyDispositions = async (
  supabase: any,
  company: Company,
  targetMonth: number,
  targetYear: number
): Promise<{ success: boolean; amount?: number; dispositions?: number; error?: string }> => {
  console.log(`Processing dispositions for ${company.name}`);

  try {
    // Check if disposition entry already exists
    const hasDispositionEntry = await checkExistingEntry(
      supabase,
      company.id,
      targetMonth,
      targetYear,
      'disposition'
    );

    if (hasDispositionEntry) {
      console.log(`Disposition entry already exists for ${company.name}`);
      return { success: true, amount: 0, dispositions: 0 };
    }

    // Get dispositions for the month
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);

    const { data: dispositions, error: dispositionsError } = await supabase
      .from('cow_dispositions')
      .select('*')
      .eq('company_id', company.id)
      .gte('disposition_date', startDate.toISOString().split('T')[0])
      .lte('disposition_date', endDate.toISOString().split('T')[0]);

    if (dispositionsError) throw dispositionsError;

    if (!dispositions || dispositions.length === 0) {
      console.log(`No dispositions found for ${company.name}`);
      return { success: true, amount: 0, dispositions: 0 };
    }

    console.log(`Processing ${dispositions.length} dispositions for ${company.name}`);

    // Get cow data for dispositions
    const cowTagNumbers = dispositions.map(d => d.cow_id);
    const { data: dispositionCows, error: cowError } = await supabase
      .from('cows')
      .select('*')
      .in('tag_number', cowTagNumbers);

    if (cowError) throw cowError;

    // Process each disposition using functional approach
    const allJournalLines: any[] = [];
    let totalDispositionAmount = 0;

    for (const disposition of dispositions) {
      const cow = dispositionCows?.find(c => c.tag_number === disposition.cow_id);
      if (!cow) continue;

      // Calculate proper book value
      let accumulatedDepreciation = cow.total_depreciation || 0;
      if (accumulatedDepreciation === 0) {
        const monthlyDepreciation = calculateMonthlyDepreciation(
          cow.purchase_price,
          cow.salvage_value
        );
        const monthsSinceStart = calculateMonthsSinceStart(
          new Date(cow.freshen_date),
          new Date(disposition.disposition_date)
        );
        accumulatedDepreciation = monthlyDepreciation * monthsSinceStart;
      }

      const bookValue = Math.max(cow.salvage_value, cow.purchase_price - accumulatedDepreciation);

      // Build disposition entry using domain function
      const dispositionData: DispositionData = {
        companyId: company.id,
        cowId: cow.id,
        cowTag: cow.tag_number,
        entryDate: new Date(disposition.disposition_date),
        dispositionType: disposition.disposition_type,
        purchasePrice: cow.purchase_price,
        accumulatedDepreciation,
        saleAmount: disposition.sale_amount || 0,
        bookValue,
      };

      const journalEntry = buildDispositionEntry(dispositionData);
      allJournalLines.push(...journalEntry.lines.map(line => ({
        ...line,
        journal_entry_id: null, // Will be set after creating the entry
      })));

      totalDispositionAmount += Math.max(disposition.sale_amount || 0, cow.purchase_price);
    }

    if (allJournalLines.length > 0) {
      // Create single disposition journal entry for all dispositions
      const { data: journalEntry, error: journalError } = await supabase
        .from('journal_entries')
        .insert({
          company_id: company.id,
          entry_date: new Date(targetYear, targetMonth - 1, 30).toISOString().split('T')[0],
          month: targetMonth,
          year: targetYear,
          entry_type: 'disposition',
          description: `Cow Dispositions - ${getMonthName(targetMonth)} ${targetYear}`,
          total_amount: totalDispositionAmount
        })
        .select('id')
        .single();

      if (journalError) throw journalError;

      // Update journal lines with entry ID
      const journalLinesToInsert = allJournalLines.map(line => ({
        ...line,
        journal_entry_id: journalEntry.id
      }));

      const { error: linesError } = await supabase
        .from('journal_lines')
        .insert(journalLinesToInsert);

      if (linesError) throw linesError;

      console.log(`Created disposition entry: ${formatCurrency(totalDispositionAmount)}`);
      return { 
        success: true, 
        amount: totalDispositionAmount, 
        dispositions: dispositions.length 
      };
    }

    return { success: true, amount: 0, dispositions: 0 };

  } catch (error) {
    console.error(`Error processing dispositions for ${company.name}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.52.0');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get target month and year from request body
    const body = await req.json();
    const targetMonth = body.month || new Date().getMonth() + 1;
    const targetYear = body.year || new Date().getFullYear();

    console.log(`Processing monthly journal entries for ${getMonthName(targetMonth)} ${targetYear}`);

    // Fetch all companies
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name');

    if (companiesError) throw companiesError;

    console.log(`Found ${companies?.length || 0} companies to process`);

    let totalCompaniesProcessed = 0;
    let totalJournalEntriesCreated = 0;
    const processingResults: any[] = [];

    // Process each company using functional approach
    for (const company of companies || []) {
      console.log(`Processing company: ${company.name} (${company.id})`);

      try {
        // Process depreciation
        const depreciationResult = await processCompanyDepreciation(
          supabase,
          company,
          targetMonth,
          targetYear
        );

        // Process dispositions
        const dispositionResult = await processCompanyDispositions(
          supabase,
          company,
          targetMonth,
          targetYear
        );

        processingResults.push({
          company: company.name,
          depreciation: depreciationResult,
          disposition: dispositionResult,
        });

        if (depreciationResult.success && (depreciationResult.amount || 0) > 0) {
          totalJournalEntriesCreated++;
        }

        if (dispositionResult.success && (dispositionResult.amount || 0) > 0) {
          totalJournalEntriesCreated++;
        }

        totalCompaniesProcessed++;

      } catch (error) {
        console.error(`Error processing company ${company.name}:`, error);
        processingResults.push({
          company: company.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`Monthly processing complete: ${totalCompaniesProcessed} companies, ${totalJournalEntriesCreated} journal entries created`);

    return new Response(
      JSON.stringify({
        success: true,
        companiesProcessed: totalCompaniesProcessed,
        journalEntriesCreated: totalJournalEntriesCreated,
        period: `${getMonthName(targetMonth)} ${targetYear}`,
        results: processingResults,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in functional monthly journal processor:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});