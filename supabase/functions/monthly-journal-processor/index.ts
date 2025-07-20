import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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

function calculateMonthlyDepreciation(cow: Cow, currentDate: Date): number {
  const depreciableAmount = cow.purchase_price - cow.salvage_value;
  const depreciationYears = 5; // Standard 5-year depreciation for dairy cows
  
  // Straight-line depreciation
  return depreciableAmount / (depreciationYears * 12);
}

function getMonthsSinceStart(startDate: Date, currentDate: Date): number {
  const yearDiff = currentDate.getFullYear() - startDate.getFullYear();
  const monthDiff = currentDate.getMonth() - startDate.getMonth();
  return yearDiff * 12 + monthDiff;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function getMonthName(month: number): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1];
}

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

    // Process starting from July 2025 (for historical catch-up processing)
    const now = new Date();
    const targetMonth = 7; // July
    const targetYear = 2025;

    console.log(`Processing monthly journal entries for ${getMonthName(targetMonth)} ${targetYear}`);

    // Fetch all companies
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name');

    console.log(`Found ${companies?.length || 0} companies to process`);
    
    if (companiesError) throw companiesError;

    let totalCompaniesProcessed = 0;
    let totalJournalEntriesCreated = 0;

    for (const company of companies) {
      console.log(`Processing company: ${company.name} (${company.id})`);

      try {
        // Check for existing POSTED entries for this month (draft entries will be replaced)
        const { data: existingEntries } = await supabase
          .from('stored_journal_entries')
          .select('entry_type, status')
          .eq('company_id', company.id)
          .eq('month', targetMonth)
          .eq('year', targetYear)
          .eq('status', 'posted');

        console.log(`Found ${existingEntries?.length || 0} existing posted entries for ${company.name}`);

        const hasDepreciationEntry = existingEntries?.some(e => e.entry_type === 'depreciation');
        const hasDispositionEntry = existingEntries?.some(e => e.entry_type === 'disposition');
        const hasAcquisitionEntry = existingEntries?.some(e => e.entry_type === 'acquisition');

        // Delete any draft entries before creating new ones
        const { error: deleteDraftError } = await supabase
          .from('stored_journal_entries')
          .delete()
          .eq('company_id', company.id)
          .eq('month', targetMonth)
          .eq('year', targetYear)
          .eq('status', 'draft');

        if (deleteDraftError) {
          console.error('Error deleting draft entries:', deleteDraftError);
        } else {
          console.log('Deleted existing draft entries for regeneration');
        }

        // Process Depreciation Entries (if not already created)
        if (!hasDepreciationEntry) {
          console.log(`Creating depreciation entry for ${company.name}`);
          
          // Fetch all cows with pagination to avoid limits
          let allCows: any[] = [];
          let offset = 0;
          const limit = 1000;
          
          while (true) {
            const { data: cowBatch, error: cowsError } = await supabase
              .from('cows')
              .select('*')
              .eq('company_id', company.id)
              .range(offset, offset + limit - 1);

            if (cowsError) throw cowsError;
            
            if (!cowBatch || cowBatch.length === 0) break;
            
            allCows.push(...cowBatch);
            console.log(`Fetched ${cowBatch.length} cows (${offset} to ${offset + cowBatch.length - 1}), total so far: ${allCows.length}`);
            
            if (cowBatch.length < limit) break;
            offset += limit;
          }

          console.log(`Total cows fetched for company: ${allCows.length}`);

          // Include only active cows that have freshened by the end of the target month
          const reportDate = new Date(targetYear, targetMonth, 0); // Last day of target month
          const activeCows = allCows.filter((cow: any) => {
            const isActive = cow.status === 'active';
            const isFreshened = new Date(cow.freshen_date) <= reportDate;
            return isActive && isFreshened;
          });

          console.log(`Active cows freshened by ${reportDate.toISOString().split('T')[0]}: ${activeCows.length}`);

          if (activeCows && activeCows.length > 0) {
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
                  entry_date: new Date(targetYear, targetMonth - 1, 1),
                  month: targetMonth,
                  year: targetYear,
                  entry_type: 'depreciation',
                  description: `Dairy Cow Depreciation - ${getMonthName(targetMonth)} ${targetYear}`,
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
          
          const startDate = new Date(targetYear, targetMonth - 1, 1);
          const endDate = new Date(targetYear, targetMonth, 0);
          
          console.log(`Looking for dispositions between ${startDate.toISOString().split('T')[0]} and ${endDate.toISOString().split('T')[0]}`);
          
          // Fetch dispositions for the month
          const { data: dispositions, error: dispositionsError } = await supabase
            .from('cow_dispositions')
            .select('*')
            .eq('company_id', company.id)
            .gte('disposition_date', startDate.toISOString().split('T')[0])
            .lte('disposition_date', endDate.toISOString().split('T')[0]);

          if (dispositionsError) throw dispositionsError;

          console.log(`Found ${dispositions?.length || 0} dispositions for ${company.name}`);

          if (dispositions && dispositions.length > 0) {
            console.log(`Processing ${dispositions.length} dispositions`);

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
              const saleAmount = disposition.sale_amount || 0;
              const actualGainLoss = saleAmount - bookValue;

              totalDispositionAmount += Math.max(saleAmount, cow.purchase_price);

              // Cash entry (for sales with actual sale amount)
              if (disposition.disposition_type === 'sale' && saleAmount > 0) {
                allJournalLines.push({
                  account_code: '1000',
                  account_name: 'Cash',
                  description: `Cash received from sale of cow #${cow.tag_number}`,
                  debit_amount: saleAmount,
                  credit_amount: 0,
                  line_type: 'debit'
                });
              }

              // Accumulated Depreciation removal (write back) - for all dispositions
              if (accumulatedDepreciation > 0) {
                allJournalLines.push({
                  account_code: '1500.1',
                  account_name: 'Accumulated Depreciation - Dairy Cows',
                  description: `Remove accumulated depreciation for cow #${cow.tag_number} (${disposition.disposition_type})`,
                  debit_amount: accumulatedDepreciation,
                  credit_amount: 0,
                  line_type: 'debit'
                });
              }

              // Asset removal (take off books) - for all dispositions
              allJournalLines.push({
                account_code: '1500',
                account_name: 'Dairy Cows',
                description: `Remove cow asset #${cow.tag_number} - ${disposition.disposition_type}`,
                debit_amount: 0,
                credit_amount: cow.purchase_price,
                line_type: 'credit'
              });

              // Gain or Loss handling - for all dispositions
              // Always create a gain/loss entry to ensure the journal balances
              const isGain = actualGainLoss > 0;
              let accountCode = '9000'; // Default loss account
              let accountName = 'Loss on Sale of Assets';
              
              // Specific accounts based on disposition type
              if (disposition.disposition_type === 'death') {
                accountCode = '9001';
                accountName = 'Loss on Dead Cows';
              } else if (disposition.disposition_type === 'sale') {
                if (isGain) {
                  accountCode = '8000';
                  accountName = 'Gain on Sale of Cows';
                } else {
                  accountCode = '9002';
                  accountName = 'Loss on Sale of Cows';
                }
              } else if (disposition.disposition_type === 'culled') {
                accountCode = '9003';
                accountName = 'Loss on Culled Cows';
              }
              
              // Always create the gain/loss entry, even if amount is zero, to ensure balance
              allJournalLines.push({
                account_code: accountCode,
                account_name: accountName,
                description: `${isGain ? 'Gain' : 'Loss'} on ${disposition.disposition_type} of cow #${cow.tag_number} (Sale: ${formatCurrency(saleAmount)}, Book: ${formatCurrency(bookValue)})`,
                debit_amount: isGain ? 0 : Math.abs(actualGainLoss),
                credit_amount: isGain ? Math.abs(actualGainLoss) : 0,
                line_type: isGain ? 'credit' : 'debit'
              });
            });

            if (allJournalLines.length > 0) {
              // Create disposition journal entry
              const { data: journalEntry, error: journalError } = await supabase
                .from('stored_journal_entries')
                .insert({
                  company_id: company.id,
                  entry_date: new Date(targetYear, targetMonth - 1, 1),
                  month: targetMonth,
                  year: targetYear,
                  entry_type: 'disposition',
                  description: `Cow Dispositions - ${getMonthName(targetMonth)} ${targetYear}`,
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
      } catch (error) {
        console.error(`Error processing company ${company.name}:`, error);
      }
    }

    console.log(`Monthly processing complete: ${totalCompaniesProcessed} companies, ${totalJournalEntriesCreated} journal entries created`);

    return new Response(
      JSON.stringify({
        success: true,
        companiesProcessed: totalCompaniesProcessed,
        journalEntriesCreated: totalJournalEntriesCreated,
        period: `${getMonthName(targetMonth)} ${targetYear}`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in monthly journal processor:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});