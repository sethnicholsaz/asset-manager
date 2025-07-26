import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Cow {
  id: string;
  tag_number: string;
  purchase_price: number;
  salvage_value: number;
  freshen_date: string;
}

interface ExistingEntry {
  id: string;
  month: number;
  year: number;
  total_amount: number;
  cow_id: string;
  depreciation_amount: number;
}

function calculateMonthlyDepreciation(purchasePrice: number, salvageValue: number): number {
  return Math.round((purchasePrice - salvageValue) / (5 * 12) * 100) / 100;
}

function shouldDepreciate(freshenDate: string, targetYear: number, targetMonth: number): boolean {
  const freshen = new Date(freshenDate);
  const target = new Date(targetYear, targetMonth - 1, 1);
  return freshen <= target;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { company_id, start_year = 2020, end_year = 2024 } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: 'Company ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting depreciation journal structure fix for company ${company_id}`);

    // Get all cows for the company
    const { data: cows, error: cowsError } = await supabase
      .from('cows')
      .select('id, tag_number, purchase_price, salvage_value, freshen_date')
      .eq('company_id', company_id);

    if (cowsError) throw cowsError;

    console.log(`Found ${cows.length} cows to process`);

    // Get all existing individual depreciation entries that need to be consolidated
    const { data: existingEntries, error: entriesError } = await supabase
      .from('journal_entries')
      .select(`
        id,
        month,
        year,
        total_amount,
        journal_lines!inner(cow_id, credit_amount)
      `)
      .eq('company_id', company_id)
      .eq('entry_type', 'depreciation')
      .like('description', '%catchup%')
      .gte('year', start_year)
      .lte('year', end_year);

    if (entriesError) throw entriesError;

    console.log(`Found ${existingEntries.length} individual entries to consolidate`);

    // Group existing entries by month/year
    const monthlyData: { [key: string]: ExistingEntry[] } = {};
    existingEntries.forEach(entry => {
      const key = `${entry.year}-${entry.month}`;
      if (!monthlyData[key]) monthlyData[key] = [];
      
      entry.journal_lines.forEach((line: any) => {
        monthlyData[key].push({
          id: entry.id,
          month: entry.month,
          year: entry.year,
          total_amount: entry.total_amount,
          cow_id: line.cow_id,
          depreciation_amount: line.credit_amount
        });
      });
    });

    console.log(`Processing ${Object.keys(monthlyData).length} months of data`);

    let processedMonths = 0;
    let totalLinesCreated = 0;

    // Process each month
    for (const [monthKey, entries] of Object.entries(monthlyData)) {
      const [year, month] = monthKey.split('-').map(Number);
      
      console.log(`Processing ${month}/${year} with ${entries.length} cow entries`);

      // Calculate total monthly depreciation for this month
      let totalMonthlyDepreciation = 0;
      const cowDepreciationData: { [cowId: string]: number } = {};

      // For each cow, calculate what their depreciation should be for this month
      cows.forEach(cow => {
        if (shouldDepreciate(cow.freshen_date, year, month)) {
          const monthlyDepreciation = calculateMonthlyDepreciation(cow.purchase_price, cow.salvage_value);
          if (monthlyDepreciation > 0) {
            cowDepreciationData[cow.id] = monthlyDepreciation;
            totalMonthlyDepreciation += monthlyDepreciation;
          }
        }
      });

      if (totalMonthlyDepreciation === 0) continue;

      // Delete existing individual entries for this month
      const entryIdsToDelete = [...new Set(entries.map(e => e.id))];
      
      // Delete journal lines first
      for (const entryId of entryIdsToDelete) {
        await supabase
          .from('journal_lines')
          .delete()
          .eq('journal_entry_id', entryId);
      }

      // Delete journal entries
      await supabase
        .from('journal_entries')
        .delete()
        .in('id', entryIdsToDelete);

      // Create consolidated monthly journal entry
      const targetDate = new Date(year, month - 1, 0); // Last day of previous month
      targetDate.setMonth(targetDate.getMonth() + 1); // Move to last day of target month

      const { data: newJournalEntry, error: journalError } = await supabase
        .from('journal_entries')
        .insert({
          company_id,
          entry_date: targetDate.toISOString().split('T')[0],
          month,
          year,
          entry_type: 'depreciation',
          description: `Monthly Depreciation - ${new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
          total_amount: Math.round(totalMonthlyDepreciation * 100) / 100
        })
        .select()
        .single();

      if (journalError) throw journalError;

      // Create individual journal lines for each cow
      const journalLines = [];
      for (const [cowId, depreciation] of Object.entries(cowDepreciationData)) {
        const cow = cows.find(c => c.id === cowId);
        if (!cow) continue;

        // Debit line for depreciation expense
        journalLines.push({
          journal_entry_id: newJournalEntry.id,
          account_code: '6100',
          account_name: 'Depreciation Expense',
          description: `Monthly depreciation - Cow #${cow.tag_number}`,
          debit_amount: depreciation,
          credit_amount: 0,
          line_type: 'debit',
          cow_id: cowId
        });

        // Credit line for accumulated depreciation
        journalLines.push({
          journal_entry_id: newJournalEntry.id,
          account_code: '1500.1',
          account_name: 'Accumulated Depreciation - Dairy Cows',
          description: `Monthly depreciation - Cow #${cow.tag_number}`,
          debit_amount: 0,
          credit_amount: depreciation,
          line_type: 'credit',
          cow_id: cowId
        });
      }

      // Insert all journal lines for this month
      const { error: linesError } = await supabase
        .from('journal_lines')
        .insert(journalLines);

      if (linesError) throw linesError;

      totalLinesCreated += journalLines.length;
      processedMonths++;

      console.log(`Completed ${month}/${year}: ${journalLines.length / 2} cows, $${totalMonthlyDepreciation}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Depreciation journal structure fixed successfully',
        company_id,
        processed_months: processedMonths,
        total_lines_created: totalLinesCreated,
        cows_processed: cows.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fixing depreciation journal structure:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fix depreciation journal structure', 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});