import { useState, useEffect } from 'react';
import { Calendar, Download, FileText, Calculator, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Cow, CowDisposition, JournalEntry } from '@/types/cow';
import { DepreciationCalculator } from '@/utils/depreciation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface DispositionReportProps {
  cows: Cow[];
}

export function DispositionReport({ cows }: DispositionReportProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [dispositions, setDispositions] = useState<CowDisposition[]>([]);
  const [dispositionCows, setDispositionCows] = useState<Cow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(100);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchDispositions();
    setCurrentPage(1); // Reset to first page when month/year changes
  }, [selectedMonth, selectedYear, currentCompany]);

  const fetchDispositions = async () => {
    if (!currentCompany) return;
    
    setIsLoading(true);
    try {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0);
      
      // Fetch dispositions for the period
      const { data: dispositionData, error } = await supabase
        .from('cow_dispositions')
        .select('*')
        .eq('company_id', currentCompany.id)
        .gte('disposition_date', startDate.toISOString().split('T')[0])
        .lte('disposition_date', endDate.toISOString().split('T')[0]);

      if (error) throw error;

      const transformedDispositions: CowDisposition[] = (dispositionData || []).map(d => ({
        id: d.id,
        cowId: d.cow_id,
        dispositionDate: new Date(d.disposition_date),
        dispositionType: d.disposition_type as 'sale' | 'death' | 'culled',
        saleAmount: d.sale_amount || 0,
        finalBookValue: d.final_book_value,
        gainLoss: d.gain_loss,
        notes: d.notes,
        journalEntryId: d.journal_entry_id,
        createdAt: new Date(d.created_at),
        updatedAt: new Date(d.updated_at)
      }));

      setDispositions(transformedDispositions);

      // Fetch cow data for the disposed cows using tag numbers
      if (transformedDispositions.length > 0) {
        const cowTagNumbers = transformedDispositions.map(d => d.cowId);
        const { data: cowData, error: cowError } = await supabase
          .from('cows')
          .select('*')
          .in('tag_number', cowTagNumbers);

        if (cowError) throw cowError;

        const transformedCows: Cow[] = (cowData || []).map(cow => {
          console.log('🔧 Raw cow data from DB:', cow);
          console.log('🔧 cow.id value:', cow.id, 'type:', typeof cow.id);
          
          return {
            id: cow.id,
            tagNumber: cow.tag_number,
            name: cow.name,
            birthDate: new Date(cow.birth_date),
            freshenDate: new Date(cow.freshen_date),
          purchasePrice: cow.purchase_price,
          salvageValue: cow.salvage_value,
          currentValue: cow.current_value,
          totalDepreciation: cow.total_depreciation,
          status: cow.status as 'active' | 'sold' | 'deceased' | 'retired',
          depreciationMethod: cow.depreciation_method as 'straight-line',
          acquisitionType: cow.acquisition_type as 'purchased' | 'raised',
          dispositionId: cow.disposition_id,
          assetType: {
            id: cow.asset_type_id,
            name: 'Dairy Cow',
            defaultDepreciationYears: 5,
            defaultDepreciationMethod: 'straight-line',
            defaultSalvagePercentage: 10
          }
        };
      });

        setDispositionCows(transformedCows);
      } else {
        setDispositionCows([]);
      }
    } catch (error) {
      console.error('Error fetching dispositions:', error);
      toast({
        title: "Error",
        description: "Failed to load disposition data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getMonthName = (month: number): string => {
    return new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  };

  // Generate journal entries for writebacks
  const generateJournalEntries = (): JournalEntry[] => {
    const journalEntries: JournalEntry[] = [];

    console.log(`Generating journal entries for ${dispositions.length} dispositions`);
    console.log(`Available cow data: ${dispositionCows.length} cows`);

    dispositions.forEach((disposition) => {
      const cow = dispositionCows.find(c => c.tagNumber === disposition.cowId);
      if (!cow) {
        console.log(`No cow data found for disposition ${disposition.id}, cow ID: ${disposition.cowId}`);
        return;
      }

      // Use actual freshen dates from data - no automatic calculation
      const effectiveFreshenDate = cow.freshenDate;

      // Calculate accumulated depreciation at disposition date using corrected freshen date
      const monthlyDepreciation = DepreciationCalculator.calculateMonthlyDepreciation(cow, disposition.dispositionDate);
      const monthsSinceStart = DepreciationCalculator.getMonthsSinceStart(effectiveFreshenDate, disposition.dispositionDate);
      const accumulatedDepreciation = Math.min(
        monthlyDepreciation * monthsSinceStart,
        cow.purchasePrice - cow.salvageValue // Cap at depreciable amount
      );

      console.log(`Cow #${cow.tagNumber}: months since start = ${monthsSinceStart}, monthly dep = ${monthlyDepreciation}, accumulated = ${accumulatedDepreciation}`);

      // Calculate book value at disposition (purchase price - accumulated depreciation, but not less than salvage)
      const bookValue = Math.max(cow.salvageValue, cow.purchasePrice - accumulatedDepreciation);
      
      // Recalculate gain/loss based on proper book value
      const actualGainLoss = (disposition.saleAmount || 0) - bookValue;

      const journalEntry: JournalEntry = {
        id: `je-disposition-${disposition.id}`,
        entryDate: disposition.dispositionDate,
        description: `${disposition.dispositionType === 'sale' ? 'Sale' : 'Write-off'} of Dairy Cow #${cow.tagNumber}`,
        totalAmount: Math.max(disposition.saleAmount || 0, cow.purchasePrice),
        entryType: 'disposition',
        lines: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Cash/Sale entry (if sale)
      if (disposition.dispositionType === 'sale' && disposition.saleAmount > 0) {
        journalEntry.lines.push({
          id: `jl-cash-${disposition.id}`,
          journalEntryId: journalEntry.id,
          accountCode: '1000',
          accountName: 'Cash',
          description: `Cash received from sale of cow #${cow.tagNumber}`,
          debitAmount: disposition.saleAmount,
          creditAmount: 0,
          lineType: 'debit',
          createdAt: new Date()
        });
      }

      // Accumulated Depreciation removal - always include
      journalEntry.lines.push({
        id: `jl-accum-dep-${disposition.id}`,
        journalEntryId: journalEntry.id,
        accountCode: '1500.1',
        accountName: 'Accumulated Depreciation - Dairy Cows',
        description: `Remove accumulated depreciation for cow #${cow.tagNumber}`,
        debitAmount: accumulatedDepreciation,
        creditAmount: 0,
        lineType: 'debit',
        createdAt: new Date()
      });

      // Asset removal (credit the original cost)
      journalEntry.lines.push({
        id: `jl-asset-${disposition.id}`,
        journalEntryId: journalEntry.id,
        accountCode: '1500',
        accountName: 'Dairy Cows',
        description: `Remove cow asset #${cow.tagNumber}`,
        debitAmount: 0,
        creditAmount: cow.purchasePrice,
        lineType: 'credit',
        createdAt: new Date()
      });

      // Gain or Loss - use recalculated amount for proper balancing
      if (actualGainLoss !== 0) {
        const isGain = actualGainLoss > 0;
        journalEntry.lines.push({
          id: `jl-gainloss-${disposition.id}`,
          journalEntryId: journalEntry.id,
          accountCode: isGain ? '8000' : '9000',
          accountName: isGain ? 'Gain on Sale of Assets' : 'Loss on Sale of Assets',
          description: `${isGain ? 'Gain' : 'Loss'} on ${disposition.dispositionType} of cow #${cow.tagNumber}`,
          debitAmount: isGain ? 0 : Math.abs(actualGainLoss),
          creditAmount: isGain ? actualGainLoss : 0,
          lineType: isGain ? 'credit' : 'debit',
          createdAt: new Date()
        });
      }

      journalEntries.push(journalEntry);
    });

    return journalEntries;
  };

  const journalEntries = generateJournalEntries();

  // Calculate totals using the same logic as the display table (recalculated values)
  const totals = dispositions.reduce((acc, d) => {
    const cow = dispositionCows.find(c => c.tagNumber === d.cowId);
    if (!cow) {
      // Use stored values if no cow data available
      acc.gainLoss += d.gainLoss;
      acc.saleAmount += d.saleAmount || 0;
      return acc;
    }
    
    // Recalculate using same logic as display table
    const effectiveFreshenDate = cow.freshenDate;
    const monthlyDepreciation = DepreciationCalculator.calculateMonthlyDepreciation(cow, d.dispositionDate);
    const monthsSinceStart = DepreciationCalculator.getMonthsSinceStart(effectiveFreshenDate, d.dispositionDate);
    const accumulatedDepreciation = Math.min(
      monthlyDepreciation * monthsSinceStart,
      cow.purchasePrice - cow.salvageValue
    );
    const bookValue = Math.max(cow.salvageValue, cow.purchasePrice - accumulatedDepreciation);
    const actualGainLoss = (d.saleAmount || 0) - bookValue;
    
    acc.gainLoss += actualGainLoss;
    acc.saleAmount += d.saleAmount || 0;
    return acc;
  }, { gainLoss: 0, saleAmount: 0 });
  
  const totalGainLoss = totals.gainLoss;
  const totalSaleAmount = totals.saleAmount;

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

  const exportData = dispositions.map(d => {
    const cow = dispositionCows.find(c => c.tagNumber === d.cowId);
    if (!cow) return {
      CowTag: d.cowId,
      DispositionDate: DepreciationCalculator.formatDate(d.dispositionDate),
      DispositionType: d.dispositionType,
      SaleAmount: d.saleAmount || 0,
      FinalBookValue: d.finalBookValue,
      GainLoss: d.gainLoss,
      Notes: d.notes || ''
    };
    
    // Use actual freshen dates from data - no automatic calculation
    const effectiveFreshenDate = cow.freshenDate;
    
    // Calculate proper book value for export
    const monthlyDepreciation = DepreciationCalculator.calculateMonthlyDepreciation(cow, d.dispositionDate);
    const monthsSinceStart = DepreciationCalculator.getMonthsSinceStart(effectiveFreshenDate, d.dispositionDate);
    const accumulatedDepreciation = Math.min(
      monthlyDepreciation * monthsSinceStart,
      cow.purchasePrice - cow.salvageValue
    );
    const bookValue = Math.max(cow.salvageValue, cow.purchasePrice - accumulatedDepreciation);
    const actualGainLoss = (d.saleAmount || 0) - bookValue;
    
    return {
      CowTag: cow.tagNumber,
      DispositionDate: DepreciationCalculator.formatDate(d.dispositionDate),
      DispositionType: d.dispositionType,
      SaleAmount: d.saleAmount || 0,
      FinalBookValue: bookValue,
      GainLoss: actualGainLoss,
      Notes: d.notes || ''
    };
  });

  return (
    <div className="space-y-6">
      {/* Report Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Disposition Report - Sold & Died Cows
          </CardTitle>
          <CardDescription>
            Track dispositions and generate journal entries for asset writebacks
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
              onClick={() => exportToCSV(exportData, `dispositions-${selectedYear}-${selectedMonth.toString().padStart(2, '0')}.csv`)}
              variant="outline"
              className="flex items-center gap-2"
              disabled={dispositions.length === 0}
            >
              <Download className="h-4 w-4" />
              Export Summary
            </Button>

            <Button
              onClick={() => exportJournalToCSV(journalEntries, `disposition-journal-${selectedYear}-${selectedMonth.toString().padStart(2, '0')}.csv`)}
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-destructive/10 rounded-lg flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Dispositions</p>
                <p className="text-2xl font-bold">{dispositions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center">
                <FileText className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Sale Amount</p>
                <p className="text-2xl font-bold">{DepreciationCalculator.formatCurrency(totalSaleAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                totalGainLoss >= 0 ? 'bg-success/10' : 'bg-destructive/10'
              }`}>
                <Calculator className={`h-4 w-4 ${
                  totalGainLoss >= 0 ? 'text-success' : 'text-destructive'
                }`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Gain/Loss</p>
                <p className={`text-2xl font-bold ${
                  totalGainLoss >= 0 ? 'text-success' : 'text-destructive'
                }`}>
                  {DepreciationCalculator.formatCurrency(totalGainLoss)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
                <FileText className="h-4 w-4 text-accent" />
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
      <Tabs defaultValue="dispositions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dispositions">Disposition Summary</TabsTrigger>
          <TabsTrigger value="journal">Journal Entries</TabsTrigger>
        </TabsList>

        <TabsContent value="dispositions">
          <Card>
            <CardHeader>
              <CardTitle>Disposition Summary - {getMonthName(selectedMonth)} {selectedYear}</CardTitle>
              <CardDescription>
                All cow dispositions (sales, deaths, culls) for the selected period
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
                        <TableHead>Cow Tag</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Sale Amount</TableHead>
                        <TableHead>Book Value</TableHead>
                        <TableHead>Gain/Loss</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dispositions
                        .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                        .map((disposition) => {
                          const cow = dispositionCows.find(c => c.tagNumber === disposition.cowId);
                          console.log('🐄 Found cow for disposition:', { disposition: disposition.cowId, cow: cow, cowId: cow?.id });
                          
                          // Calculate values - use stored values if no cow data available
                          let bookValue = disposition.finalBookValue;
                          let actualGainLoss = disposition.gainLoss;
                          
                          if (cow) {
                            // Use actual freshen dates from data - no automatic calculation
                            const effectiveFreshenDate = cow.freshenDate;
                            
                            // Calculate proper book value for display
                            const monthlyDepreciation = DepreciationCalculator.calculateMonthlyDepreciation(cow, disposition.dispositionDate);
                            const monthsSinceStart = DepreciationCalculator.getMonthsSinceStart(effectiveFreshenDate, disposition.dispositionDate);
                            const accumulatedDepreciation = Math.min(
                              monthlyDepreciation * monthsSinceStart,
                              cow.purchasePrice - cow.salvageValue
                            );
                            bookValue = Math.max(cow.salvageValue, cow.purchasePrice - accumulatedDepreciation);
                            actualGainLoss = (disposition.saleAmount || 0) - bookValue;
                          }
                          
                          return (
                            <TableRow key={disposition.id}>
                              <TableCell className="font-medium">
                                {cow ? (
                                  <Link 
                                    to={`/cow/${cow.id}`}
                                    className="text-primary hover:text-primary/80 hover:underline"
                                  >
                                    {cow.tagNumber}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">{disposition.cowId}</span>
                                )}
                              </TableCell>
                              <TableCell>{DepreciationCalculator.formatDate(disposition.dispositionDate)}</TableCell>
                              <TableCell className="capitalize">{disposition.dispositionType}</TableCell>
                              <TableCell>{DepreciationCalculator.formatCurrency(disposition.saleAmount || 0)}</TableCell>
                              <TableCell>{DepreciationCalculator.formatCurrency(bookValue)}</TableCell>
                              <TableCell className={actualGainLoss >= 0 ? 'text-success' : 'text-destructive'}>
                                {DepreciationCalculator.formatCurrency(actualGainLoss)}
                              </TableCell>
                              <TableCell className="max-w-xs truncate">{disposition.notes || '-'}</TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                  
                  {/* Pagination */}
                  {dispositions.length > pageSize && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {Math.min((currentPage - 1) * pageSize + 1, dispositions.length)} to {Math.min(currentPage * pageSize, dispositions.length)} of {dispositions.length} dispositions
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <span className="text-sm font-medium">
                          Page {currentPage} of {Math.ceil(dispositions.length / pageSize)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(Math.ceil(dispositions.length / pageSize), p + 1))}
                          disabled={currentPage >= Math.ceil(dispositions.length / pageSize)}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {dispositions.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>No dispositions found for the selected period</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journal">
          <Card>
            <CardHeader>
              <CardTitle>Journal Entries - {getMonthName(selectedMonth)} {selectedYear}</CardTitle>
              <CardDescription>
                Asset writebacks and gain/loss recognition for disposed cows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {journalEntries.map((entry) => (
                  <div key={entry.id} className="space-y-4 p-4 border rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{entry.description}</h4>
                        <p className="text-sm text-muted-foreground">
                          Date: {DepreciationCalculator.formatDate(entry.entryDate)}
                        </p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h5 className="font-medium text-sm mb-2">Debits</h5>
                        <div className="space-y-2">
                          {entry.lines.filter(line => line.lineType === 'debit' && line.debitAmount > 0).map((line) => (
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
                          {entry.lines.filter(line => line.lineType === 'credit' && line.creditAmount > 0).map((line) => (
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}