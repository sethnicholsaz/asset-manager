import { useState } from 'react';
import { Calendar, Download, FileText, Calculator } from 'lucide-react';
import { Cow, DepreciationEntry, JournalEntry, JournalLine } from '@/types/cow';
import { DepreciationCalculator } from '@/utils/depreciation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface DepreciationReportProps {
  cows: Cow[];
}

export function DepreciationReport({ cows }: DepreciationReportProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const getMonthName = (month: number): string => {
    return new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  };

  const currentDate = new Date(selectedYear, selectedMonth - 1, 1);
  const activeCows = cows.filter(cow => 
    cow.status === 'active' && 
    new Date(cow.freshenDate) <= currentDate
  );

  // Calculate depreciation entries for the selected month
  const depreciationEntries: DepreciationEntry[] = activeCows.map(cow => {
    const monthlyDepreciation = DepreciationCalculator.calculateMonthlyDepreciation(cow, currentDate);
    const monthsSinceStart = DepreciationCalculator.getMonthsSinceStart(cow.freshenDate, currentDate);
    const totalDepreciation = monthlyDepreciation * (monthsSinceStart + 1);
    const bookValue = Math.max(cow.salvageValue, cow.purchasePrice - totalDepreciation);

    return {
      id: `${cow.id}-${selectedYear}-${selectedMonth}`,
      cowId: cow.id,
      month: selectedMonth,
      year: selectedYear,
      depreciationAmount: monthlyDepreciation,
      accumulatedDepreciation: totalDepreciation,
      bookValue: bookValue,
    };
  });

  const totalMonthlyDepreciation = depreciationEntries.reduce(
    (sum, entry) => sum + entry.depreciationAmount, 
    0
  );

  // Generate journal entries
  const journalEntries: JournalEntry[] = [];
  if (totalMonthlyDepreciation > 0) {
    const journalEntry: JournalEntry = {
      id: `je-${selectedYear}-${selectedMonth}`,
      entryDate: new Date(selectedYear, selectedMonth - 1, 1),
      description: `Dairy Cow Depreciation - ${getMonthName(selectedMonth)} ${selectedYear}`,
      totalAmount: totalMonthlyDepreciation,
      entryType: 'depreciation',
      lines: [
        {
          id: `jl-debit-${selectedYear}-${selectedMonth}`,
          journalEntryId: `je-${selectedYear}-${selectedMonth}`,
          accountCode: '6100',
          accountName: 'Depreciation Expense',
          description: 'Monthly depreciation of dairy cows',
          debitAmount: totalMonthlyDepreciation,
          creditAmount: 0,
          lineType: 'debit',
          createdAt: new Date()
        },
        {
          id: `jl-credit-${selectedYear}-${selectedMonth}`,
          journalEntryId: `je-${selectedYear}-${selectedMonth}`,
          accountCode: '1500.1',
          accountName: 'Accumulated Depreciation - Dairy Cows',
          description: 'Monthly depreciation of dairy cows',
          debitAmount: 0,
          creditAmount: totalMonthlyDepreciation,
          lineType: 'credit',
          createdAt: new Date()
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    journalEntries.push(journalEntry);
  }

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
              onClick={() => exportToCSV(depreciationEntries, `depreciation-${selectedYear}-${selectedMonth.toString().padStart(2, '0')}.csv`)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export Schedule
            </Button>

            <Button
              onClick={() => exportJournalToCSV(journalEntries, `journal-entries-${selectedYear}-${selectedMonth.toString().padStart(2, '0')}.csv`)}
              variant="outline"
              className="flex items-center gap-2"
              disabled={journalEntries.length === 0}
            >
              <FileText className="h-4 w-4" />
              Export Journal
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <Calculator className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Cows</p>
                <p className="text-2xl font-bold">{activeCows.length.toLocaleString()}</p>
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
                <p className="text-2xl font-bold">{DepreciationCalculator.formatCurrency(totalMonthlyDepreciation)}</p>
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
                <p className="text-2xl font-bold">{journalEntries.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Content */}
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
                    {depreciationEntries.map((entry) => {
                      const cow = cows.find(c => c.id === entry.cowId);
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{cow?.tagNumber}</TableCell>
                          <TableCell>{DepreciationCalculator.formatCurrency(cow?.purchasePrice || 0)}</TableCell>
                          <TableCell>{DepreciationCalculator.formatCurrency(entry.depreciationAmount)}</TableCell>
                          <TableCell>{DepreciationCalculator.formatCurrency(entry.accumulatedDepreciation)}</TableCell>
                          <TableCell>{DepreciationCalculator.formatCurrency(entry.bookValue)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {depreciationEntries.length > 0 && (
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell>TOTAL</TableCell>
                        <TableCell>{DepreciationCalculator.formatCurrency(activeCows.reduce((sum, cow) => sum + cow.purchasePrice, 0))}</TableCell>
                        <TableCell>{DepreciationCalculator.formatCurrency(totalMonthlyDepreciation)}</TableCell>
                        <TableCell>-</TableCell>
                        <TableCell>-</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                
                {depreciationEntries.length === 0 && (
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
                Accounting entries for monthly depreciation expense
              </CardDescription>
            </CardHeader>
            <CardContent>
              {journalEntries.map((entry) => (
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

              {journalEntries.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No journal entries for the selected period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}