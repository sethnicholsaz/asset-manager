import { useState, useEffect } from 'react';
import { Cow } from '@/types/cow';
import { DepreciationReport } from '@/components/DepreciationReport';
import { DispositionReport } from '@/components/DispositionReport';
import { AnimalReconciliation } from '@/components/AnimalReconciliation';
import { JournalEntries } from '@/components/JournalEntries';
import CowJournalSummary from '@/components/CowJournalSummary';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Reports() {
  const [cows, setCows] = useState<Cow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentCompany) {
      fetchCows();
    }
  }, [currentCompany]);

  const fetchCows = async () => {
    if (!currentCompany) return;

    try {
      const { data, error } = await supabase
        .from('cows')
        .select('*')
        .eq('company_id', currentCompany.id);

      if (error) throw error;

      // Transform database data to match Cow interface
      const transformedCows: Cow[] = (data || []).map(cow => ({
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
    } catch (error) {
      console.error('Error fetching cows:', error);
      toast({
        title: "Error",
        description: "Failed to load cow data for reports",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">
            Generate depreciation schedules and disposition reports
          </p>
        </div>
      </div>

      <Tabs defaultValue="depreciation" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="depreciation">Depreciation Reports</TabsTrigger>
          <TabsTrigger value="dispositions">Disposition Reports</TabsTrigger>
          <TabsTrigger value="reconciliation">Animal Reconciliation</TabsTrigger>
          <TabsTrigger value="journals">Journal Entries</TabsTrigger>
          <TabsTrigger value="cow-summary">Cow Journal Summary</TabsTrigger>
        </TabsList>
        
        <TabsContent value="depreciation">
          <DepreciationReport cows={cows} />
        </TabsContent>
        
        <TabsContent value="dispositions">
          <DispositionReport cows={cows} />
        </TabsContent>

        <TabsContent value="reconciliation">
          <AnimalReconciliation />
        </TabsContent>

        <TabsContent value="journals">
          <JournalEntries />
        </TabsContent>

        <TabsContent value="cow-summary">
          <CowJournalSummary />
        </TabsContent>
        
      </Tabs>
    </div>
  );
}