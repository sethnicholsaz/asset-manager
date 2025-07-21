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
      // First, let's verify the actual current active count with explicit high limit
      const { data: currentActiveCows } = await supabase
        .from('cows')
        .select('id, tag_number, status, freshen_date')
        .eq('company_id', currentCompany.id)
        .eq('status', 'active')
        .limit(50000); // Explicit high limit to override any defaults

      console.log('=== VERIFICATION ===');
      console.log('Actual active cows RIGHT NOW:', currentActiveCows?.length || 0);
      console.log('Sample active cows:', currentActiveCows?.slice(0, 5));

        // Check if there are disposed cows that might not be marked correctly
        const { data: disposedCows } = await supabase
          .from('cows')
          .select('id, status, disposition_id')
          .eq('company_id', currentCompany.id)
          .neq('status', 'active')
          .limit(10000); // High limit

      console.log('Non-active cows by status:');
      const statusCounts = {};
      disposedCows?.forEach(cow => {
        statusCounts[cow.status] = (statusCounts[cow.status] || 0) + 1;
      });
      console.log(statusCounts);

        // Check dispositions table
        const { data: allDispositions } = await supabase
          .from('cow_dispositions')
          .select('*')
          .eq('company_id', currentCompany.id)
          .limit(10000); // High limit

      console.log('Total dispositions in system:', allDispositions?.length || 0);

      const reconciliations: AnimalReconciliation[] = [];
      let runningBalance = 0;

      // Calculate for each month in the selected year
      for (let month = 1; month <= 12; month++) {
        const currentMonthStart = new Date(selectedYear, month - 1, 1);
        const currentMonthEnd = new Date(selectedYear, month, 0);
        const previousMonthEnd = new Date(selectedYear, month - 1, 0);

        console.log(`Calculating for ${month}/${selectedYear}`);

        // For the first month, calculate the actual previous month balance
        let previousMonthBalance = runningBalance;
        if (month === 1) {
          // Get ALL cows and calculate how many were active at end of previous year
          const { data: allCows } = await supabase
            .from('cows')
            .select('id, status, freshen_date, disposition_id')
            .eq('company_id', currentCompany.id)
            .limit(50000); // Explicit high limit

          previousMonthBalance = (allCows || []).filter(cow => {
            const freshenDate = new Date(cow.freshen_date);
            // Must have freshened by end of previous month and still be active
            return freshenDate <= previousMonthEnd && cow.status === 'active';
          }).length;
          
          console.log(`Starting balance for ${selectedYear}:`, previousMonthBalance);
        }

        // New cows: freshened during current month
        const { data: newCowsData } = await supabase
          .from('cows')
          .select('id')
          .eq('company_id', currentCompany.id)
          .gte('freshen_date', currentMonthStart.toISOString().split('T')[0])
          .lte('freshen_date', currentMonthEnd.toISOString().split('T')[0])
          .limit(10000); // High limit

        const newCows = newCowsData?.length || 0;

        // Dispositions during current month
        const { data: dispositionsData } = await supabase
          .from('cow_dispositions')
          .select('disposition_type')
          .eq('company_id', currentCompany.id)
          .gte('disposition_date', currentMonthStart.toISOString().split('T')[0])
          .lte('disposition_date', currentMonthEnd.toISOString().split('T')[0])
          .limit(5000); // High limit

        const sold = (dispositionsData || []).filter(d => d.disposition_type === 'sale').length;
        const dead = (dispositionsData || []).filter(d => d.disposition_type === 'death').length;
        const culled = (dispositionsData || []).filter(d => d.disposition_type === 'culled').length;

        // Calculate ending balance for this month
        const currentBalance = previousMonthBalance + newCows - sold - dead - culled;
        
        console.log(`Month ${month}: ${previousMonthBalance} + ${newCows} - ${sold} - ${dead} - ${culled} = ${currentBalance}`);

        reconciliations.push({
          month,
          year: selectedYear,
          previousMonthBalance,
          newCows,
          sold,
          dead,
          culled,
          currentBalance
        });

        // Set running balance for next month
        runningBalance = currentBalance;
      }

      // Filter out months with no activity (but keep all months that have any data)
      const activeReconciliations = reconciliations.filter(r => 
        r.previousMonthBalance > 0 || r.newCows > 0 || r.sold > 0 || r.dead > 0 || r.culled > 0 || r.currentBalance > 0
      );

      setReconciliationData(activeReconciliations);

      console.log('Final reconciliation data:', activeReconciliations);
      
      // Get actual current cow count for verification
      const { data: currentCows } = await supabase
        .from('cows')
        .select('id')
        .eq('company_id', currentCompany.id)
        .eq('status', 'active')
        .limit(50000); // High limit
      
      console.log('Actual active cows in system:', currentCows?.length || 0);
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
                  {reconciliationData.map((data) => (
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
              
              {reconciliationData.length === 0 && (
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