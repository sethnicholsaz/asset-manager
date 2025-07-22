import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Calendar, DollarSign, TrendingDown, FileText, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface CowDetails {
  id: string;
  tag_number: string;
  name?: string;
  birth_date: string;
  freshen_date: string;
  purchase_price: number;
  salvage_value: number;
  current_value: number;
  total_depreciation: number;
  status: string;
  acquisition_type: string;
  depreciation_method: string;
  company_id: string;
  disposition_id?: string;
  created_at: string;
  updated_at: string;
}



interface Disposition {
  id: string;
  disposition_date: string;
  disposition_type: string;
  sale_amount: number;
  final_book_value: number;
  gain_loss: number;
  notes?: string;
}

interface HistoricalDepreciation {
  id: string;
  entry_date: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  account_code: string;
  account_name: string;
  month: number;
  year: number;
}

export default function CowDetail() {
  const { cowId } = useParams<{ cowId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentCompany } = useAuth();
  
  const [cow, setCow] = useState<CowDetails | null>(null);
  const [disposition, setDisposition] = useState<Disposition | null>(null);
  const [historicalDepreciation, setHistoricalDepreciation] = useState<HistoricalDepreciation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (cowId && currentCompany) {
      loadCowDetails();
    }
  }, [cowId, currentCompany]);

  const loadCowDetails = async () => {
    if (!cowId || !currentCompany) return;

    try {
      setIsLoading(true);

      // Load cow details
      const { data: cowData, error: cowError } = await supabase
        .from('cows')
        .select('*')
        .eq('id', cowId)
        .eq('company_id', currentCompany.id)
        .single();

      if (cowError) {
        if (cowError.code === 'PGRST116') {
          toast({
            title: "Cow not found",
            description: "The requested cow could not be found.",
            variant: "destructive",
          });
          navigate('/');
          return;
        }
        throw cowError;
      }

      setCow(cowData);


      // Load disposition - check for any disposition record for this cow
      const { data: dispositionData, error: dispositionError } = await supabase
        .from('cow_dispositions')
        .select('*')
        .eq('cow_id', cowId)
        .eq('company_id', currentCompany.id)
        .single();

      if (dispositionError && dispositionError.code !== 'PGRST116') {
        console.error('Error loading disposition:', dispositionError);
      } else if (dispositionData) {
        setDisposition(dispositionData);
      }

    } catch (error) {
      console.error('Error loading cow details:', error);
      toast({
        title: "Error",
        description: "Failed to load cow details",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'sold': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'deceased': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const loadHistoricalDepreciation = async () => {
    if (!cowId || !currentCompany) return;

    try {
      setIsLoadingHistory(true);
      
      // Query journal lines that belong to this specific cow
      const { data: journalData, error: journalError } = await supabase
        .from('journal_lines')
        .select(`
          id,
          description,
          debit_amount,
          credit_amount,
          account_code,
          account_name,
          journal_entries!inner (
            entry_date,
            month,
            year,
            company_id
          )
        `)
        .eq('cow_id', cowId)
        .eq('journal_entries.company_id', currentCompany.id)
        .eq('journal_entries.entry_type', 'depreciation')
        .order('journal_entries(entry_date)', { ascending: false });

      if (journalError) throw journalError;

      // Transform the data to match our interface
      const transformedData: HistoricalDepreciation[] = journalData.map((item: any) => ({
        id: item.id,
        entry_date: item.journal_entries.entry_date,
        description: item.description,
        debit_amount: item.debit_amount,
        credit_amount: item.credit_amount,
        account_code: item.account_code,
        account_name: item.account_name,
        month: item.journal_entries.month,
        year: item.journal_entries.year,
      }));

      setHistoricalDepreciation(transformedData);
    } catch (error) {
      console.error('Error loading historical depreciation:', error);
      toast({
        title: "Error",
        description: "Failed to load historical depreciation data",
        variant: "destructive",
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!cow) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Cow not found</h2>
          <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              Cow #{cow.tag_number}
              {cow.name && <span className="text-muted-foreground"> - {cow.name}</span>}
            </h1>
            <div className="flex items-center space-x-2 mt-1">
              <Badge className={getStatusColor(cow.status)}>
                {cow.status.charAt(0).toUpperCase() + cow.status.slice(1)}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Last updated: {format(new Date(cow.updated_at), 'PPP')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Purchase Price</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(cow.purchase_price)}</div>
            <p className="text-xs text-muted-foreground">
              Acquired via {cow.acquisition_type}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Value</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(cow.current_value)}</div>
            <p className="text-xs text-muted-foreground">
              After depreciation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Depreciation</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(cow.total_depreciation)}</div>
            <p className="text-xs text-muted-foreground">
              {cow.depreciation_method} method
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Age</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.floor((new Date().getTime() - new Date(cow.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years
            </div>
            <p className="text-xs text-muted-foreground">
              Born {format(new Date(cow.birth_date), 'PPP')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Information */}
      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="depreciation">Depreciation Summary</TabsTrigger>
          <TabsTrigger value="history" onClick={() => historicalDepreciation.length === 0 && loadHistoricalDepreciation()}>
            Historical Depreciation
          </TabsTrigger>
          {disposition && <TabsTrigger value="disposition">Disposition</TabsTrigger>}
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Cow Details</CardTitle>
              <CardDescription>Complete information about this cow</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Tag Number</label>
                    <p className="text-lg">{cow.tag_number}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Name</label>
                    <p className="text-lg">{cow.name || 'Not specified'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Birth Date</label>
                    <p className="text-lg">{format(new Date(cow.birth_date), 'PPP')}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Freshen Date</label>
                    <p className="text-lg">{format(new Date(cow.freshen_date), 'PPP')}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <p className="text-lg capitalize">{cow.status}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Acquisition Type</label>
                    <p className="text-lg capitalize">{cow.acquisition_type}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Salvage Value</label>
                    <p className="text-lg">{formatCurrency(cow.salvage_value)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Depreciation Method</label>
                    <p className="text-lg capitalize">{cow.depreciation_method.replace('-', ' ')}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="depreciation">
          <Card>
            <CardHeader>
              <CardTitle>Depreciation Summary</CardTitle>
              <CardDescription>
                Overall depreciation information for this cow. Detailed records are tracked in journal entries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Total Depreciation</label>
                  <p className="text-2xl font-bold">{formatCurrency(cow.total_depreciation)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Current Asset Value</label>
                  <p className="text-2xl font-bold">{formatCurrency(cow.current_value)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Depreciation Method</label>
                  <p className="text-2xl font-bold capitalize">{cow.depreciation_method.replace('-', ' ')}</p>
                </div>
              </div>
              <Separator className="my-6" />
              <div className="text-sm text-muted-foreground">
                <FileText className="h-4 w-4 inline mr-2" />
                Depreciation is calculated in real-time based on cow age and purchase price
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Historical Depreciation</CardTitle>
              <CardDescription>
                Detailed monthly depreciation journal entries for this cow
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : historicalDepreciation.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No Depreciation History</p>
                  <p className="text-sm">
                    No monthly depreciation journal entries have been recorded for this cow yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {historicalDepreciation.length} journal entries
                    </p>
                    <div className="text-sm text-muted-foreground">
                      Total Historical Depreciation: {formatCurrency(
                        historicalDepreciation
                          .filter(entry => entry.debit_amount > 0)
                          .reduce((sum, entry) => sum + entry.debit_amount, 0)
                      )}
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historicalDepreciation.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              {format(new Date(entry.entry_date), 'MMM dd, yyyy')}
                            </TableCell>
                            <TableCell>
                              {format(new Date(entry.year, entry.month - 1), 'MMM yyyy')}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">{entry.account_code}</p>
                                <p className="text-sm text-muted-foreground">{entry.account_name}</p>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <p className="text-sm truncate" title={entry.description}>
                                {entry.description}
                              </p>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        {disposition && (
          <TabsContent value="disposition">
            <Card>
              <CardHeader>
                <CardTitle>Disposition Details</CardTitle>
                <CardDescription>Information about how this cow was disposed</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Disposition Type</label>
                      <p className="text-lg capitalize">{disposition.disposition_type}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Disposition Date</label>
                      <p className="text-lg">{format(new Date(disposition.disposition_date), 'PPP')}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Sale Amount</label>
                      <p className="text-lg">{formatCurrency(disposition.sale_amount)}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Final Book Value</label>
                      <p className="text-lg">{formatCurrency(disposition.final_book_value)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Gain/Loss</label>
                      <p className={`text-lg ${disposition.gain_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(disposition.gain_loss)}
                        {disposition.gain_loss >= 0 ? ' (Gain)' : ' (Loss)'}
                      </p>
                    </div>
                    {disposition.notes && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Notes</label>
                        <p className="text-lg">{disposition.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}