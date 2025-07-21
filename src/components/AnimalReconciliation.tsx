import { useState, useEffect } from 'react';
import { Calendar, Plus, Minus, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface AnimalReconciliation {
  month: number;
  year: number;
  previousMonthBalance: number;
  newCows: number;
  sold: number;
  dead: number;
  culled: number;
  currentBalance: number;
}

export function AnimalReconciliation() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [reconciliationData, setReconciliationData] = useState<AnimalReconciliation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentCompany) {
      fetchReconciliationData();
    }
  }, [currentCompany, selectedYear]);

  const fetchReconciliationData = async () => {
    if (!currentCompany) return;

    setIsLoading(true);
    try {
      console.log('Using server-side reconciliation function...');
      
      // Use the new server-side reconciliation function
      const { data: reconciliationResults, error: reconciliationError } = await supabase
        .rpc('get_monthly_reconciliation' as any, {
          p_company_id: currentCompany.id,
          p_year: selectedYear
        });

      if (reconciliationError) {
        console.error('Reconciliation function error:', reconciliationError);
        throw reconciliationError;
      }

      console.log('Server-side reconciliation results:', reconciliationResults);

      // Transform the results to match the component's expected format
      const reconciliations: AnimalReconciliation[] = (reconciliationResults || []).map(row => ({
        month: row.month_num,
        year: row.year_num,
        previousMonthBalance: Number(row.starting_balance),
        newCows: Number(row.additions),
        sold: Number(row.disposals), // All disposals combined
        dead: 0, // Server function combines all disposals into one number
        culled: 0, // Server function combines all disposals into one number
        currentBalance: Number(row.ending_balance) // Use calculated ending balance for proper flow
      }));

      console.log('Reconciliation flow check:');
      reconciliations.forEach((rec, index) => {
        if (index > 0) {
          const prevBalance = reconciliations[index - 1].currentBalance;
          const currentStart = rec.previousMonthBalance;
          console.log(`Month ${rec.month}: Previous ending (${prevBalance}) vs Current starting (${currentStart}) - ${prevBalance === currentStart ? 'MATCH' : 'MISMATCH'}`);
        }
      });

      // Filter out months with no activity
      const activeReconciliations = reconciliations.filter(r => 
        r.previousMonthBalance > 0 || r.newCows > 0 || r.sold > 0 || r.currentBalance > 0
      );

      setReconciliationData(activeReconciliations);

      console.log('Final reconciliation data:', activeReconciliations);
      
      // Get accurate cow stats for verification
      const { data: statsData } = await supabase
        .rpc('get_accurate_cow_stats' as any, { p_company_id: currentCompany.id });
        
      const actualActiveCows = Array.isArray(statsData) ? statsData?.[0]?.active_count || 0 : 0;
      console.log('Actual active cows in system:', actualActiveCows);
      console.log('Last reconciliation balance:', activeReconciliations[activeReconciliations.length - 1]?.currentBalance || 0);

    } catch (error) {
      console.error('Error fetching reconciliation data:', error);
      toast({
        title: "Error",
        description: "Failed to load animal reconciliation data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getMonthName = (month: number): string => {
    return new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  };

  const years = Array.from({ length: 5 }, (_, i) => {
    const year = new Date().getFullYear() - 2 + i;
    return { value: year, label: year.toString() };
  });

  const months = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return { value: month, label: getMonthName(month) };
  });

  // Filter data to only show months up to selected month
  const filteredReconciliationData = reconciliationData.filter(r => r.month <= selectedMonth);
  
  // Get current month data for summary cards
  const currentMonthData = reconciliationData.find(r => r.month === selectedMonth);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Animal Reconciliation</h1>
          <p className="text-muted-foreground">
            Track animal inventory changes month by month
          </p>
        </div>
        
        <div className="flex gap-4 items-center">
          <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(month => (
                <SelectItem key={month.value} value={month.value.toString()}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
        </div>
      </div>

      {/* Summary Cards for Selected Month */}
      {currentMonthData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Previous Balance</p>
                  <p className="text-2xl font-bold">{currentMonthData.previousMonthBalance}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center">
                  <Plus className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">New Cows</p>
                  <p className="text-2xl font-bold text-success">+{currentMonthData.newCows}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-destructive/10 rounded-lg flex items-center justify-center">
                  <Minus className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Disposed</p>
                  <p className="text-2xl font-bold text-destructive">-{currentMonthData.sold + currentMonthData.dead + currentMonthData.culled}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className="text-2xl font-bold">{currentMonthData.currentBalance}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reconciliation Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Animal Reconciliation - {selectedYear}</CardTitle>
          <CardDescription>
            Cumulative reconciliation showing how balances carry forward each month
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
                    <TableHead className="text-right">Previous Balance</TableHead>
                    <TableHead className="text-right text-success">+ New Cows</TableHead>
                    <TableHead className="text-right text-destructive">- Sold</TableHead>
                    <TableHead className="text-right text-destructive">- Dead</TableHead>
                    <TableHead className="text-right text-destructive">- Culled</TableHead>
                    <TableHead className="text-right font-semibold">Ending Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReconciliationData.map((data) => (
                    <TableRow key={`${data.year}-${data.month}`}>
                      <TableCell className="font-medium">{getMonthName(data.month)}</TableCell>
                      <TableCell className="text-right">{data.previousMonthBalance.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-success">
                        {data.newCows > 0 ? `+${data.newCows.toLocaleString()}` : '0'}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {data.sold > 0 ? `-${data.sold.toLocaleString()}` : '0'}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {data.dead > 0 ? `-${data.dead.toLocaleString()}` : '0'}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {data.culled > 0 ? `-${data.culled.toLocaleString()}` : '0'}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {data.currentBalance.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredReconciliationData.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No animal activity found for {selectedYear}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}