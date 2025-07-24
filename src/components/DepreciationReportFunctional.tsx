/**
 * Functional DepreciationReport using domain-driven architecture
 * Demonstrates modern React patterns with domain functions
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Download, FileText, Calculator, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

// Use new domain imports
import {
  calculateCurrentDepreciation,
  generateDepreciationSchedule,
  formatCurrency,
  formatDate,
  isOk,
  unwrapOr,
  sequence,
  type DepreciationInput,
  type DepreciationResult,
  type Result,
} from '@/domain';

interface Cow {
  id: string;
  tag_number: string;
  purchase_price: number;
  salvage_value: number;
  freshen_date: string;
  status: string;
  depreciation_method: string;
  current_value: number;
  total_depreciation: number;
}

interface DepreciationReportFunctionalProps {
  cows: Cow[];
}

interface ReportSummary {
  activeCows: number;
  totalMonthlyDepreciation: number;
  totalCurrentValue: number;
  totalAccumulatedDepreciation: number;
  averageAge: number;
}

interface CowDepreciationData extends Cow {
  depreciationResult: DepreciationResult;
  monthlyAmount: number;
  isValid: boolean;
  error?: string;
}

// Pure function to calculate cow depreciation data
const calculateCowDepreciation = (cow: Cow): CowDepreciationData => {
  const input: DepreciationInput = {
    purchasePrice: cow.purchase_price,
    salvageValue: cow.salvage_value,
    freshenDate: new Date(cow.freshen_date),
    depreciationMethod: cow.depreciation_method as any,
  };

  const result = calculateCurrentDepreciation(input);
  
  if (isOk(result)) {
    return {
      ...cow,
      depreciationResult: result.data,
      monthlyAmount: result.data.monthlyDepreciation,
      isValid: true,
    };
  } else {
    return {
      ...cow,
      depreciationResult: {
        totalDepreciation: 0,
        currentValue: cow.purchase_price,
        monthlyDepreciation: 0,
        monthsSinceFreshen: 0,
        remainingMonths: 60,
      },
      monthlyAmount: 0,
      isValid: false,
      error: result.error.message,
    };
  }
};

// Pure function to calculate report summary
const calculateReportSummary = (cowData: CowDepreciationData[]): ReportSummary => {
  const activeCows = cowData.filter(cow => cow.status === 'active');
  
  return {
    activeCows: activeCows.length,
    totalMonthlyDepreciation: activeCows.reduce((sum, cow) => sum + cow.monthlyAmount, 0),
    totalCurrentValue: activeCows.reduce((sum, cow) => sum + cow.depreciationResult.currentValue, 0),
    totalAccumulatedDepreciation: activeCows.reduce((sum, cow) => sum + cow.depreciationResult.totalDepreciation, 0),
    averageAge: activeCows.length > 0 
      ? activeCows.reduce((sum, cow) => sum + cow.depreciationResult.monthsSinceFreshen, 0) / activeCows.length / 12
      : 0,
  };
};

// Pure function to filter cows by period
const filterCowsByPeriod = (
  cowData: CowDepreciationData[],
  month: number,
  year: number
): CowDepreciationData[] => {
  const periodDate = new Date(year, month - 1, 1);
  
  return cowData.filter(cow => {
    const freshenDate = new Date(cow.freshen_date);
    return freshenDate <= periodDate && cow.status === 'active';
  });
};

export function DepreciationReportFunctional({ cows }: DepreciationReportFunctionalProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isGenerating, setIsGenerating] = useState(false);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  // Memoized calculations for performance
  const cowDepreciationData = useMemo(() => {
    return cows.map(calculateCowDepreciation);
  }, [cows]);

  const filteredCowData = useMemo(() => {
    return filterCowsByPeriod(cowDepreciationData, selectedMonth, selectedYear);
  }, [cowDepreciationData, selectedMonth, selectedYear]);

  const reportSummary = useMemo(() => {
    return calculateReportSummary(filteredCowData);
  }, [filteredCowData]);

  const invalidCows = useMemo(() => {
    return cowDepreciationData.filter(cow => !cow.isValid);
  }, [cowDepreciationData]);

  // Generate months for selection
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2024, i, 1).toLocaleDateString('en-US', { month: 'long' })
  }));

  // Generate years for selection
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const handleGenerateJournalEntry = async () => {
    if (!currentCompany) {
      toast({
        title: "Error",
        description: "No company selected",
        variant: "destructive",
      });
      return;
    }

    if (reportSummary.totalMonthlyDepreciation === 0) {
      toast({
        title: "No Depreciation",
        description: "No depreciation to record for this period",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Call the database function to process monthly depreciation
      const { data, error } = await supabase.rpc('process_monthly_depreciation', {
        p_company_id: currentCompany.id,
        p_target_month: selectedMonth,
        p_target_year: selectedYear,
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Journal Entry Created",
          description: `Generated journal entry for ${formatCurrency(data.total_amount)} covering ${data.cows_processed} cows`,
        });
      } else {
        toast({
          title: "No Entry Created", 
          description: "No depreciation entry was needed for this period",
        });
      }

    } catch (error) {
      console.error('Error generating journal entry:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate journal entry",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const exportToCSV = () => {
    const csvData = filteredCowData.map(cow => ({
      'Tag Number': cow.tag_number,
      'Purchase Price': cow.purchase_price,
      'Salvage Value': cow.salvage_value,
      'Current Value': cow.depreciationResult.currentValue.toFixed(2),
      'Monthly Depreciation': cow.monthlyAmount.toFixed(2),
      'Total Depreciation': cow.depreciationResult.totalDepreciation.toFixed(2),
      'Months Since Freshen': cow.depreciationResult.monthsSinceFreshen,
      'Status': cow.status,
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `depreciation-report-${selectedYear}-${selectedMonth.toString().padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Depreciation report exported to CSV",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-8 w-8" />
            Depreciation Report
          </h2>
          <p className="text-muted-foreground">
            Monthly depreciation calculations and journal entry generation
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          
          <Button 
            onClick={handleGenerateJournalEntry}
            disabled={isGenerating || reportSummary.totalMonthlyDepreciation === 0}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Generate Journal Entry
          </Button>
        </div>
      </div>

      {/* Period Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Reporting Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-center">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(Number(value))}>
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
              <Label>Year</Label>
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(Number(value))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Warnings */}
      {invalidCows.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Validation Issues:</strong> {invalidCows.length} cow(s) have calculation errors and are excluded from the report.
            Check cow data for: {invalidCows.map(cow => cow.tag_number).join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Cows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportSummary.activeCows}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Depreciation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(reportSummary.totalMonthlyDepreciation)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Asset Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(reportSummary.totalCurrentValue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Accumulated Depreciation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(reportSummary.totalAccumulatedDepreciation)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cow Depreciation Details</CardTitle>
          <CardDescription>
            Individual cow depreciation calculations for {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag Number</TableHead>
                  <TableHead>Purchase Price</TableHead>
                  <TableHead>Current Value</TableHead>
                  <TableHead>Monthly Depreciation</TableHead>
                  <TableHead>Total Depreciation</TableHead>
                  <TableHead>Age (Months)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCowData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No cows found for selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCowData.map((cow) => (
                    <TableRow key={cow.id}>
                      <TableCell className="font-medium">{cow.tag_number}</TableCell>
                      <TableCell>{formatCurrency(cow.purchase_price)}</TableCell>
                      <TableCell className="text-green-600">
                        {formatCurrency(cow.depreciationResult.currentValue)}
                      </TableCell>
                      <TableCell className="text-orange-600">
                        {formatCurrency(cow.monthlyAmount)}
                      </TableCell>
                      <TableCell className="text-red-600">
                        {formatCurrency(cow.depreciationResult.totalDepreciation)}
                      </TableCell>
                      <TableCell>{cow.depreciationResult.monthsSinceFreshen}</TableCell>
                      <TableCell>
                        <Badge variant={cow.status === 'active' ? 'default' : 'secondary'}>
                          {cow.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Add missing Label component import
const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
    {children}
  </label>
);