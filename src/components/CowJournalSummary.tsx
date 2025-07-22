import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Search, TrendingUp, TrendingDown, DollarSign, Calculator } from 'lucide-react';
import { format } from 'date-fns';

interface CowJournalEntry {
  id: string;
  entry_date: string;
  entry_type: string;
  description: string;
  account_code: string;
  account_name: string;
  debit_amount: number;
  credit_amount: number;
  line_type: string;
}

interface CowSummary {
  cow_id: string;
  tag_number: string;
  name?: string;
  status: string;
  purchase_price: number;
  current_value: number;
  total_depreciation: number;
  journal_entries: CowJournalEntry[];
  acquisition_total: number;
  depreciation_total: number;
  disposition_total: number;
  net_balance: number;
}

interface CowJournalSummaryProps {
  cowId?: string; // If provided, show only this cow's entries
}

export default function CowJournalSummary({ cowId }: CowJournalSummaryProps) {
  const { currentCompany } = useAuth();
  const { toast } = useToast();
  const [cowSummaries, setCowSummaries] = useState<CowSummary[]>([]);
  const [filteredSummaries, setFilteredSummaries] = useState<CowSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCow, setSelectedCow] = useState<string | null>(null);

  useEffect(() => {
    if (currentCompany) {
      loadCowJournalSummaries();
    }
  }, [currentCompany]);

  useEffect(() => {
    const filtered = cowSummaries.filter(cow => 
      cow.tag_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cow.name && cow.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredSummaries(filtered);
  }, [searchTerm, cowSummaries]);

  const loadCowJournalSummaries = async () => {
    if (!currentCompany) return;

    try {
      setIsLoading(true);

      // Get cows - either specific cow or all cows
      let cowQuery = supabase
        .from('cows')
        .select('id, tag_number, name, status, purchase_price, current_value, total_depreciation')
        .eq('company_id', currentCompany.id);
      
      if (cowId) {
        cowQuery = cowQuery.eq('id', cowId);
      } else {
        cowQuery = cowQuery.order('tag_number');
      }

      const { data: cows, error: cowsError } = await cowQuery;

      if (cowsError) throw cowsError;

      // Get all journal entries for these cows
      const cowIds = cows.map(cow => cow.id);
      
      const { data: journalLines, error: journalError } = await supabase
        .from('journal_lines')
        .select(`
          id,
          description,
          account_code,
          account_name,
          debit_amount,
          credit_amount,
          line_type,
          cow_id,
          journal_entries!inner (
            entry_date,
            entry_type,
            description,
            company_id
          )
        `)
        .in('cow_id', cowIds)
        .eq('journal_entries.company_id', currentCompany.id)
        .order('journal_entries(entry_date)', { ascending: true });

      if (journalError) throw journalError;

      // Process the data to create summaries
      const summaries: CowSummary[] = cows.map(cow => {
        const cowJournalEntries = journalLines
          .filter(line => line.cow_id === cow.id)
          .map(line => ({
            id: line.id,
            entry_date: line.journal_entries.entry_date,
            entry_type: line.journal_entries.entry_type,
            description: line.description,
            account_code: line.account_code,
            account_name: line.account_name,
            debit_amount: line.debit_amount || 0,
            credit_amount: line.credit_amount || 0,
            line_type: line.line_type
          }));

        // Calculate totals by entry type
        const acquisitionEntries = cowJournalEntries.filter(entry => entry.entry_type === 'acquisition');
        const depreciationEntries = cowJournalEntries.filter(entry => entry.entry_type === 'depreciation');
        const dispositionEntries = cowJournalEntries.filter(entry => entry.entry_type === 'disposition');

        const acquisitionTotal = acquisitionEntries.reduce((sum, entry) => 
          sum + entry.debit_amount - entry.credit_amount, 0);
        
        const depreciationTotal = depreciationEntries.reduce((sum, entry) => 
          entry.account_code.includes('1500.1') ? sum + entry.debit_amount : sum, 0); // Accumulated Depreciation debits
        
        const dispositionTotal = dispositionEntries.reduce((sum, entry) => 
          sum + entry.debit_amount - entry.credit_amount, 0);

        // Net balance should be close to 0 for disposed cows
        const netBalance = acquisitionTotal - depreciationTotal + dispositionTotal;

        return {
          cow_id: cow.id,
          tag_number: cow.tag_number,
          name: cow.name,
          status: cow.status,
          purchase_price: cow.purchase_price,
          current_value: cow.current_value,
          total_depreciation: cow.total_depreciation,
          journal_entries: cowJournalEntries,
          acquisition_total: acquisitionTotal,
          depreciation_total: depreciationTotal,
          disposition_total: dispositionTotal,
          net_balance: netBalance
        };
      });

      setCowSummaries(summaries);
    } catch (error) {
      console.error('Error loading cow journal summaries:', error);
      toast({
        title: "Error",
        description: "Failed to load cow journal summaries",
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'sold': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'deceased': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const getBalanceColor = (balance: number) => {
    const absBalance = Math.abs(balance);
    if (absBalance < 1) return 'text-green-600'; // Balanced
    if (absBalance < 100) return 'text-yellow-600'; // Minor variance
    return 'text-red-600'; // Significant variance
  };

  const getEntryTypeIcon = (entryType: string) => {
    switch (entryType) {
      case 'acquisition': return <DollarSign className="h-4 w-4 text-green-600" />;
      case 'depreciation': return <TrendingDown className="h-4 w-4 text-orange-600" />;
      case 'disposition': return <TrendingUp className="h-4 w-4 text-red-600" />;
      default: return <Calculator className="h-4 w-4 text-gray-600" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Cow Journal Summary</h2>
          <p className="text-muted-foreground">
            Complete journal lifecycle for each cow - acquisition, depreciation, and disposition
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by tag number or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Cows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredSummaries.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Balanced Cows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {filteredSummaries.filter(cow => Math.abs(cow.net_balance) < 1).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Minor Variances</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {filteredSummaries.filter(cow => Math.abs(cow.net_balance) >= 1 && Math.abs(cow.net_balance) < 100).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Significant Variances</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {filteredSummaries.filter(cow => Math.abs(cow.net_balance) >= 100).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cow Summaries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cow Journal Balances</CardTitle>
          <CardDescription>
            Traditional accounting view showing all journal entries by cow with totals. Net balance should be near $0 for disposed cows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Journal Entries</TableHead>
                  <TableHead className="text-right">Net Balance</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummaries.map((cow) => (
                  <React.Fragment key={cow.cow_id}>
                    <TableRow>
                      <TableCell className="font-medium">{cow.tag_number}</TableCell>
                      <TableCell>{cow.name || '-'}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(cow.status)}>
                          {cow.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">
                          {cow.journal_entries.length}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono font-bold ${getBalanceColor(cow.net_balance)}`}>
                        {formatCurrency(cow.net_balance)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedCow(selectedCow === cow.cow_id ? null : cow.cow_id)}
                        >
                          {selectedCow === cow.cow_id ? 'Hide' : 'Details'}
                        </Button>
                      </TableCell>
                    </TableRow>
                    
                    {/* Detailed Journal Entries in Accounting Format */}
                    {selectedCow === cow.cow_id && (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <div className="bg-muted/50 p-6">
                            <h4 className="font-semibold mb-4">Journal Entries for Cow #{cow.tag_number}</h4>
                            
                            {/* Accounting Table Format */}
                            <div className="border rounded-lg overflow-hidden bg-white">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-1/4">Account</TableHead>
                                    <TableHead className="w-1/4">Description</TableHead>
                                    <TableHead className="w-1/6 text-right">Debit</TableHead>
                                    <TableHead className="w-1/6 text-right">Credit</TableHead>
                                    <TableHead className="w-1/6 text-center">Type</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {cow.journal_entries.map((entry, index) => (
                                    <TableRow key={entry.id}>
                                      <TableCell>
                                        <div>
                                          <p className="font-medium">{entry.account_code}</p>
                                          <p className="text-sm text-muted-foreground">{entry.account_name}</p>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div>
                                          <p className="text-sm">{entry.description}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {format(new Date(entry.entry_date), 'MMM dd, yyyy')}
                                          </p>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : '-'}
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : '-'}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <div className="flex items-center justify-center">
                                          {getEntryTypeIcon(entry.entry_type)}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  
                                  {/* Totals Row */}
                                  <TableRow className="border-t-2 border-double bg-muted/30">
                                    <TableCell className="font-bold">TOTALS</TableCell>
                                    <TableCell className="font-medium text-muted-foreground">
                                      Net position for Cow #{cow.tag_number}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold">
                                      {formatCurrency(
                                        cow.journal_entries.reduce((sum, entry) => sum + entry.debit_amount, 0)
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold">
                                      {formatCurrency(
                                        cow.journal_entries.reduce((sum, entry) => sum + entry.credit_amount, 0)
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Badge 
                                        variant={Math.abs(cow.net_balance) < 1 ? "default" : "destructive"}
                                        className={getBalanceColor(cow.net_balance)}
                                      >
                                        {Math.abs(cow.net_balance) < 1 ? 'Balanced' : 'Variance'}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                  
                                  {/* Net Balance Row */}
                                  <TableRow className="bg-muted/50">
                                    <TableCell colSpan={2} className="font-bold">
                                      NET BALANCE (Debits - Credits)
                                    </TableCell>
                                    <TableCell colSpan={2} className={`text-right font-mono font-bold text-lg ${getBalanceColor(cow.net_balance)}`}>
                                      {formatCurrency(cow.net_balance)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {Math.abs(cow.net_balance) < 1 ? (
                                        <span className="text-green-600 text-sm">✓ Balanced</span>
                                      ) : (
                                        <span className="text-red-600 text-sm">⚠ Variance</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}