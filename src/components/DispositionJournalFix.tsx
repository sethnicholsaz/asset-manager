import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export function DispositionJournalFix() {
  console.log('🔧 DispositionJournalFix component is rendering');
  const [month, setMonth] = useState<number>(5);
  const [year, setYear] = useState<number>(2025);
  const [isFixing, setIsFixing] = useState(false);
  const [fixResults, setFixResults] = useState<{
    total: number;
    fixed: number;
    errors: string[];
  } | null>(null);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  const fixDispositionJournals = async () => {
    console.log('🔧 DispositionJournalFix button clicked');
    console.log('🔧 Current company:', currentCompany);
    console.log('🔧 Month/Year:', { month, year });
    
    if (!currentCompany) {
      console.log('❌ No company selected');
      toast({
        title: "Error",
        description: "No company selected",
        variant: "destructive",
      });
      return;
    }

    setIsFixing(true);
    setFixResults(null);

    try {
      console.log(`🔧 Fixing disposition journals for ${month}/${year}, company: ${currentCompany.id}`);

      // Find all disposition journal entries that are unbalanced
      const { data: journalEntries, error: entriesError } = await supabase
        .from('journal_entries')
        .select(`
          id,
          description,
          journal_lines (
            id,
            debit_amount,
            credit_amount
          )
        `)
        .eq('company_id', currentCompany.id)
        .eq('month', month)
        .eq('year', year)
        .eq('entry_type', 'disposition');

      if (entriesError) {
        console.error('Error fetching disposition entries:', entriesError);
        throw entriesError;
      }

      console.log(`Found ${journalEntries?.length || 0} disposition journal entries`);

      // Filter to unbalanced entries
      const unbalancedEntries = journalEntries?.filter(entry => {
        const lines = entry.journal_lines || [];
        const totalDebits = lines.reduce((sum: number, line: any) => sum + (line.debit_amount || 0), 0);
        const totalCredits = lines.reduce((sum: number, line: any) => sum + (line.credit_amount || 0), 0);
        const difference = Math.abs(totalDebits - totalCredits);
        return difference > 0.01; // Unbalanced
      }) || [];

      console.log(`Found ${unbalancedEntries.length} unbalanced disposition entries`);

      const results = {
        total: unbalancedEntries.length,
        fixed: 0,
        errors: [] as string[]
      };

      // Process each unbalanced entry
      for (const entry of unbalancedEntries) {
        try {
          console.log(`Fixing journal entry: ${entry.description}`);

          // Extract cow tag from description
          const cowMatch = entry.description.match(/Cow #(\w+)/);
          if (!cowMatch) {
            results.errors.push(`Could not extract cow tag from: ${entry.description}`);
            continue;
          }
          const cowTag = cowMatch[1];

          // Get disposition data
          const { data: dispositionData, error: dispError } = await supabase
            .from('cow_dispositions')
            .select(`
              id,
              cow_id,
              sale_amount,
              final_book_value,
              gain_loss,
              disposition_type
            `)
            .eq('company_id', currentCompany.id)
            .eq('cow_id', cowTag)
            .maybeSingle();

          if (dispError || !dispositionData) {
            results.errors.push(`Could not find disposition for cow ${cowTag}`);
            continue;
          }

          // Get cow data for purchase price and accumulated depreciation
          const { data: cowData, error: cowError } = await supabase
            .from('cows')
            .select('purchase_price, total_depreciation')
            .eq('tag_number', cowTag)
            .eq('company_id', currentCompany.id)
            .maybeSingle();

          if (cowError || !cowData) {
            results.errors.push(`Could not find cow data for ${cowTag}`);
            continue;
          }

          // Delete existing journal lines
          const { error: deleteError } = await supabase
            .from('journal_lines')
            .delete()
            .eq('journal_entry_id', entry.id);

          if (deleteError) {
            results.errors.push(`Failed to delete lines for ${cowTag}: ${deleteError.message}`);
            continue;
          }

          // Create correct journal lines
          const newLines = [];

          // 1. Cash received (debit) - only if sale amount > 0
          if (dispositionData.sale_amount > 0) {
            newLines.push({
              journal_entry_id: entry.id,
              account_code: '1000',
              account_name: 'Cash',
              description: `Cash received from sale - Cow #${cowTag}`,
              debit_amount: dispositionData.sale_amount,
              credit_amount: 0,
              line_type: 'debit',
              cow_id: cowTag
            });
          }

          // 2. Remove accumulated depreciation (debit) - only if depreciation > 0
          if (cowData.total_depreciation > 0) {
            newLines.push({
              journal_entry_id: entry.id,
              account_code: '1500.1',
              account_name: 'Accumulated Depreciation - Dairy Cows',
              description: `Remove accumulated depreciation - Cow #${cowTag}`,
              debit_amount: cowData.total_depreciation,
              credit_amount: 0,
              line_type: 'debit',
              cow_id: cowTag
            });
          }

          // 3. Remove original asset (credit)
          newLines.push({
            journal_entry_id: entry.id,
            account_code: '1500',
            account_name: 'Dairy Cows',
            description: `Remove asset - Cow #${cowTag}`,
            debit_amount: 0,
            credit_amount: cowData.purchase_price,
            line_type: 'credit',
            cow_id: cowTag
          });

          // 4. Calculate and record gain/loss
          const totalDebits = newLines.reduce((sum, line) => sum + line.debit_amount, 0);
          const totalCredits = newLines.reduce((sum, line) => sum + line.credit_amount, 0);
          const gainLoss = totalDebits - totalCredits;

          if (Math.abs(gainLoss) > 0.01) {
            if (gainLoss > 0) {
              // Loss on disposal (debit)
              newLines.push({
                journal_entry_id: entry.id,
                account_code: '7000',
                account_name: 'Loss on Asset Disposal',
                description: `Loss on disposal - Cow #${cowTag}`,
                debit_amount: gainLoss,
                credit_amount: 0,
                line_type: 'debit',
                cow_id: cowTag
              });
            } else {
              // Gain on disposal (credit)
              newLines.push({
                journal_entry_id: entry.id,
                account_code: '8000',
                account_name: 'Gain on Asset Disposal',
                description: `Gain on disposal - Cow #${cowTag}`,
                debit_amount: 0,
                credit_amount: Math.abs(gainLoss),
                line_type: 'credit',
                cow_id: cowTag
              });
            }
          }

          // Insert new journal lines
          const { error: insertError } = await supabase
            .from('journal_lines')
            .insert(newLines);

          if (insertError) {
            results.errors.push(`Failed to create lines for ${cowTag}: ${insertError.message}`);
            continue;
          }

          // Update journal entry total amount
          const newTotal = Math.max(
            newLines.reduce((sum, line) => sum + line.debit_amount, 0),
            newLines.reduce((sum, line) => sum + line.credit_amount, 0)
          );

          const { error: updateError } = await supabase
            .from('journal_entries')
            .update({ total_amount: newTotal })
            .eq('id', entry.id);

          if (updateError) {
            results.errors.push(`Failed to update total for ${cowTag}: ${updateError.message}`);
            continue;
          }

          results.fixed++;
          console.log(`Fixed journal entry for cow ${cowTag}`);

        } catch (error) {
          console.error(`Error fixing entry ${entry.id}:`, error);
          results.errors.push(`Error fixing entry: ${error.message}`);
        }
      }

      setFixResults(results);

      toast({
        title: "Disposition Fix Complete",
        description: `Fixed ${results.fixed} out of ${results.total} problematic disposition entries`,
        variant: results.errors.length > 0 ? "destructive" : "default",
      });

    } catch (error) {
      console.error('Error fixing disposition journals:', error);
      toast({
        title: "Error",
        description: "Failed to fix disposition journal entries",
        variant: "destructive",
      });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Disposition Journal Fix
          </CardTitle>
          <CardDescription>
            Fix unbalanced disposition journal entries that are missing accumulated depreciation lines
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription>
              <strong>What this fixes:</strong> Disposition journal entries that are unbalanced because 
              they're missing the accumulated depreciation removal line or have incorrect gain/loss calculations.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="month">Month</Label>
              <Input
                id="month"
                type="number"
                min="1"
                max="12"
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                placeholder="Month (1-12)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                min="2020"
                max="2030"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                placeholder="Year"
              />
            </div>
          </div>
          
          <Button 
            onClick={() => {
              console.log('🔧 Button clicked - before calling fixDispositionJournals');
              fixDispositionJournals();
            }} 
            disabled={isFixing || !currentCompany}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isFixing ? 'animate-spin' : ''}`} />
            {isFixing ? 'Fixing Disposition Journals...' : 'Fix Disposition Journals'}
          </Button>
        </CardContent>
      </Card>

      {fixResults && (
        <Card>
          <CardHeader>
            <CardTitle>Fix Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p><strong>Total Problematic Entries:</strong> {fixResults.total}</p>
              <p><strong>Successfully Fixed:</strong> {fixResults.fixed}</p>
              <p><strong>Errors:</strong> {fixResults.errors.length}</p>
              
              {fixResults.errors.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Errors:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-red-600">
                    {fixResults.errors.slice(0, 10).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                    {fixResults.errors.length > 10 && (
                      <li>... and {fixResults.errors.length - 10} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}