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
import { DispositionJournalFix } from '@/components/DispositionJournalFix';
import { AlertTriangle, Trash2, RefreshCw } from 'lucide-react';

interface ProblemJournalEntry {
  id: string;
  entryDate: string;
  description: string;
  entryType: string;
  totalAmount: number;
  linesCount: number;
  totalDebits: number;
  totalCredits: number;
  difference: number;
}

export function JournalRepairTool() {
  const [month, setMonth] = useState<number>(5);
  const [year, setYear] = useState<number>(2025);
  const [problemEntries, setProblemEntries] = useState<ProblemJournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  const findProblemEntries = async () => {
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
      console.log(`Finding problem entries for ${month}/${year}, company: ${currentCompany.id}`);

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
            id,
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

      console.log(`Analyzing ${journalEntries?.length || 0} journal entries`);

      const problems: ProblemJournalEntry[] = [];

      journalEntries?.forEach(entry => {
        const lines = entry.journal_lines || [];
        const totalDebits = lines.reduce((sum: number, line: any) => sum + (line.debit_amount || 0), 0);
        const totalCredits = lines.reduce((sum: number, line: any) => sum + (line.credit_amount || 0), 0);
        const difference = Math.abs(totalDebits - totalCredits);
        const isBalanced = difference < 0.01;

        if (!isBalanced) {
          problems.push({
            id: entry.id,
            entryDate: entry.entry_date,
            description: entry.description,
            entryType: entry.entry_type,
            totalAmount: entry.total_amount,
            linesCount: lines.length,
            totalDebits,
            totalCredits,
            difference
          });
        }
      });

      // Sort by difference (worst first)
      problems.sort((a, b) => b.difference - a.difference);
      setProblemEntries(problems);

      console.log(`Found ${problems.length} problematic entries`);
      console.log('Entry types breakdown:', problems.reduce((acc: any, entry) => {
        acc[entry.entryType] = (acc[entry.entryType] || 0) + 1;
        return acc;
      }, {}));

      toast({
        title: "Analysis Complete",
        description: `Found ${problems.length} problematic journal entries`,
        variant: "destructive",
      });

    } catch (error) {
      console.error('Error finding problem entries:', error);
      toast({
        title: "Error",
        description: "Failed to analyze journal entries",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteOrphanedEntries = async () => {
    if (!currentCompany) return;

    setIsRepairing(true);
    try {
      console.log('Starting to delete orphaned journal entries...');

      // Find entries with 0 or 1 lines (incomplete entries)
      const orphanedEntries = problemEntries.filter(entry => entry.linesCount <= 1);
      
      if (orphanedEntries.length === 0) {
        toast({
          title: "No Orphaned Entries",
          description: "No journal entries with missing lines found",
        });
        setIsRepairing(false);
        return;
      }

      let deletedCount = 0;
      for (const entry of orphanedEntries) {
        try {
          // Delete journal lines first
          const { error: linesError } = await supabase
            .from('journal_lines')
            .delete()
            .eq('journal_entry_id', entry.id);

          if (linesError) {
            console.error(`Error deleting lines for entry ${entry.id}:`, linesError);
            continue;
          }

          // Delete journal entry
          const { error: entryError } = await supabase
            .from('journal_entries')
            .delete()
            .eq('id', entry.id)
            .eq('company_id', currentCompany.id);

          if (entryError) {
            console.error(`Error deleting entry ${entry.id}:`, entryError);
            continue;
          }

          deletedCount++;
          console.log(`Deleted orphaned entry: ${entry.description}`);
        } catch (error) {
          console.error(`Failed to delete entry ${entry.id}:`, error);
        }
      }

      toast({
        title: "Cleanup Complete",
        description: `Deleted ${deletedCount} orphaned journal entries`,
      });

      // Refresh the problem entries list
      await findProblemEntries();

    } catch (error) {
      console.error('Error during cleanup:', error);
      toast({
        title: "Error",
        description: "Failed to delete orphaned entries",
        variant: "destructive",
      });
    } finally {
      setIsRepairing(false);
    }
  };

  const regenerateDepreciationEntries = async () => {
    if (!currentCompany) return;

    setIsRepairing(true);
    try {
      console.log('Regenerating depreciation entries...');

      // Find depreciation entries that are problematic
      const depreciationProblems = problemEntries.filter(entry => entry.entryType === 'depreciation');
      
      if (depreciationProblems.length === 0) {
        toast({
          title: "No Depreciation Issues",
          description: "No problematic depreciation entries found",
        });
        setIsRepairing(false);
        return;
      }

      // Delete existing problematic depreciation entries
      for (const entry of depreciationProblems) {
        // Delete journal lines first
        await supabase
          .from('journal_lines')
          .delete()
          .eq('journal_entry_id', entry.id);

        // Delete journal entry
        await supabase
          .from('journal_entries')
          .delete()
          .eq('id', entry.id)
          .eq('company_id', currentCompany.id);
      }

      // Call the monthly depreciation processor to regenerate
      const { data, error } = await supabase.functions.invoke('monthly-journal-processor', {
        body: {
          companyId: currentCompany.id,
          month: month,
          year: year,
          entryType: 'depreciation'
        }
      });

      if (error) {
        console.error('Error regenerating depreciation:', error);
        throw error;
      }

      console.log('Depreciation regeneration result:', data);

      toast({
        title: "Depreciation Regenerated",
        description: `Regenerated depreciation entries for ${month}/${year}`,
      });

      // Refresh the problem entries list
      await findProblemEntries();

    } catch (error) {
      console.error('Error regenerating depreciation:', error);
      toast({
        title: "Error",
        description: "Failed to regenerate depreciation entries",
        variant: "destructive",
      });
    } finally {
      setIsRepairing(false);
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

  // Group entries by type for summary
  const entryTypeSummary = problemEntries.reduce((acc: any, entry) => {
    if (!acc[entry.entryType]) {
      acc[entry.entryType] = { count: 0, totalDifference: 0 };
    }
    acc[entry.entryType].count++;
    acc[entry.entryType].totalDifference += entry.difference;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Disposition Journal Fix - Show first since all problems are disposition entries */}
      {(() => {
        console.log('🔧 About to render DispositionJournalFix component');
        return <DispositionJournalFix />;
      })()}
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Journal Entry Repair Tool
          </CardTitle>
          <CardDescription>
            Find and fix problematic journal entries that don't balance
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
          
          <div className="flex gap-2 flex-wrap">
            <Button 
              onClick={findProblemEntries} 
              disabled={isLoading || !currentCompany}
              className="flex items-center gap-2"
            >
              {isLoading ? 'Analyzing...' : 'Find Problem Entries'}
            </Button>
            
            {problemEntries.length > 0 && (
              <>
                <Button 
                  variant="destructive"
                  onClick={deleteOrphanedEntries}
                  disabled={isRepairing}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {isRepairing ? 'Deleting...' : 'Delete Orphaned Entries'}
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={regenerateDepreciationEntries}
                  disabled={isRepairing}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  {isRepairing ? 'Regenerating...' : 'Regenerate Depreciation'}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {Object.keys(entryTypeSummary).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Problem Summary by Entry Type</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry Type</TableHead>
                  <TableHead className="text-right">Problem Count</TableHead>
                  <TableHead className="text-right">Total Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(entryTypeSummary).map(([type, summary]: [string, any]) => (
                  <TableRow key={type}>
                    <TableCell className="capitalize">{type}</TableCell>
                    <TableCell className="text-right">{summary.count}</TableCell>
                    <TableCell className="text-right text-red-600">
                      {formatCurrency(summary.totalDifference)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {problemEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Problematic Journal Entries</CardTitle>
            <CardDescription>
              Showing {problemEntries.length} unbalanced entries (worst first)
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
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Debits</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {problemEntries.slice(0, 50).map((entry) => (
                    <TableRow key={entry.id} className="bg-red-50 border-red-200">
                      <TableCell>{formatDate(entry.entryDate)}</TableCell>
                      <TableCell className="capitalize">{entry.entryType}</TableCell>
                      <TableCell className="max-w-xs truncate">{entry.description}</TableCell>
                      <TableCell className="text-right">{entry.linesCount}</TableCell>
                      <TableCell className="text-right">{formatCurrency(entry.totalDebits)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(entry.totalCredits)}</TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {formatCurrency(entry.difference)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {problemEntries.length > 50 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Showing first 50 of {problemEntries.length} problematic entries
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}