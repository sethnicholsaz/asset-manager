import { useState, useEffect } from 'react';
import { Cow } from '@/types/cow';
import { CowDataTable } from '@/components/CowDataTable';
import { EditCowDialog } from '@/components/EditCowDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  const [isSearching, setIsSearching] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [currentSearchQuery, setCurrentSearchQuery] = useState('');
  const [editingCow, setEditingCow] = useState<Cow | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentCompany) {
      fetchCows();
    }
  }, [currentCompany]);

  const fetchCows = async (searchQuery?: string) => {
    if (!currentCompany) return;

    try {
      console.log('Fetching cows for company:', currentCompany.id);
      
      // Get aggregated statistics using new server-side function (only if not searching)
      if (!searchQuery) {
        const { data: statsData, error: statsError } = await supabase
          .rpc('get_accurate_cow_stats', { p_company_id: currentCompany.id });

        if (statsError || !statsData || statsData.length === 0) {
          console.error('Stats query error:', statsError);
          // Fallback to basic count only if function fails
          const { count: activeCount } = await supabase
            .from('cows')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id)
            .eq('status', 'active');
          
          setSummaryStats({
            active_count: activeCount || 0,
            total_asset_value: 0,
            total_current_value: 0,
            total_depreciation: 0
          });
        } else {
          const stats = statsData[0] as any;
          console.log('Server-side stats result:', stats);
          setSummaryStats({
            active_count: Number(stats.active_count || 0),
            total_asset_value: Number(stats.total_asset_value || 0),
            total_current_value: Number(stats.total_current_value || 0),
            total_depreciation: Number(stats.total_depreciation || 0)
          });
        }

        console.log('Summary stats loaded:', summaryStats);
      }

      // Get cows data
      let data, error;
      
      if (searchQuery && searchQuery.trim()) {
        // Use global search function - remove arbitrary limits
        const { data: searchData, error: searchError } = await supabase
          .rpc('search_cows' as any, { 
            p_company_id: currentCompany.id,
            p_search_query: searchQuery.trim()
          });
        data = searchData;
        error = searchError;
      } else {
        // Get all active cows for the table display with pagination
        console.log('Starting active cows fetch with pagination for dashboard...');
        let allActiveCows = [];
        let offset = 0;
        const limit = 1000;
        let hasMore = true;
        let pageCount = 0;

        while (hasMore && pageCount < 10) { // Safety limit
          console.log(`Fetching dashboard active cows page ${pageCount + 1}, offset: ${offset}`);
          
          const { data: cowBatch, error: cowError } = await supabase
            .from('cows')
            .select('*')
            .eq('company_id', currentCompany.id)
            .eq('status', 'active')
            .range(offset, offset + limit - 1);

          if (cowError) {
            error = cowError;
            break;
          }

          console.log(`Dashboard page ${pageCount + 1} returned ${cowBatch?.length || 0} records`);
          
          if (cowBatch && cowBatch.length > 0) {
            allActiveCows = [...allActiveCows, ...cowBatch];
            hasMore = cowBatch.length === limit;
            offset += limit;
            pageCount++;
          } else {
            hasMore = false;
          }
        }

        console.log(`Total dashboard active cows fetched: ${allActiveCows.length}`);
        data = allActiveCows;
        error = null;
      }

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
      setIsSearching(false);
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

  const handleSearch = async (searchQuery: string) => {
    // Prevent multiple simultaneous searches
    if (isSearching) return;
    
    setCurrentSearchQuery(searchQuery);
    
    if (!searchQuery.trim()) {
      // If empty search, just reload normal data without setting loading
      await fetchCows();
      return;
    }
    
    setIsSearching(true);
    await fetchCows(searchQuery);
  };

  const handleCalculateDepreciation = async () => {
    if (!currentCompany || activeCows === 0) return;

    setIsCalculating(true);
    try {
      // Get depreciation settings
      const { data: depreciationSettings, error: settingsError } = await supabase
        .rpc('fetch_depreciation_settings', { p_company_id: currentCompany.id });

      if (settingsError || !depreciationSettings || depreciationSettings.length === 0) {
        toast({
          title: "Missing Settings",
          description: "Please configure depreciation settings first in the Settings page",
          variant: "destructive",
        });
        return;
      }

      const settings = depreciationSettings[0];
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      // Get all active cows for depreciation calculation
      const { data: allActiveCows, error: cowsError } = await supabase
        .from('cows')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('status', 'active');

      if (cowsError || !allActiveCows) {
        throw new Error('Failed to fetch cows for depreciation calculation');
      }

      let totalDepreciationAmount = 0;
      const depreciationEntries = [];
      const cowUpdates = [];

      // Calculate depreciation for each cow
      for (const cow of allActiveCows) {
        const freshenDate = new Date(cow.freshen_date);
        const monthsInService = Math.floor(
          (currentDate.getTime() - freshenDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
        );

        if (monthsInService > 0) {
          // Calculate monthly depreciation
          const depreciableAmount = cow.purchase_price - cow.salvage_value;
          const totalLifeMonths = settings.default_depreciation_years * 12;
          const monthlyDepreciation = depreciableAmount / totalLifeMonths;
          
          // Calculate total depreciation up to current month
          const totalDepreciationSoFar = Math.min(
            monthlyDepreciation * monthsInService,
            depreciableAmount
          );
          
          const currentValue = cow.purchase_price - totalDepreciationSoFar;
          
          // Only update if there's a change
          if (totalDepreciationSoFar !== cow.total_depreciation) {
            totalDepreciationAmount += (totalDepreciationSoFar - cow.total_depreciation);
            
            cowUpdates.push({
              id: cow.id,
              total_depreciation: totalDepreciationSoFar,
              current_value: Math.max(currentValue, cow.salvage_value)
            });
          }
        }
      }

      if (totalDepreciationAmount > 0) {
        // Create journal entry
        const { data: journalEntry, error: journalError } = await supabase
          .from('journal_entries')
          .insert({
            company_id: currentCompany.id,
            entry_date: currentDate.toISOString().split('T')[0],
            description: `Monthly Depreciation - ${currentMonth}/${currentYear}`,
            total_amount: totalDepreciationAmount,
            entry_type: 'depreciation'
          })
          .select()
          .single();

        if (journalError) throw journalError;

        // Create journal lines
        await supabase
          .from('journal_lines')
          .insert([
            {
              journal_entry_id: journalEntry.id,
              account_code: '6500',
              account_name: 'Depreciation Expense',
              description: 'Monthly depreciation expense',
              debit_amount: totalDepreciationAmount,
              credit_amount: 0,
              line_type: 'debit'
            },
            {
              journal_entry_id: journalEntry.id,
              account_code: '1520',
              account_name: 'Accumulated Depreciation - Dairy Cows',
              description: 'Accumulated depreciation',
              debit_amount: 0,
              credit_amount: totalDepreciationAmount,
              line_type: 'credit'
            }
          ]);

        // Update cow records
        for (const update of cowUpdates) {
          await supabase
            .from('cows')
            .update({
              total_depreciation: update.total_depreciation,
              current_value: update.current_value
            })
            .eq('id', update.id);
        }

        toast({
          title: "Success",
          description: `Depreciation calculated for ${cowUpdates.length} cows. Total depreciation: $${totalDepreciationAmount.toFixed(2)}`,
        });

        // Refresh the data
        await fetchCows();
      } else {
        toast({
          title: "No Changes",
          description: "Depreciation is already up to date for all cows",
        });
      }
    } catch (error) {
      console.error('Error calculating depreciation:', error);
      toast({
        title: "Error",
        description: "Failed to calculate depreciation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
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
        <div className="flex gap-2">
          <Button
            onClick={handleCalculateDepreciation}
            disabled={activeCows === 0 || isCalculating}
            className="bg-primary hover:bg-primary/90"
          >
            {isCalculating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Processing...
              </>
            ) : (
              <>
                <BarChart3 className="mr-2 h-4 w-4" />
                Calculate Depreciation
              </>
            )}
          </Button>
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
            <div className="text-2xl font-bold">{activeCows.toLocaleString()}</div>
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
        summaryStats={summaryStats}
        onEditCow={handleEditCow}
        onDeleteCow={handleDeleteCow}
        onSearch={handleSearch}
        isSearching={isSearching}
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