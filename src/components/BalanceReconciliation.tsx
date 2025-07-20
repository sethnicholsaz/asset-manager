import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { DepreciationCalculator } from '@/utils/depreciation';

interface StoredJournalEntry {
  id: string;
  entry_date: string;
  month: number;
  year: number;
  entry_type: 'depreciation' | 'disposition';
  description: string;
  total_amount: number;
  status: 'draft' | 'posted' | 'exported';
  created_at: string;
}

interface BalanceCheck {
  month: number;
  year: number;
  activeCows: number;
  totalAssetValue: number;
  totalDepreciation: number;
  journalDepreciation: number;
  journalDispositions: number;
  isBalanced: boolean;
  discrepancies: string[];
}

export function BalanceReconciliation() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [journalEntries, setJournalEntries] = useState<StoredJournalEntry[]>([]);
  const [balanceChecks, setBalanceChecks] = useState<BalanceCheck[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentCompany) {
      fetchData();
    }
  }, [currentCompany, selectedYear]);

  const fetchData = async () => {
    if (!currentCompany) return;

    setIsLoading(true);
    try {
      // Fetch stored journal entries for the year
      const { data: entries, error: entriesError } = await supabase
        .from('stored_journal_entries')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('year', selectedYear)
        .order('month', { ascending: true });

      if (entriesError) throw entriesError;

      const transformedEntries: StoredJournalEntry[] = (entries || []).map(entry => ({
        id: entry.id,
        entry_date: entry.entry_date,
        month: entry.month,
        year: entry.year,
        entry_type: entry.entry_type as 'depreciation' | 'disposition',
        description: entry.description,
        total_amount: entry.total_amount,
        status: entry.status as 'draft' | 'posted' | 'exported',
        created_at: entry.created_at
      }));

      setJournalEntries(transformedEntries);

      // Generate balance checks for each month that has entries
      await generateBalanceChecks(transformedEntries);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load balance reconciliation data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateBalanceChecks = async (entries: StoredJournalEntry[]) => {
    const checks: BalanceCheck[] = [];
    const monthsWithEntries = [...new Set(entries.map(e => e.month))].sort();

    for (const month of monthsWithEntries) {
      try {
        // Get current cow data for this month with all required fields
        const reportDate = new Date(selectedYear, month, 0); // Last day of month
        
        const { data: cowData, error: cowError } = await supabase
          .from('cows')
          .select('status, purchase_price, current_value, total_depreciation, freshen_date, salvage_value, tag_number')
          .eq('company_id', currentCompany.id);

        if (cowError) throw cowError;

        // Filter active cows for this month
        const activeCows = (cowData || []).filter(cow => 
          cow.status === 'active' && 
          new Date(cow.freshen_date) <= reportDate
        );

        const totalAssetValue = activeCows.reduce((sum, cow) => sum + cow.purchase_price, 0);
        const totalDepreciation = activeCows.reduce((sum, cow) => sum + (cow.total_depreciation || 0), 0);

        // Get journal entry amounts for this month
        const monthEntries = entries.filter(e => e.month === month);
        const journalDepreciation = monthEntries
          .filter(e => e.entry_type === 'depreciation')
          .reduce((sum, e) => sum + e.total_amount, 0);
        const journalDispositions = monthEntries
          .filter(e => e.entry_type === 'disposition')
          .reduce((sum, e) => sum + e.total_amount, 0);

        // Check for discrepancies using the same calculation as the journal processor
        const discrepancies: string[] = [];
        
        // Calculate expected depreciation using the same logic as journal processor
        let expectedDepreciation = 0;
        activeCows.forEach(cow => {
          const depreciableAmount = cow.purchase_price - cow.salvage_value;
          const depreciationYears = 5; // Same as journal processor
          const monthlyDepreciation = depreciableAmount / (depreciationYears * 12);
          expectedDepreciation += Math.max(0, monthlyDepreciation);
        });

        const depreciationVariance = Math.abs(journalDepreciation - expectedDepreciation);
        if (depreciationVariance > 1) { // Allow $1 rounding difference
          discrepancies.push(`Depreciation variance: ${DepreciationCalculator.formatCurrency(depreciationVariance)}`);
        }

        const isBalanced = discrepancies.length === 0;

        checks.push({
          month,
          year: selectedYear,
          activeCows: activeCows.length,
          totalAssetValue,
          totalDepreciation,
          journalDepreciation,
          journalDispositions,
          isBalanced,
          discrepancies
        });

      } catch (error) {
        console.error(`Error checking balance for month ${month}:`, error);
      }
    }

    setBalanceChecks(checks);
  };

  const runMonthlyProcessing = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke('monthly-journal-processor', {
        body: { manual: true }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Monthly processing completed: ${data.journalEntriesCreated} entries created`,
      });

      // Refresh data
      await fetchData();

    } catch (error) {
      console.error('Error running monthly processing:', error);
      toast({
        title: "Error",
        description: "Failed to run monthly processing",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getMonthName = (month: number): string => {
    return new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { variant: 'secondary' as const, label: 'Draft' },
      posted: { variant: 'default' as const, label: 'Posted' },
      exported: { variant: 'outline' as const, label: 'Exported' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const years = Array.from({ length: 5 }, (_, i) => {
    const year = new Date().getFullYear() - 2 + i;
    return { value: year, label: year.toString() };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Balance Reconciliation</h1>
          <p className="text-muted-foreground">
            Monitor monthly journal entries and ensure accounting balance
          </p>
        </div>
        
        <div className="flex gap-4 items-center">
          <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year.value} value={year.value.toString()}>
                  {year.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            onClick={runMonthlyProcessing}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            Run Monthly Processing
          </Button>
        </div>
      </div>

      {/* Balance Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Journal Entries</p>
                <p className="text-2xl font-bold">{journalEntries.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Balanced Months</p>
                <p className="text-2xl font-bold">{balanceChecks.filter(c => c.isBalanced).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-destructive/10 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Discrepancies</p>
                <p className="text-2xl font-bold">{balanceChecks.filter(c => !c.isBalanced).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Journal Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Stored Journal Entries - {selectedYear}</CardTitle>
          <CardDescription>
            Monthly journal entries created automatically on the 5th of each month
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journalEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{getMonthName(entry.month)}</TableCell>
                      <TableCell className="capitalize">{entry.entry_type}</TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell>{DepreciationCalculator.formatCurrency(entry.total_amount)}</TableCell>
                      <TableCell>{getStatusBadge(entry.status)}</TableCell>
                      <TableCell>{new Date(entry.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {journalEntries.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No journal entries found for {selectedYear}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balance Checks */}
      {balanceChecks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Balance Analysis</CardTitle>
            <CardDescription>
              Verification that journal entries match calculated amounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Active Cows</TableHead>
                    <TableHead>Asset Value</TableHead>
                    <TableHead>Journal Depreciation</TableHead>
                    <TableHead>Journal Dispositions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balanceChecks.map((check) => (
                    <TableRow key={`${check.year}-${check.month}`}>
                      <TableCell className="font-medium">{getMonthName(check.month)}</TableCell>
                      <TableCell>{check.activeCows.toLocaleString()}</TableCell>
                      <TableCell>{DepreciationCalculator.formatCurrency(check.totalAssetValue)}</TableCell>
                      <TableCell>{DepreciationCalculator.formatCurrency(check.journalDepreciation)}</TableCell>
                      <TableCell>{DepreciationCalculator.formatCurrency(check.journalDispositions)}</TableCell>
                      <TableCell>
                        {check.isBalanced ? (
                          <div className="flex items-center gap-2 text-success">
                            <CheckCircle className="h-4 w-4" />
                            Balanced
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-4 w-4" />
                            Issues
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {check.discrepancies.length > 0 ? (
                          <div className="space-y-1">
                            {check.discrepancies.map((issue, index) => (
                              <div key={index} className="text-sm text-destructive">
                                {issue}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">None</span>
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