import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Download, FileText } from 'lucide-react';

interface AccountSummary {
  accountCode: string;
  accountName: string;
  totalDebits: number;
  totalCredits: number;
  netBalance: number;
}

interface JournalLine {
  account_code: string;
  account_name: string;
  debit_amount: number;
  credit_amount: number;
}

export function AccountSummaryReport() {
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [accountSummaries, setAccountSummaries] = useState<AccountSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  const generateReport = async () => {
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
      console.log(`Generating account summary for ${month}/${year}, company: ${currentCompany.id}`);

      // Fetch all journal lines for the selected month/year directly with pagination
      let allJournalLines: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: journalLines, error: linesError } = await supabase
          .from('journal_lines')
          .select(`
            account_code,
            account_name,
            debit_amount,
            credit_amount,
            journal_entries!inner (
              company_id,
              month,
              year
            )
          `)
          .eq('journal_entries.company_id', currentCompany.id)
          .eq('journal_entries.month', month)
          .eq('journal_entries.year', year)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (linesError) {
          console.error('Error fetching journal lines:', linesError);
          throw linesError;
        }

        if (journalLines && journalLines.length > 0) {
          allJournalLines = allJournalLines.concat(journalLines);
          page++;
          console.log(`Fetched page ${page}: ${journalLines.length} lines (total: ${allJournalLines.length})`);
        } else {
          hasMore = false;
        }
      }

      console.log(`Found ${allJournalLines.length} total journal lines`);

      // Process journal lines directly
      const allLines: JournalLine[] = allJournalLines;

      console.log(`Processing ${allLines.length} journal lines`);

      // Group by account and sum debits/credits
      const accountMap = new Map<string, AccountSummary>();
      const accountLineCounts = new Map<string, number>();

      allLines.forEach((line, index) => {
        const key = `${line.account_code}-${line.account_name}`;
        
        // Track line counts per account
        accountLineCounts.set(key, (accountLineCounts.get(key) || 0) + 1);
        
        if (!accountMap.has(key)) {
          accountMap.set(key, {
            accountCode: line.account_code,
            accountName: line.account_name,
            totalDebits: 0,
            totalCredits: 0,
            netBalance: 0
          });
        }

        const account = accountMap.get(key)!;
        account.totalDebits += line.debit_amount || 0;
        account.totalCredits += line.credit_amount || 0;
        account.netBalance = account.totalDebits - account.totalCredits;
        
        // Log first few lines being processed
        if (index < 10) {
          console.log(`Processing line ${index + 1}: ${line.account_code} - Debit: ${line.debit_amount} - Credit: ${line.credit_amount}`);
        }
      });

      console.log('Account line counts:');
      accountLineCounts.forEach((count, key) => {
        console.log(`${key}: ${count} lines`);
      });

      // Convert to array and sort by account code
      const summaries = Array.from(accountMap.values()).sort((a, b) => 
        a.accountCode.localeCompare(b.accountCode)
      );

      console.log('Final account summaries:');
      summaries.forEach(summary => {
        console.log(`${summary.accountCode} - ${summary.accountName}: Debits: ${summary.totalDebits}, Credits: ${summary.totalCredits}, Net: ${summary.netBalance}`);
      });

      const totalDebits = summaries.reduce((sum, account) => sum + account.totalDebits, 0);
      const totalCredits = summaries.reduce((sum, account) => sum + account.totalCredits, 0);
      console.log(`TOTALS: Debits: ${totalDebits}, Credits: ${totalCredits}, Net: ${totalDebits - totalCredits}`);

      setAccountSummaries(summaries);

      toast({
        title: "Success",
        description: `Generated account summary for ${month}/${year} with ${summaries.length} accounts`,
      });

    } catch (error) {
      console.error('Error generating account summary:', error);
      toast({
        title: "Error",
        description: "Failed to generate account summary report",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const exportToCSV = () => {
    if (accountSummaries.length === 0) {
      toast({
        title: "No Data",
        description: "Please generate a report first",
        variant: "destructive",
      });
      return;
    }

    const headers = ['Account Code', 'Account Name', 'Total Debits', 'Total Credits', 'Net Balance'];
    const csvContent = [
      headers.join(','),
      ...accountSummaries.map(account => [
        account.accountCode,
        `"${account.accountName}"`,
        account.totalDebits.toFixed(2),
        account.totalCredits.toFixed(2),
        account.netBalance.toFixed(2)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `account-summary-${month}-${year}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const totalDebits = accountSummaries.reduce((sum, account) => sum + account.totalDebits, 0);
  const totalCredits = accountSummaries.reduce((sum, account) => sum + account.totalCredits, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Account Summary Report
          </CardTitle>
          <CardDescription>
            Generate a summary of debits and credits for each account for a specific month
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
          
          <div className="flex gap-2">
            <Button 
              onClick={generateReport} 
              disabled={isLoading || !currentCompany}
              className="flex items-center gap-2"
            >
              {isLoading ? 'Generating...' : 'Generate Report'}
            </Button>
            
            {accountSummaries.length > 0 && (
              <Button 
                variant="outline" 
                onClick={exportToCSV}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {accountSummaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Account Summary for {month}/{year}</CardTitle>
            <CardDescription>
              Showing {accountSummaries.length} accounts with activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead className="text-right">Total Debits</TableHead>
                    <TableHead className="text-right">Total Credits</TableHead>
                    <TableHead className="text-right">Net Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountSummaries.map((account, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono">{account.accountCode}</TableCell>
                      <TableCell>{account.accountName}</TableCell>
                      <TableCell className="text-right">
                        {account.totalDebits > 0 ? formatCurrency(account.totalDebits) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {account.totalCredits > 0 ? formatCurrency(account.totalCredits) : '-'}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${
                        account.netBalance > 0 ? 'text-green-600' : 
                        account.netBalance < 0 ? 'text-red-600' : 
                        'text-muted-foreground'
                      }`}>
                        {formatCurrency(account.netBalance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold bg-muted/50">
                    <TableCell colSpan={2}>TOTALS</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalDebits)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalCredits)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalDebits - totalCredits)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}