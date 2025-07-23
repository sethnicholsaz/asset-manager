import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CheckCircle, Search } from 'lucide-react';

interface JournalEntryBalance {
  id: string;
  entryDate: string;
  description: string;
  entryType: string;
  totalDebits: number;
  totalCredits: number;
  difference: number;
  isBalanced: boolean;
}

export function JournalIntegrityCheck() {
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [journalEntries, setJournalEntries] = useState<JournalEntryBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<{
    totalEntries: number;
    balancedEntries: number;
    unbalancedEntries: number;
    totalDifference: number;
  } | null>(null);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  const checkJournalIntegrity = async () => {
    if (!currentCompany) {
      toast({
        title: "Error",
        description: "No company selected",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log(`Checking journal integrity for ${month}/${year}, company: ${currentCompany.id}`);

      // Fetch journal entries with their lines
      const { data: journalEntries, error: entriesError } = await supabase
        .from('journal_entries')
        .select(`
          id,
          entry_date,
          description,
          entry_type,
          total_amount,
          journal_lines (
            debit_amount,
            credit_amount
          )
        `)
        .eq('company_id', currentCompany.id)
        .eq('month', month)
        .eq('year', year)
        .order('entry_date');

      if (entriesError) {
        console.error('Error fetching journal entries:', entriesError);
        throw entriesError;
      }

      console.log(`Found ${journalEntries?.length || 0} journal entries to check`);

      const entryBalances: JournalEntryBalance[] = [];
      let totalUnbalanced = 0;

      journalEntries?.forEach(entry => {
        const lines = entry.journal_lines || [];
        const totalDebits = lines.reduce((sum: number, line: any) => sum + (line.debit_amount || 0), 0);
        const totalCredits = lines.reduce((sum: number, line: any) => sum + (line.credit_amount || 0), 0);
        const difference = Math.abs(totalDebits - totalCredits);
        const isBalanced = difference < 0.01; // Allow for small rounding differences

        if (!isBalanced) {
          totalUnbalanced += difference;
        }

        entryBalances.push({
          id: entry.id,
          entryDate: entry.entry_date,
          description: entry.description,
          entryType: entry.entry_type,
          totalDebits,
          totalCredits,
          difference,
          isBalanced
        });
      });

      setJournalEntries(entryBalances);
      setSummary({
        totalEntries: entryBalances.length,
        balancedEntries: entryBalances.filter(e => e.isBalanced).length,
        unbalancedEntries: entryBalances.filter(e => !e.isBalanced).length,
        totalDifference: totalUnbalanced
      });

      toast({
        title: "Integrity Check Complete",
        description: `Found ${entryBalances.filter(e => !e.isBalanced).length} unbalanced entries out of ${entryBalances.length} total`,
        variant: entryBalances.filter(e => !e.isBalanced).length > 0 ? "destructive" : "default",
      });

    } catch (error) {
      console.error('Error checking journal integrity:', error);
      toast({
        title: "Error",
        description: "Failed to check journal integrity",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Journal Entry Integrity Check
          </CardTitle>
          <CardDescription>
            Verify that all journal entries have balanced debits and credits
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            onClick={checkJournalIntegrity} 
            disabled={isLoading || !currentCompany}
            className="flex items-center gap-2"
          >
            {isLoading ? 'Checking...' : 'Check Journal Integrity'}
          </Button>
        </CardContent>
      </Card>

      {summary && (
        <Alert className={summary.unbalancedEntries > 0 ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
          <div className="flex items-center gap-2">
            {summary.unbalancedEntries > 0 ? (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-600" />
            )}
            <div className="flex-1">
              <AlertDescription className="text-sm">
                <strong>Summary for {month}/{year}:</strong> {summary.balancedEntries} balanced entries, 
                <strong className="text-red-600"> {summary.unbalancedEntries} unbalanced entries</strong>
                {summary.unbalancedEntries > 0 && (
                  <span> with total difference of {formatCurrency(summary.totalDifference)}</span>
                )}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      {journalEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Journal Entry Balance Check</CardTitle>
            <CardDescription>
              Review each journal entry for balance issues
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Total Debits</TableHead>
                    <TableHead className="text-right">Total Credits</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journalEntries.map((entry) => (
                    <TableRow 
                      key={entry.id}
                      className={!entry.isBalanced ? "bg-red-50 border-red-200" : ""}
                    >
                      <TableCell>{formatDate(entry.entryDate)}</TableCell>
                      <TableCell className="capitalize">{entry.entryType}</TableCell>
                      <TableCell className="max-w-xs truncate">{entry.description}</TableCell>
                      <TableCell className="text-right">{formatCurrency(entry.totalDebits)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(entry.totalCredits)}</TableCell>
                      <TableCell className="text-right">
                        {entry.difference > 0.01 ? (
                          <span className="text-red-600 font-medium">
                            {formatCurrency(entry.difference)}
                          </span>
                        ) : (
                          <span className="text-green-600">$0.00</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {entry.isBalanced ? (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-sm">Balanced</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-sm">Unbalanced</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}