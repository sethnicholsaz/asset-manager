import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Company {
  id: string;
  name: string;
}

interface Cow {
  id: string;
  tag_number: string;
  name?: string;
  birth_date: string;
  freshen_date: string;
  purchase_price: number;
  salvage_value: number;
  current_value: number;
  total_depreciation: number;
  status: string;
  depreciation_method: string;
  acquisition_type: string;
  asset_type_id: string;
  company_id: string;
  disposition_id?: string;
}

interface Disposition {
  id: string;
  cow_id: string;
  disposition_date: string;
  disposition_type: string;
  sale_amount: number;
  final_book_value: number;
  gain_loss: number;
  notes?: string;
  company_id: string;
}

// Helper functions for depreciation calculations
function calculateMonthlyDepreciation(cow: Cow, currentDate: Date): number {
  const depreciableAmount = cow.purchase_price - cow.salvage_value;
  const depreciationYears = 5; // Default depreciation years
  const monthlyDepreciation = depreciableAmount / (depreciationYears * 12);
  return Math.max(0, monthlyDepreciation);
}

function getMonthsSinceStart(startDate: Date, currentDate: Date): number {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const current = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  
  const yearDiff = current.getFullYear() - start.getFullYear();
  const monthDiff = current.getMonth() - start.getMonth();
  
  return Math.max(0, yearDiff * 12 + monthDiff);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function getMonthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' });
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the previous month (journal entries are created on the 5th for the previous month)
    const now = new Date();
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    
    console.log(`Processing monthly journal entries for ${getMonthName(prevMonth)} ${prevYear}`);

    // Get all companies
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name');

    if (companiesError) {
      console.error('Error fetching companies:', companiesError);
      throw companiesError;
    }

    let totalCompaniesProcessed = 0;
    let totalJournalEntriesCreated = 0;

    // Process each company
    for (const company of (companies || [])) {
      console.log(`Processing company: ${company.name} (${company.id})`);

      try {
        // Check if journal entries already exist for this month/year
        const { data: existingEntries } = await supabase
          .from('stored_journal_entries')
          .select('id, entry_type')
          .eq('company_id', company.id)
          .eq('month', prevMonth)
          .eq('year', prevYear);

        const hasDepreciationEntry = existingEntries?.some(e => e.entry_type === 'depreciation');
        const hasDispositionEntry = existingEntries?.some(e => e.entry_type === 'disposition');

        // Process Depreciation Entries (if not already created)
        if (!hasDepreciationEntry) {
          console.log(`Creating depreciation entry for ${company.name}`);
          
          // Fetch all cows with pagination
          let allCows: Cow[] = [];
          let from = 0;
          const pageSize = 1000;
          
          while (true) {
            const { data: cows, error: cowsError } = await supabase
              .from('cows')
              .select('*')
              .eq('company_id', company.id)
              .order('tag_number')
              .range(from, from + pageSize - 1);

            if (cowsError) throw cowsError;
            if (!cows || cows.length === 0) break;
            
            allCows = allCows.concat(cows);
            if (cows.length < pageSize) break;
            from += pageSize;
          }

          // Filter active cows for the reporting period
          const reportDate = new Date(prevYear, prevMonth, 0); // Last day of previous month
          const activeCows = allCows.filter((cow: Cow) => 
            cow.status === 'active' && 
            new Date(cow.freshen_date) <= reportDate
          );

          console.log(`Found ${activeCows.length} active cows for depreciation`);

          if (activeCows.length > 0) {
            // Calculate total monthly depreciation
            let totalMonthlyDepreciation = 0;
            
            activeCows.forEach((cow: Cow) => {
              const monthlyDepreciation = calculateMonthlyDepreciation(cow, reportDate);
              totalMonthlyDepreciation += monthlyDepreciation;
            });

            if (totalMonthlyDepreciation > 0) {
              // Create depreciation journal entry
              const { data: journalEntry, error: journalError } = await supabase
                .from('stored_journal_entries')
                .insert({
                  company_id: company.id,
                  entry_date: new Date(prevYear, prevMonth - 1, 1), // First day of the month
                  month: prevMonth,
                  year: prevYear,
                  entry_type: 'depreciation',
                  description: `Dairy Cow Depreciation - ${getMonthName(prevMonth)} ${prevYear}`,
                  total_amount: totalMonthlyDepreciation,
                  status: 'posted'
                })
                .select('id')
                .single();

              if (journalError) throw journalError;

              // Create journal lines
              const journalLines = [
                {
                  journal_entry_id: journalEntry.id,
                  account_code: '6100',
                  account_name: 'Depreciation Expense',
                  description: 'Monthly depreciation of dairy cows',
                  debit_amount: totalMonthlyDepreciation,
                  credit_amount: 0,
                  line_type: 'debit'
                },
                {
                  journal_entry_id: journalEntry.id,
                  account_code: '1500.1',
                  account_name: 'Accumulated Depreciation - Dairy Cows',
                  description: 'Monthly depreciation of dairy cows',
                  debit_amount: 0,
                  credit_amount: totalMonthlyDepreciation,
                  line_type: 'credit'
                }
              ];

              const { error: linesError } = await supabase
                .from('stored_journal_lines')
                .insert(journalLines);

              if (linesError) throw linesError;

              console.log(`Created depreciation entry: ${formatCurrency(totalMonthlyDepreciation)}`);
              totalJournalEntriesCreated++;
            }
          }
        }

        // Process Disposition Entries (if not already created)
        if (!hasDispositionEntry) {
          console.log(`Checking dispositions for ${company.name}`);
          
          const startDate = new Date(prevYear, prevMonth - 1, 1);
          const endDate = new Date(prevYear, prevMonth, 0);
          
          // Fetch dispositions for the month
          const { data: dispositions, error: dispositionsError } = await supabase
            .from('cow_dispositions')
            .select('*')
            .eq('company_id', company.id)
            .gte('disposition_date', startDate.toISOString().split('T')[0])
            .lte('disposition_date', endDate.toISOString().split('T')[0]);

          if (dispositionsError) throw dispositionsError;

          if (dispositions && dispositions.length > 0) {
            console.log(`Found ${dispositions.length} dispositions`);

            // Fetch cow data for dispositions
            const cowTagNumbers = dispositions.map(d => d.cow_id);
            const { data: dispositionCows, error: cowError } = await supabase
              .from('cows')
              .select('*')
              .in('tag_number', cowTagNumbers);

            if (cowError) throw cowError;

            let totalDispositionAmount = 0;
            const allJournalLines: any[] = [];

            // Process each disposition
            dispositions.forEach((disposition: Disposition) => {
              const cow = dispositionCows?.find(c => c.tag_number === disposition.cow_id);
              if (!cow) return;

              // Calculate proper accumulated depreciation
              let accumulatedDepreciation = cow.total_depreciation || 0;
              if (accumulatedDepreciation === 0) {
                const monthlyDepreciation = calculateMonthlyDepreciation(cow, new Date(disposition.disposition_date));
                const monthsSinceStart = getMonthsSinceStart(new Date(cow.freshen_date), new Date(disposition.disposition_date));
                accumulatedDepreciation = monthlyDepreciation * monthsSinceStart;
              }

              const bookValue = Math.max(cow.salvage_value, cow.purchase_price - accumulatedDepreciation);
              const actualGainLoss = (disposition.sale_amount || 0) - bookValue;

              totalDispositionAmount += Math.max(disposition.sale_amount || 0, cow.purchase_price);

              // Cash entry (if sale)
              if (disposition.disposition_type === 'sale' && disposition.sale_amount > 0) {
                allJournalLines.push({
                  account_code: '1000',
                  account_name: 'Cash',
                  description: `Cash received from sale of cow #${cow.tag_number}`,
                  debit_amount: disposition.sale_amount,
                  credit_amount: 0,
                  line_type: 'debit'
                });
              }

              // Accumulated Depreciation removal
              allJournalLines.push({
                account_code: '1500.1',
                account_name: 'Accumulated Depreciation - Dairy Cows',
                description: `Remove accumulated depreciation for cow #${cow.tag_number}`,
                debit_amount: accumulatedDepreciation,
                credit_amount: 0,
                line_type: 'debit'
              });

              // Asset removal
              allJournalLines.push({
                account_code: '1500',
                account_name: 'Dairy Cows',
                description: `Remove cow asset #${cow.tag_number}`,
                debit_amount: 0,
                credit_amount: cow.purchase_price,
                line_type: 'credit'
              });

              // Gain or Loss
              if (actualGainLoss !== 0) {
                const isGain = actualGainLoss > 0;
                allJournalLines.push({
                  account_code: isGain ? '8000' : '9000',
                  account_name: isGain ? 'Gain on Sale of Assets' : 'Loss on Sale of Assets',
                  description: `${isGain ? 'Gain' : 'Loss'} on ${disposition.disposition_type} of cow #${cow.tag_number}`,
                  debit_amount: isGain ? 0 : Math.abs(actualGainLoss),
                  credit_amount: isGain ? actualGainLoss : 0,
                  line_type: isGain ? 'credit' : 'debit'
                });
              }
            });

            if (allJournalLines.length > 0) {
              // Create disposition journal entry
              const { data: journalEntry, error: journalError } = await supabase
                .from('stored_journal_entries')
                .insert({
                  company_id: company.id,
                  entry_date: new Date(prevYear, prevMonth - 1, 1),
                  month: prevMonth,
                  year: prevYear,
                  entry_type: 'disposition',
                  description: `Cow Dispositions - ${getMonthName(prevMonth)} ${prevYear}`,
                  total_amount: totalDispositionAmount,
                  status: 'posted'
                })
                .select('id')
                .single();

              if (journalError) throw journalError;

              // Add journal_entry_id to all lines
              const journalLinesToInsert = allJournalLines.map(line => ({
                ...line,
                journal_entry_id: journalEntry.id
              }));

              const { error: linesError } = await supabase
                .from('stored_journal_lines')
                .insert(journalLinesToInsert);

              if (linesError) throw linesError;

              console.log(`Created disposition entry: ${formatCurrency(totalDispositionAmount)}`);
              totalJournalEntriesCreated++;
            }
          }
        }

        totalCompaniesProcessed++;
      } catch (companyError) {
        console.error(`Error processing company ${company.name}:`, companyError);
        // Continue with next company
      }
    }

    console.log(`Monthly processing complete: ${totalCompaniesProcessed} companies, ${totalJournalEntriesCreated} journal entries created`);

    return new Response(
      JSON.stringify({
        success: true,
        month: prevMonth,
        year: prevYear,
        companiesProcessed: totalCompaniesProcessed,
        journalEntriesCreated: totalJournalEntriesCreated,
        message: `Monthly journal entries processed for ${getMonthName(prevMonth)} ${prevYear}`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in monthly processing:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process monthly journal entries', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});