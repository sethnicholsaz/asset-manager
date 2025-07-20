import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

interface BalanceAdjustment {
  id: string;
  adjustment_amount: number;
  description: string;
  cow_tag?: string;
  adjustment_type: string;
  prior_period_month: number;
  prior_period_year: number;
}

interface DepreciationEntry {
  id: string;
  cowId: string;
  month: number;
  year: number;
  depreciationAmount: number;
  accumulatedDepreciation: number;
  bookValue: number;
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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { month, year, companyId } = await req.json();
    
    if (!month || !year || !companyId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: month, year, companyId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`Generating depreciation report for company ${companyId}, ${month}/${year}`);

    // Fetch all cows for the company using pagination to ensure we get all records
    let allCows: Cow[] = [];
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data: cows, error: cowsError } = await supabase
        .from('cows')
        .select('*')
        .eq('company_id', companyId)
        .order('tag_number')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (cowsError) {
        console.error('Error fetching cows:', cowsError);
        throw cowsError;
      }

      if (!cows || cows.length === 0) break;
      
      allCows = allCows.concat(cows);
      console.log(`Fetched page ${page + 1}: ${cows.length} cows, total so far: ${allCows.length}`);
      
      if (cows.length < pageSize) break; // Last page
      page++;
    }

    console.log(`Fetched ${allCows.length} total cows`);

    // Filter active cows that should be included in the report
    const currentDate = new Date(year, month - 1, 1);
    const activeCows = allCows.filter((cow: Cow) => 
      cow.status === 'active' && 
      new Date(cow.freshen_date) <= currentDate
    );

    console.log(`Filtered to ${activeCows.length} active cows for ${month}/${year}`);

    // Fetch balance adjustments
    const { data: balanceAdjustments, error: adjustmentsError } = await supabase
      .from('balance_adjustments')
      .select('*')
      .eq('company_id', companyId)
      .eq('applied_to_current_month', false);

    if (adjustmentsError) {
      console.error('Error fetching balance adjustments:', adjustmentsError);
      throw adjustmentsError;
    }

    // Calculate depreciation entries
    const depreciationEntries: DepreciationEntry[] = activeCows.map((cow: Cow) => {
      const monthlyDepreciation = calculateMonthlyDepreciation(cow, currentDate);
      const monthsSinceStart = getMonthsSinceStart(new Date(cow.freshen_date), currentDate);
      const totalDepreciation = monthlyDepreciation * (monthsSinceStart + 1);
      const bookValue = Math.max(cow.salvage_value, cow.purchase_price - totalDepreciation);

      return {
        id: `${cow.id}-${year}-${month}`,
        cowId: cow.id,
        month: month,
        year: year,
        depreciationAmount: monthlyDepreciation,
        accumulatedDepreciation: totalDepreciation,
        bookValue: bookValue,
      };
    });

    // Calculate totals
    const totalMonthlyDepreciation = depreciationEntries.reduce(
      (sum, entry) => sum + entry.depreciationAmount, 
      0
    );

    const totalBalanceAdjustments = (balanceAdjustments || []).reduce(
      (sum: number, adj: BalanceAdjustment) => sum + adj.adjustment_amount,
      0
    );

    // Generate journal entries
    const journalEntries = [];
    
    if (totalMonthlyDepreciation > 0) {
      const journalLines = [
        {
          id: `jl-debit-${year}-${month}`,
          journalEntryId: `je-${year}-${month}`,
          accountCode: '6100',
          accountName: 'Depreciation Expense',
          description: 'Monthly depreciation of dairy cows',
          debitAmount: totalMonthlyDepreciation,
          creditAmount: 0,
          lineType: 'debit',
          createdAt: new Date()
        },
        {
          id: `jl-credit-${year}-${month}`,
          journalEntryId: `je-${year}-${month}`,
          accountCode: '1500.1',
          accountName: 'Accumulated Depreciation - Dairy Cows',
          description: 'Monthly depreciation of dairy cows',
          debitAmount: 0,
          creditAmount: totalMonthlyDepreciation,
          lineType: 'credit',
          createdAt: new Date()
        }
      ];

      // Add balance adjustment entries if any exist
      if (balanceAdjustments && balanceAdjustments.length > 0) {
        balanceAdjustments.forEach((adjustment: BalanceAdjustment, index: number) => {
          const isDebit = adjustment.adjustment_amount > 0;
          const adjustmentDescription = `Prior period adjustment: ${adjustment.description}${adjustment.cow_tag ? ` (Cow #${adjustment.cow_tag})` : ''}`;
          
          journalLines.push({
            id: `jl-adjustment-${index}-${year}-${month}`,
            journalEntryId: `je-${year}-${month}`,
            accountCode: '1500.1',
            accountName: 'Accumulated Depreciation - Dairy Cows',
            description: adjustmentDescription,
            debitAmount: isDebit ? Math.abs(adjustment.adjustment_amount) : 0,
            creditAmount: isDebit ? 0 : Math.abs(adjustment.adjustment_amount),
            lineType: isDebit ? 'debit' : 'credit',
            createdAt: new Date()
          });

          journalLines.push({
            id: `jl-adjustment-balance-${index}-${year}-${month}`,
            journalEntryId: `je-${year}-${month}`,
            accountCode: '6100',
            accountName: 'Depreciation Expense',
            description: `Balancing entry: ${adjustmentDescription}`,
            debitAmount: isDebit ? 0 : Math.abs(adjustment.adjustment_amount),
            creditAmount: isDebit ? Math.abs(adjustment.adjustment_amount) : 0,
            lineType: isDebit ? 'credit' : 'debit',
            createdAt: new Date()
          });
        });
      }

      const totalJournalAmount = totalMonthlyDepreciation + Math.abs(totalBalanceAdjustments);
      const monthName = new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' });

      journalEntries.push({
        id: `je-${year}-${month}`,
        entryDate: new Date(year, month - 1, 1),
        description: `Dairy Cow Depreciation${balanceAdjustments && balanceAdjustments.length > 0 ? ' with Prior Period Adjustments' : ''} - ${monthName} ${year}`,
        totalAmount: totalJournalAmount,
        entryType: 'depreciation',
        lines: journalLines,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Prepare response data
    const responseData = {
      summary: {
        activeCows: activeCows.length,
        totalMonthlyDepreciation,
        totalBalanceAdjustments,
        journalEntries: journalEntries.length
      },
      depreciationEntries: depreciationEntries.map(entry => {
        const cow = activeCows.find((c: Cow) => c.id === entry.cowId);
        return {
          ...entry,
          cow: {
            tagNumber: cow?.tag_number,
            purchasePrice: cow?.purchase_price
          }
        };
      }),
      journalEntries,
      balanceAdjustments: balanceAdjustments || []
    };

    console.log(`Report generated successfully: ${activeCows.length} active cows, ${formatCurrency(totalMonthlyDepreciation)} monthly depreciation`);

    return new Response(
      JSON.stringify(responseData),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error generating depreciation report:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate depreciation report', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});