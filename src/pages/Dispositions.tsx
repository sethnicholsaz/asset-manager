import { useState, useEffect } from 'react';
import { ArrowLeft, Trash2, TrendingUp, TrendingDown, Calendar, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DispositionForm } from '@/components/DispositionForm';
import { Cow, CowDisposition } from '@/types/cow';
import { DepreciationCalculator } from '@/utils/depreciation';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export default function Dispositions() {
  const [cows, setCows] = useState<Cow[]>([]);
  const [dispositions, setDispositions] = useState<CowDisposition[]>([]);
  const [selectedCow, setSelectedCow] = useState<Cow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCowSearch, setActiveCowSearch] = useState('');
  const [dispositionSearch, setDispositionSearch] = useState('');
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentCompany) {
      fetchData();
    }
  }, [currentCompany]);

  const fetchData = async () => {
    if (!currentCompany) return;

    try {
      // Fetch all cows - no limits for accurate data
      const { data: cowData, error: cowError } = await supabase
        .from('cows')
        .select('*')
        .eq('company_id', currentCompany.id);

      if (cowError) throw cowError;

      // Transform cow data
      const transformedCows: Cow[] = (cowData || []).map(cow => ({
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
      }));

      setCows(transformedCows);

      // Fetch dispositions
      const { data: dispositionData, error: dispositionError } = await supabase
        .from('cow_dispositions')
        .select('*')
        .eq('company_id', currentCompany.id);

      if (dispositionError) throw dispositionError;

      // Transform disposition data
      const transformedDispositions: CowDisposition[] = (dispositionData || []).map(disp => ({
        id: disp.id,
        cowId: disp.cow_id,
        dispositionDate: new Date(disp.disposition_date),
        dispositionType: disp.disposition_type as 'sale' | 'death' | 'culled',
        saleAmount: disp.sale_amount,
        finalBookValue: disp.final_book_value,
        gainLoss: disp.gain_loss,
        notes: disp.notes,
        journalEntryId: disp.journal_entry_id,
        createdAt: new Date(disp.created_at),
        updatedAt: new Date(disp.updated_at)
      }));

      setDispositions(transformedDispositions);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load disposition data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const activeCows = cows.filter(cow => cow.status === 'active');
  const disposedCows = cows.filter(cow => cow.status !== 'active');

  // Filter active cows based on search
  const filteredActiveCows = activeCows.filter(cow => {
    if (!activeCowSearch) return true;
    const query = activeCowSearch.toLowerCase();
    return (
      cow.tagNumber.toLowerCase().includes(query) ||
      (cow.name && cow.name.toLowerCase().includes(query))
    );
  });

  // Filter dispositions based on search
  const filteredDispositions = dispositions.filter(disposition => {
    if (!dispositionSearch) return true;
    const query = dispositionSearch.toLowerCase();
    const cow = cows.find(c => c.id === disposition.cowId);
    return (
      (cow?.tagNumber && cow.tagNumber.toLowerCase().includes(query)) ||
      (cow?.name && cow.name.toLowerCase().includes(query)) ||
      disposition.dispositionType.toLowerCase().includes(query) ||
      (disposition.notes && disposition.notes.toLowerCase().includes(query))
    );
  });

  const totalGains = dispositions
    .filter(d => d.gainLoss > 0)
    .reduce((sum, d) => sum + d.gainLoss, 0);

  const totalLosses = dispositions
    .filter(d => d.gainLoss < 0)
    .reduce((sum, d) => sum + Math.abs(d.gainLoss), 0);

  const handleDisposition = (updatedCow: Cow, disposition: CowDisposition) => {
    setCows(prev => prev.map(cow => cow.id === updatedCow.id ? updatedCow : cow));
    setDispositions(prev => [...prev, disposition]);
    setShowForm(false);
    setSelectedCow(null);
  };

  const handleStartDisposition = (cow: Cow) => {
    setSelectedCow(cow);
    setShowForm(true);
  };

  const getDispositionBadgeVariant = (status: string) => {
    switch (status) {
      case 'sold':
        return 'default';
      case 'deceased':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (showForm && selectedCow) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => {
            setShowForm(false);
            setSelectedCow(null);
          }}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dispositions
        </Button>
        
        <DispositionForm
          cow={selectedCow}
          onDisposition={handleDisposition}
          onCancel={() => {
            setShowForm(false);
            setSelectedCow(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cow Dispositions</h1>
          <p className="text-muted-foreground">
            Manage cow sales, deaths, and disposals
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cows</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCows.length}</div>
            <p className="text-xs text-muted-foreground">
              Available for disposition
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disposed Cows</CardTitle>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{disposedCows.length}</div>
            <p className="text-xs text-muted-foreground">
              Sold or deceased
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Gains</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {DepreciationCalculator.formatCurrency(totalGains)}
            </div>
            <p className="text-xs text-muted-foreground">
              From asset sales
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Losses</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {DepreciationCalculator.formatCurrency(totalLosses)}
            </div>
            <p className="text-xs text-muted-foreground">
              From disposals
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Cows - Available for Disposition */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active Cows</CardTitle>
              <CardDescription>
                Select a cow to record a disposition (sale, death, or culling)
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search active cows..."
                  value={activeCowSearch}
                  onChange={(e) => setActiveCowSearch(e.target.value)}
                  className="pl-8 w-[250px]"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredActiveCows.length === 0 && activeCowSearch && (
            <p className="text-center text-muted-foreground py-8">
              No active cows found matching "{activeCowSearch}"
            </p>
          )}
          {activeCows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No active cows available for disposition
            </p>
          ) : filteredActiveCows.length === 0 && !activeCowSearch ? (
            <p className="text-center text-muted-foreground py-8">
              No active cows available for disposition
            </p>
          ) : (
            <div className="space-y-3">
              {filteredActiveCows.map((cow) => {
                const currentDate = new Date();
                const monthlyDepreciation = DepreciationCalculator.calculateMonthlyDepreciation(cow, currentDate);
                const monthsSinceStart = DepreciationCalculator.getMonthsSinceStart(cow.freshenDate, currentDate);
                const totalDepreciation = monthlyDepreciation * monthsSinceStart;
                const bookValue = Math.max(cow.salvageValue, cow.purchasePrice - totalDepreciation);

                return (
                  <div
                    key={cow.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="font-medium">
                          {cow.tagNumber} {cow.name && `(${cow.name})`}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Born: {DepreciationCalculator.formatDate(cow.birthDate)} • 
                          Freshen: {DepreciationCalculator.formatDate(cow.freshenDate)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          Book Value: {DepreciationCalculator.formatCurrency(bookValue)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Original: {DepreciationCalculator.formatCurrency(cow.purchasePrice)}
                        </div>
                      </div>
                      
                      <Button
                        size="sm"
                        onClick={() => handleStartDisposition(cow)}
                      >
                        Record Disposition
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disposition History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Disposition History</CardTitle>
              <CardDescription>
                Previous cow dispositions and their financial impact
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search dispositions..."
                  value={dispositionSearch}
                  onChange={(e) => setDispositionSearch(e.target.value)}
                  className="pl-8 w-[250px]"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredDispositions.length === 0 && dispositionSearch && (
            <p className="text-center text-muted-foreground py-8">
              No dispositions found matching "{dispositionSearch}"
            </p>
          )}
          {dispositions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No dispositions recorded yet
            </p>
          ) : filteredDispositions.length === 0 && !dispositionSearch ? (
            <p className="text-center text-muted-foreground py-8">
              No dispositions recorded yet
            </p>
          ) : (
            <div className="space-y-3">
              {filteredDispositions.map((disposition) => {
                const cow = cows.find(c => c.id === disposition.cowId);
                return (
                  <div
                    key={disposition.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="font-medium">
                          {cow?.tagNumber} {cow?.name && `(${cow.name})`}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {DepreciationCalculator.formatDate(disposition.dispositionDate)} • 
                          {disposition.notes && ` ${disposition.notes}`}
                        </div>
                      </div>
                      <Badge variant={getDispositionBadgeVariant(cow?.status || 'unknown')}>
                        {disposition.dispositionType}
                      </Badge>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {disposition.dispositionType === 'sale' 
                          ? `Sale: ${DepreciationCalculator.formatCurrency(disposition.saleAmount)}`
                          : 'No Sale Amount'
                        }
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Book Value: {DepreciationCalculator.formatCurrency(disposition.finalBookValue)}
                      </div>
                      {disposition.gainLoss !== 0 && (
                        <div className={`text-xs font-medium ${
                          disposition.gainLoss > 0 ? 'text-success' : 'text-destructive'
                        }`}>
                          {disposition.gainLoss > 0 ? 'Gain' : 'Loss'}: {' '}
                          {DepreciationCalculator.formatCurrency(Math.abs(disposition.gainLoss))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}