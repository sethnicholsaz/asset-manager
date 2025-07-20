import { useState, useEffect } from 'react';
import { Cow } from '@/types/cow';
import { DepreciationReport } from '@/components/DepreciationReport';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

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
        .eq('company_id', currentCompany.id)
        .eq('status', 'active'); // Only active cows for depreciation reports

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
          <h1 className="text-3xl font-bold tracking-tight">Depreciation Reports</h1>
          <p className="text-muted-foreground">
            Generate monthly depreciation schedules and journal entries for your {cows.length} active cows
          </p>
        </div>
      </div>

      <DepreciationReport cows={cows} />
    </div>
  );
}