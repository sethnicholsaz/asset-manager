import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [journalStats, setJournalStats] = useState({
    active_cow_count: 0,
    total_asset_value: 0,
    total_accumulated_depreciation: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentCompany) {
      fetchJournalStats();
    }
  }, [currentCompany]);

  const fetchJournalStats = async () => {
    if (!currentCompany) return;

    try {
      console.log('Fetching journal-based stats for company:', currentCompany.id);

      // Call the edge function for server-side aggregation
      const { data, error } = await supabase.functions.invoke('dashboard-stats', {
        body: { company_id: currentCompany.id }
      });

      if (error) throw error;

      console.log('Journal-based stats calculated:', data);
      setJournalStats(data);
    } catch (error) {
      console.error('Error fetching journal stats:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate current value from journal data
  const currentValue = journalStats.total_asset_value - journalStats.total_accumulated_depreciation;

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
            Overview of your dairy cow assets based on journal entries
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
            <div className="text-2xl font-bold">{journalStats.active_cow_count.toLocaleString()}</div>
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
              ${journalStats.total_asset_value.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              From journal entries
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
              ${currentValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Asset value less depreciation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accumulated Depreciation</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${journalStats.total_accumulated_depreciation.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              From journal entries
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Start Guide */}
      {journalStats.active_cow_count === 0 && (
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