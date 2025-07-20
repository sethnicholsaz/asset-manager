import { useState, useEffect } from 'react';
import { Cow } from '@/types/cow';
import { CowDataTable } from '@/components/CowDataTable';
import { EditCowDialog } from '@/components/EditCowDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [cows, setCows] = useState<Cow[]>([]);
  const [summaryStats, setSummaryStats] = useState({
    active_count: 0,
    total_asset_value: 0,
    total_current_value: 0,
    total_depreciation: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [editingCow, setEditingCow] = useState<Cow | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
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
      console.log('Fetching cows for company:', currentCompany.id);
      
      // Get count of active cows
      const { count: activeCount } = await supabase
        .from('cows')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', currentCompany.id)
        .eq('status', 'active');

      console.log('Active cow count:', activeCount);

      // Get sum of asset values for active cows using aggregation
      const { data: aggregateData } = await supabase
        .from('cows')
        .select('purchase_price, current_value, total_depreciation')
        .eq('company_id', currentCompany.id)
        .eq('status', 'active');

      // Calculate totals from the aggregated data
      const totalAssetValue = (aggregateData || []).reduce((sum, cow) => sum + (cow.purchase_price || 0), 0);
      const totalCurrentValue = (aggregateData || []).reduce((sum, cow) => sum + (cow.current_value || 0), 0);
      const totalDepreciation = (aggregateData || []).reduce((sum, cow) => sum + (cow.total_depreciation || 0), 0);

      setSummaryStats({
        active_count: activeCount || 0,
        total_asset_value: totalAssetValue,
        total_current_value: totalCurrentValue,
        total_depreciation: totalDepreciation
      });

      console.log('Summary stats:', {
        active_count: activeCount,
        total_asset_value: totalAssetValue,
        total_current_value: totalCurrentValue,
        total_depreciation: totalDepreciation
      });

      // Get first 1000 active cows for the table display
      const { data, error } = await supabase
        .from('cows')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('status', 'active')
        .limit(1000);

      console.log('Query result - data length:', data?.length);
      
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
        status: (cow.status === 'disposed' ? 'sold' : cow.status) as 'active' | 'sold' | 'deceased' | 'retired',
        depreciationMethod: cow.depreciation_method as 'straight-line',
        acquisitionType: cow.acquisition_type as 'purchased' | 'raised',
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
        description: "Failed to load cow data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCow = async (cowId: string) => {
    try {
      const { error } = await supabase
        .from('cows')
        .update({ status: 'disposed' })
        .eq('id', cowId);

      if (error) throw error;

      setCows(prev => prev.filter(cow => cow.id !== cowId));
      toast({
        title: "Success",
        description: "Cow removed from active inventory",
      });
    } catch (error) {
      console.error('Error deleting cow:', error);
      toast({
        title: "Error",
        description: "Failed to remove cow",
        variant: "destructive",
      });
    }
  };

  const handleEditCow = (cow: Cow) => {
    setEditingCow(cow);
    setIsEditDialogOpen(true);
  };

  const handleSaveEditedCow = async (updatedCow: Cow) => {
    try {
      const { error } = await supabase
        .from('cows')
        .update({
          tag_number: updatedCow.tagNumber,
          name: updatedCow.name,
          birth_date: updatedCow.birthDate.toISOString().split('T')[0],
          freshen_date: updatedCow.freshenDate.toISOString().split('T')[0],
          purchase_price: updatedCow.purchasePrice,
          salvage_value: updatedCow.salvageValue,
          acquisition_type: updatedCow.acquisitionType,
        })
        .eq('id', updatedCow.id);

      if (error) throw error;

      // Update local state
      setCows(prev => prev.map(cow => 
        cow.id === updatedCow.id ? updatedCow : cow
      ));

      toast({
        title: "Success",
        description: "Cow details updated successfully",
      });
    } catch (error) {
      console.error('Error updating cow:', error);
      toast({
        title: "Error",
        description: "Failed to update cow details",
        variant: "destructive",
      });
      throw error; // Re-throw to handle in dialog
    }
  };

  // Use summary statistics from database queries (not local cow data)
  const totalAssetValue = summaryStats.total_asset_value;
  const totalCurrentValue = summaryStats.total_current_value;
  const totalDepreciation = summaryStats.total_depreciation;
  const activeCows = summaryStats.active_count;

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
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your dairy cow assets and depreciation
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cows</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCows}</div>
            <p className="text-xs text-muted-foreground">
              Currently in herd
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Asset Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalAssetValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Original purchase value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalCurrentValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              After depreciation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Depreciation</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalDepreciation.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Accumulated to date
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cow Inventory Table */}
      <CowDataTable 
        cows={cows} 
        onEditCow={handleEditCow}
        onDeleteCow={handleDeleteCow}
      />

      {/* Edit Cow Dialog */}
      <EditCowDialog
        cow={editingCow}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSave={handleSaveEditedCow}
      />

      {/* Quick Start Guide */}
      {cows.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>
              Follow these steps to begin tracking your dairy cow depreciation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <span className="text-2xl">📊</span>
                </div>
                <h3 className="font-medium">1. Prepare Your Data</h3>
                <p className="text-sm text-muted-foreground">
                  Create a CSV file with cow information including tag numbers, birth dates, freshen dates, and purchase prices
                </p>
              </div>
              
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <span className="text-2xl">📤</span>
                </div>
                <h3 className="font-medium">2. Import Your Cows</h3>
                <p className="text-sm text-muted-foreground">
                  Use the Import page to upload your CSV file and automatically populate your cow inventory
                </p>
              </div>
              
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <span className="text-2xl">📈</span>
                </div>
                <h3 className="font-medium">3. Generate Reports</h3>
                <p className="text-sm text-muted-foreground">
                  Create monthly depreciation reports and journal entries for your accounting system
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Index;