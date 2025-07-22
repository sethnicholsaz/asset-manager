import { useState, useEffect } from 'react';
import { Calendar, Download, FileText, Calculator, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Cow, DepreciationEntry, JournalEntry } from '@/types/cow';
import { DepreciationCalculator } from '@/utils/depreciation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface DepreciationReportProps {
  cows: Cow[];
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

interface ReportData {
  summary: {
    activeCows: number;
    totalMonthlyDepreciation: number;
    totalBalanceAdjustments: number;
    journalEntries: number;
  };
  depreciationEntries: Array<DepreciationEntry & { cow: { id: string; tagNumber: string; purchasePrice: number; } }>;
  journalEntries: JournalEntry[];
  balanceAdjustments: BalanceAdjustment[];
}

export function DepreciationReport({ cows }: DepreciationReportProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentCompany) {
      fetchReportData();
    }
  }, [currentCompany, selectedMonth, selectedYear]);

  const fetchReportData = async () => {
    if (!currentCompany) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('depreciation-report', {
        body: {
          month: selectedMonth,
          year: selectedYear,
          companyId: currentCompany.id
        }
      });

      if (error) throw error;

      setReportData(data);
    } catch (error) {
      console.error('Error fetching report data:', error);
      toast({
        title: "Error",
        description: "Failed to generate depreciation report",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getMonthName = (month: number): string => {
    return new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  };

  const exportToCSV = (data: any[], filename: string) => {
    const csvContent = convertToCSV(data);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const convertToCSV = (data: any[]): string => {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
      Object.values(row).map(value => {
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`;
        }
        return value;
      }).join(',')
    );
    
    return [headers, ...rows].join('\n');
  };

  const exportJournalToCSV = (entries: JournalEntry[], filename: string) => {
    const journalData: any[] = [];
    
    entries.forEach(entry => {
      entry.lines.forEach(line => {
        journalData.push({
          Date: DepreciationCalculator.formatDate(entry.entryDate),
          'Account Code': line.accountCode,
          'Account Name': line.accountName,
          Description: line.description,
          'Debit Amount': line.debitAmount > 0 ? line.debitAmount.toFixed(2) : '',
          'Credit Amount': line.creditAmount > 0 ? line.creditAmount.toFixed(2) : '',
          'Journal Entry ID': entry.id,
          'Entry Type': entry.entryType
        });
      });
    });

    const csvContent = convertToCSV(journalData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: getMonthName(i + 1)
  }));

  const years = Array.from({ length: 5 }, (_, i) => {
    const year = new Date().getFullYear() - 2 + i;
    return { value: year, label: year.toString() };
  });

  return (
    <div className="space-y-6">
      {/* Report Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Monthly Depreciation Report
          </CardTitle>
          <CardDescription>
            Generate depreciation schedules and journal entries for accounting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Month</label>
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
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Year</label>
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

            <Button
              onClick={() => reportData && exportToCSV(reportData.depreciationEntries, `depreciation-${selectedYear}-${selectedMonth.toString().padStart(2, '0')}.csv`)}
              variant="outline"
              className="flex items-center gap-2"
              disabled={!reportData || isLoading}
            >
              <Download className="h-4 w-4" />
              Export Schedule
            </Button>

            <Button
              onClick={() => reportData && exportJournalToCSV(reportData.journalEntries, `journal-entries-${selectedYear}-${selectedMonth.toString().padStart(2, '0')}.csv`)}
              variant="outline"
              className="flex items-center gap-2"
              disabled={!reportData || reportData.journalEntries.length === 0 || isLoading}
            >
              <FileText className="h-4 w-4" />
              Export Journal
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="p-12">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Generating report...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {reportData && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Calculator className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Cows</p>
                  <p className="text-2xl font-bold">{reportData.summary.activeCows.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-warning/10 rounded-lg flex items-center justify-center">
                  <FileText className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Depreciation</p>
                  <p className="text-2xl font-bold">{DepreciationCalculator.formatCurrency(reportData.summary.totalMonthlyDepreciation)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  reportData.summary.totalBalanceAdjustments === 0 ? 'bg-accent/10' : 
                  reportData.summary.totalBalanceAdjustments > 0 ? 'bg-destructive/10' : 'bg-success/10'
                }`}>
                  <Download className={`h-4 w-4 ${
                    reportData.summary.totalBalanceAdjustments === 0 ? 'text-accent' : 
                    reportData.summary.totalBalanceAdjustments > 0 ? 'text-destructive' : 'text-success'
                  }`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Balance Adjustments</p>
                  <p className={`text-2xl font-bold ${
                    reportData.summary.totalBalanceAdjustments === 0 ? '' : 
                    reportData.summary.totalBalanceAdjustments > 0 ? 'text-destructive' : 'text-success'
                  }`}>
                    {DepreciationCalculator.formatCurrency(reportData.summary.totalBalanceAdjustments)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Download className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Journal Entries</p>
                  <p className="text-2xl font-bold">{reportData.summary.journalEntries}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Report Content */}
      {reportData && !isLoading && (
        <Tabs defaultValue="depreciation" className="space-y-4">
          <TabsList>
            <TabsTrigger value="depreciation">Depreciation Schedule</TabsTrigger>
            <TabsTrigger value="journal">Journal Entries</TabsTrigger>
          </TabsList>

          <TabsContent value="depreciation">
            <Card>
              <CardHeader>
                <CardTitle>Depreciation Schedule - {getMonthName(selectedMonth)} {selectedYear}</CardTitle>
                <CardDescription>
                  Monthly depreciation calculation for all active dairy cows
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cow Tag</TableHead>
                        <TableHead>Purchase Price</TableHead>
                        <TableHead>Monthly Depreciation</TableHead>
                        <TableHead>Accumulated Depreciation</TableHead>
                        <TableHead>Book Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.depreciationEntries.map((entry) => (
                        <TableRow key={entry.id}>
                           <TableCell className="font-medium">
                            <Link 
                              to={`/cow/${entry.cow.id}`}
                              className="text-primary hover:text-primary/80 hover:underline"
                            >
                              {entry.cow.tagNumber}
                            </Link>
                          </TableCell>
                          <TableCell>{DepreciationCalculator.formatCurrency(entry.cow.purchasePrice)}</TableCell>
                          <TableCell>{DepreciationCalculator.formatCurrency(entry.depreciationAmount)}</TableCell>
                          <TableCell>{DepreciationCalculator.formatCurrency(entry.accumulatedDepreciation)}</TableCell>
                          <TableCell>{DepreciationCalculator.formatCurrency(entry.bookValue)}</TableCell>
                        </TableRow>
                      ))}
                      {reportData.depreciationEntries.length > 0 && (
                        <TableRow className="bg-muted/30 font-medium">
                          <TableCell>TOTAL</TableCell>
                          <TableCell>{DepreciationCalculator.formatCurrency(reportData.depreciationEntries.reduce((sum, entry) => sum + entry.cow.purchasePrice, 0))}</TableCell>
                          <TableCell>{DepreciationCalculator.formatCurrency(reportData.summary.totalMonthlyDepreciation)}</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell>-</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  
                  {reportData.depreciationEntries.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>No active cows for the selected period</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="journal">
            <Card>
              <CardHeader>
                <CardTitle>Journal Entries - {getMonthName(selectedMonth)} {selectedYear}</CardTitle>
                <CardDescription>
                  Accounting entries for monthly depreciation expense{reportData.balanceAdjustments.length > 0 ? ' including prior period adjustments' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData.balanceAdjustments.length > 0 && (
                  <div className="mb-6 p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-medium mb-2">Prior Period Adjustments Included:</h4>
                    <div className="space-y-2">
                      {reportData.balanceAdjustments.map((adj) => (
                        <div key={adj.id} className="text-sm flex justify-between">
                          <span>{adj.description}{adj.cow_tag ? ` (Cow #${adj.cow_tag})` : ''}</span>
                          <span className={adj.adjustment_amount >= 0 ? 'text-destructive' : 'text-success'}>
                            {DepreciationCalculator.formatCurrency(adj.adjustment_amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reportData.journalEntries.map((entry) => (
                  <div key={entry.id} className="space-y-4 p-4 border rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{entry.description}</h4>
                        <p className="text-sm text-muted-foreground">
                          Date: {DepreciationCalculator.formatDate(entry.entryDate)}
                        </p>
                      </div>
                      <p className="font-medium text-lg">
                        {DepreciationCalculator.formatCurrency(entry.totalAmount)}
                      </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h5 className="font-medium text-sm mb-2">Debits</h5>
                        <div className="space-y-2">
                          {entry.lines.filter(line => line.lineType === 'debit').map((line) => (
                            <div key={line.id} className="text-sm">
                              <div className="font-medium">{line.accountCode} - {line.accountName}</div>
                              <div className="text-muted-foreground">{line.description}</div>
                              <div className="font-medium">{DepreciationCalculator.formatCurrency(line.debitAmount)}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-medium text-sm mb-2">Credits</h5>
                        <div className="space-y-2">
                          {entry.lines.filter(line => line.lineType === 'credit').map((line) => (
                            <div key={line.id} className="text-sm">
                              <div className="font-medium">{line.accountCode} - {line.accountName}</div>
                              <div className="text-muted-foreground">{line.description}</div>
                              <div className="font-medium">{DepreciationCalculator.formatCurrency(line.creditAmount)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {reportData.journalEntries.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No journal entries for the selected period</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}