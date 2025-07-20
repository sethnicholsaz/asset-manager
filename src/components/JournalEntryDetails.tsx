import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Download, Eye } from 'lucide-react';
import { DepreciationCalculator } from '@/utils/depreciation';

interface JournalEntry {
  id: string;
  entry_date: string;
  month: number;
  year: number;
  entry_type: string;
  description: string;
  total_amount: number;
  status: string;
  created_at: string;
}

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  line_type: string;
  created_at: string;
}

interface JournalEntryWithLines extends JournalEntry {
  lines: JournalLine[];
}

export default function JournalEntryDetails() {
  const { currentCompany } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [journalEntries, setJournalEntries] = useState<JournalEntryWithLines[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);

  useEffect(() => {
    if (currentCompany) {
      fetchJournalEntries();
    }
  }, [currentCompany, selectedYear]);

  const fetchJournalEntries = async () => {
    if (!currentCompany) return;

    setIsLoading(true);
    try {
      // Fetch journal entries for the selected year
      const { data: entries, error: entriesError } = await supabase
        .from('stored_journal_entries')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('year', selectedYear)
        .order('month', { ascending: false });

      if (entriesError) throw entriesError;

      // Fetch journal lines for all entries
      const entryIds = entries?.map(e => e.id) || [];
      const { data: lines, error: linesError } = await supabase
        .from('stored_journal_lines')
        .select('*')
        .in('journal_entry_id', entryIds)
        .order('line_type', { ascending: false });

      if (linesError) throw linesError;

      // Combine entries with their lines
      const entriesWithLines: JournalEntryWithLines[] = entries?.map(entry => ({
        ...entry,
        lines: lines?.filter(line => line.journal_entry_id === entry.id) || []
      })) || [];

      setJournalEntries(entriesWithLines);
    } catch (error) {
      console.error('Error fetching journal entries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportToCsv = () => {
    const csvRows = ['Entry Date,Type,Description,Account Code,Account Name,Line Description,Debit,Credit,Status'];
    
    journalEntries.forEach(entry => {
      entry.lines.forEach(line => {
        csvRows.push([
          entry.entry_date,
          entry.entry_type,
          entry.description,
          line.account_code,
          line.account_name,
          line.description,
          line.debit_amount.toString(),
          line.credit_amount.toString(),
          entry.status
        ].join(','));
      });
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-entries-${selectedYear}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getMonthName = (month: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'posted': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'exported': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Journal Entry Details</h2>
        <div className="flex items-center gap-4">
          <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025, 2026].map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={exportToCsv} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {journalEntries.map((entry) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {getMonthName(entry.month)} {entry.year} - {entry.entry_type.charAt(0).toUpperCase() + entry.entry_type.slice(1)}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(entry.status)}>
                    {entry.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEntry(selectedEntry === entry.id ? null : entry.id)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {selectedEntry === entry.id ? 'Hide' : 'View'} Details
                  </Button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>{entry.description}</p>
                <p>Total Amount: {DepreciationCalculator.formatCurrency(entry.total_amount)}</p>
                <p>Created: {new Date(entry.created_at).toLocaleDateString()}</p>
              </div>
            </CardHeader>
            
            {selectedEntry === entry.id && (
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Code</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entry.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-mono">{line.account_code}</TableCell>
                        <TableCell>{line.account_name}</TableCell>
                        <TableCell>{line.description}</TableCell>
                        <TableCell className="text-right">
                          {line.debit_amount > 0 ? DepreciationCalculator.formatCurrency(line.debit_amount) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {line.credit_amount > 0 ? DepreciationCalculator.formatCurrency(line.credit_amount) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {journalEntries.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <p>No journal entries found for {selectedYear}.</p>
              <p className="text-sm mt-2">Journal entries are automatically created on the 5th of each month.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}