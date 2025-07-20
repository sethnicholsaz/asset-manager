import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Download, Eye, Printer } from 'lucide-react';
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

  const printJournalEntry = (entry: JournalEntryWithLines) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalDebits = entry.lines.reduce((sum, line) => sum + line.debit_amount, 0);
    const totalCredits = entry.lines.reduce((sum, line) => sum + line.credit_amount, 0);
    
    // Create account summary
    const accountSummary = entry.lines.reduce((acc, line) => {
      const key = `${line.account_code} - ${line.account_name}`;
      if (!acc[key]) {
        acc[key] = { debits: 0, credits: 0, account_code: line.account_code, account_name: line.account_name };
      }
      acc[key].debits += line.debit_amount;
      acc[key].credits += line.credit_amount;
      return acc;
    }, {} as Record<string, { debits: number; credits: number; account_code: string; account_name: string }>);

    const accountSummaryArray = Object.values(accountSummary).sort((a, b) => a.account_code.localeCompare(b.account_code));

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Journal Entry - ${getMonthName(entry.month)} ${entry.year}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 40px;
              color: #333;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #333;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .company-name {
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .report-title {
              font-size: 18px;
              margin-bottom: 10px;
            }
            .entry-info {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
              padding: 15px;
              background-color: #f5f5f5;
              border-radius: 5px;
            }
            .entry-details {
              flex: 1;
            }
            .entry-meta {
              text-align: right;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 12px;
              text-align: left;
            }
            th {
              background-color: #f8f9fa;
              font-weight: bold;
            }
            .amount {
              text-align: right;
              font-family: monospace;
            }
            .totals {
              margin-top: 20px;
              padding: 15px;
              background-color: #f8f9fa;
              border-radius: 5px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 5px;
            }
            .footer {
              margin-top: 40px;
              text-align: center;
              font-size: 12px;
              color: #666;
              border-top: 1px solid #ddd;
              padding-top: 20px;
            }
            .status-badge {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: bold;
              ${entry.status === 'posted' ? 'background-color: #d4edda; color: #155724;' : 
                entry.status === 'draft' ? 'background-color: #fff3cd; color: #856404;' : 
                'background-color: #d1ecf1; color: #0c5460;'}
            }
            @media print {
              body { margin: 20px; }
              .header { page-break-after: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">${currentCompany?.name || 'Company Name'}</div>
            <div class="report-title">Journal Entry Report</div>
          </div>

          <div class="entry-info">
            <div class="entry-details">
              <h3>${getMonthName(entry.month)} ${entry.year} - ${entry.entry_type.charAt(0).toUpperCase() + entry.entry_type.slice(1)}</h3>
              <p><strong>Description:</strong> ${entry.description}</p>
              <p><strong>Entry Date:</strong> ${new Date(entry.entry_date).toLocaleDateString()}</p>
              <p><strong>Status:</strong> <span class="status-badge">${entry.status.toUpperCase()}</span></p>
            </div>
            <div class="entry-meta">
              <p><strong>Entry ID:</strong> ${entry.id.substring(0, 8)}</p>
              <p><strong>Created:</strong> ${new Date(entry.created_at).toLocaleDateString()}</p>
              <p><strong>Total Amount:</strong> ${DepreciationCalculator.formatCurrency(entry.total_amount)}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Account Code</th>
                <th>Account Name</th>
                <th>Description</th>
                <th class="amount">Debit</th>
                <th class="amount">Credit</th>
              </tr>
            </thead>
            <tbody>
              ${entry.lines.map(line => `
                <tr>
                  <td>${line.account_code}</td>
                  <td>${line.account_name}</td>
                  <td>${line.description}</td>
                  <td class="amount">${line.debit_amount > 0 ? DepreciationCalculator.formatCurrency(line.debit_amount) : '-'}</td>
                  <td class="amount">${line.credit_amount > 0 ? DepreciationCalculator.formatCurrency(line.credit_amount) : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="totals">
            <h4 style="margin-bottom: 15px; color: #333;">Account Summary</h4>
            <table style="margin-bottom: 20px; font-size: 14px;">
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th class="amount">Total Debits</th>
                  <th class="amount">Total Credits</th>
                  <th class="amount">Net Amount</th>
                </tr>
              </thead>
              <tbody>
                ${accountSummaryArray.map(account => {
                  const netAmount = account.debits - account.credits;
                  return `
                    <tr>
                      <td>${account.account_code}</td>
                      <td>${account.account_name}</td>
                      <td class="amount">${account.debits > 0 ? DepreciationCalculator.formatCurrency(account.debits) : '-'}</td>
                      <td class="amount">${account.credits > 0 ? DepreciationCalculator.formatCurrency(account.credits) : '-'}</td>
                      <td class="amount" style="${netAmount > 0 ? 'color: #d73527;' : netAmount < 0 ? 'color: #28a745;' : ''}">${netAmount !== 0 ? DepreciationCalculator.formatCurrency(Math.abs(netAmount)) + (netAmount > 0 ? ' DR' : ' CR') : '-'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="totals" style="background-color: ${totalDebits === totalCredits ? '#d4edda' : '#f8d7da'};">
            <h4 style="margin-bottom: 15px; color: #333;">Journal Entry Totals</h4>
            <div class="total-row">
              <strong>Total Debits:</strong>
              <strong>${DepreciationCalculator.formatCurrency(totalDebits)}</strong>
            </div>
            <div class="total-row">
              <strong>Total Credits:</strong>
              <strong>${DepreciationCalculator.formatCurrency(totalCredits)}</strong>
            </div>
            <div class="total-row" style="border-top: 2px solid #333; padding-top: 10px; margin-top: 10px; font-size: 16px;">
              <strong>Balance Check:</strong>
              <strong style="color: ${totalDebits === totalCredits ? '#28a745' : '#d73527'};">${totalDebits === totalCredits ? 'BALANCED ✓' : `UNBALANCED by ${DepreciationCalculator.formatCurrency(Math.abs(totalDebits - totalCredits))} ⚠️`}</strong>
            </div>
            ${totalDebits !== totalCredits ? `
              <div style="margin-top: 15px; padding: 10px; background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px;">
                <strong style="color: #856404;">⚠️ ATTENTION:</strong> This journal entry does not balance. The difference of ${DepreciationCalculator.formatCurrency(Math.abs(totalDebits - totalCredits))} needs to be investigated.
              </div>
            ` : ''}
          </div>

          <div class="footer">
            <p>Generated on ${new Date().toLocaleString()}</p>
            <p>This is a computer-generated report from the ${currentCompany?.name || 'Company'} accounting system.</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    
    // Auto-print after a short delay to ensure content is loaded
    setTimeout(() => {
      printWindow.print();
    }, 500);
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
                    onClick={() => printJournalEntry(entry)}
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Print
                  </Button>
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