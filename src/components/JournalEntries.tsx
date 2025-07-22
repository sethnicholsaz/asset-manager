import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, Calendar, DollarSign, Filter, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';

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
  journal_lines?: JournalLine[];
}

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  line_type: string;
  cow_id: string | null;
}

export function JournalEntries() {
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentCompany) {
      fetchJournalEntries();
    }
  }, [currentCompany, filterYear, filterType]);

  const fetchJournalEntries = async () => {
    if (!currentCompany) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from('journal_entries')
        .select(`
          *,
          journal_lines(*)
        `)
        .eq('company_id', currentCompany.id)
        .order('entry_date', { ascending: false });

      if (filterYear !== 'all') {
        query = query.eq('year', parseInt(filterYear));
      }

      if (filterType !== 'all') {
        query = query.eq('entry_type', filterType);
      }

      const { data, error } = await query;

      if (error) throw error;

      const filteredData = data?.filter(entry => {
        if (!searchTerm) return true;
        return entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
               entry.entry_type.toLowerCase().includes(searchTerm.toLowerCase());
      }) || [];

      setJournalEntries(filteredData);
    } catch (error) {
      console.error('Error fetching journal entries:', error);
      toast({
        title: "Error",
        description: "Failed to load journal entries",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleEntryExpansion = (entryId: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedEntries(newExpanded);
  };

  const getAvailableYears = () => {
    const years = [...new Set(journalEntries.map(entry => entry.year))].sort((a, b) => b - a);
    return years;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getEntryTypeColor = (type: string) => {
    switch (type) {
      case 'depreciation': return 'bg-blue-100 text-blue-800';
      case 'disposition': return 'bg-red-100 text-red-800';
      case 'acquisition': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Journal Entries
          </CardTitle>
          <CardDescription>
            View monthly depreciation and transaction journal entries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search entries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-48"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year-filter">Year</Label>
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {getAvailableYears().map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type-filter">Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="depreciation">Depreciation</SelectItem>
                  <SelectItem value="disposition">Disposition</SelectItem>
                  <SelectItem value="acquisition">Acquisition</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={fetchJournalEntries} variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Journal Entries Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journalEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No journal entries found. Run the "Process History" function in Depreciation Settings to generate entries.
                  </TableCell>
                </TableRow>
              ) : (
                journalEntries.map((entry) => (
                  <>
                    <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleEntryExpansion(entry.id)}
                        >
                          {expandedEntries.has(entry.id) ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(entry.entry_date), 'MMM dd, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getEntryTypeColor(entry.entry_type)}>
                          {entry.entry_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {entry.description}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <div className="flex items-center justify-end gap-1">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          {formatCurrency(entry.total_amount)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.status === 'posted' ? 'default' : 'secondary'}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {expandedEntries.has(entry.id) && entry.journal_lines && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/20 p-0">
                          <div className="p-4">
                            <h4 className="font-medium mb-3">Journal Lines</h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Account</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead className="text-right">Debit</TableHead>
                                  <TableHead className="text-right">Credit</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {entry.journal_lines.map((line) => (
                                  <TableRow key={line.id}>
                                    <TableCell>
                                      <div>
                                        <div className="font-mono text-sm">{line.account_code}</div>
                                        <div className="text-xs text-muted-foreground">{line.account_name}</div>
                                      </div>
                                    </TableCell>
                                    <TableCell>{line.description}</TableCell>
                                    <TableCell className="text-right font-mono">
                                      {line.debit_amount > 0 ? formatCurrency(line.debit_amount) : '-'}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {line.credit_amount > 0 ? formatCurrency(line.credit_amount) : '-'}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}