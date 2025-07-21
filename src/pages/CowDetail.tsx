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


interface JournalEntry {
  id: string;
  description: string;
  entry_date: string;
  entry_type: string;
  total_amount: number;
  posting_period?: string;
  journal_lines: Array<{
    account_code: string;
    account_name: string;
    description: string;
    line_type: string;
    debit_amount: number;
    credit_amount: number;
  }>;
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

export default function CowDetail() {
  const { cowId } = useParams<{ cowId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentCompany } = useAuth();
  
  const [cow, setCow] = useState<CowDetails | null>(null);
  
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [disposition, setDisposition] = useState<Disposition | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

      // Load related journal entries for this cow
      console.log('Searching for journal entries with cow tag:', cowData.tag_number);
      const { data: journalData, error: journalError } = await supabase
        .from('journal_entries')
        .select(`
          id,
          description,
          entry_date,
          entry_type,
          total_amount,
          posting_period,
          journal_lines (
            account_code,
            account_name,
            description,
            line_type,
            debit_amount,
            credit_amount
          )
        `)
        .eq('company_id', currentCompany.id)
        .ilike('description', `%Cow #${cowData.tag_number}%`)
        .order('entry_date', { ascending: false });

      if (journalError) throw journalError;
      console.log('Journal entries found:', journalData?.length || 0);
      setJournalEntries(journalData || []);

      // Load disposition if exists
      if (cowData.disposition_id) {
        const { data: dispositionData, error: dispositionError } = await supabase
          .from('cow_dispositions')
          .select('*')
          .eq('cow_id', cowId)
          .single();

        if (dispositionError && dispositionError.code !== 'PGRST116') {
          throw dispositionError;
        }
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
          <TabsTrigger value="journals">Journal Entries</TabsTrigger>
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
                Detailed depreciation records are available in the Journal Entries tab
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journals">
          <Card>
            <CardHeader>
              <CardTitle>Related Journal Entries</CardTitle>
              <CardDescription>All journal entries related to this cow</CardDescription>
            </CardHeader>
            <CardContent>
              {journalEntries.length > 0 ? (
                <div className="space-y-4">
                  {journalEntries.map((entry) => (
                    <div key={entry.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-medium">{entry.description}</h4>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(entry.entry_date), 'PPP')} • {entry.entry_type} • {entry.posting_period}
                          </p>
                        </div>
                        <Badge variant="outline">{formatCurrency(entry.total_amount)}</Badge>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Debit</TableHead>
                            <TableHead>Credit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entry.journal_lines.map((line, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{line.account_code}</div>
                                  <div className="text-sm text-muted-foreground">{line.account_name}</div>
                                </div>
                              </TableCell>
                              <TableCell>{line.description}</TableCell>
                              <TableCell>
                                {line.debit_amount > 0 && formatCurrency(line.debit_amount)}
                              </TableCell>
                              <TableCell>
                                {line.credit_amount > 0 && formatCurrency(line.credit_amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No journal entries found for this cow.
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