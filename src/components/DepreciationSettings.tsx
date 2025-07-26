import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, TrendingDown, Calculator, Settings, History, Clock, CheckCircle } from 'lucide-react';

interface DepreciationSettings {
  id?: string;
  company_id: string;
  default_depreciation_method: 'straight-line' | 'declining-balance' | 'sum-of-years';
  default_depreciation_years: number;
  default_salvage_percentage: number;
  auto_calculate_depreciation: boolean;
  monthly_calculation_day: number;
  journal_processing_day: number;
  include_partial_months: boolean;
  round_to_nearest_dollar: boolean;
  fiscal_year_start_month: number;
  processing_mode: 'historical' | 'production';
  created_at?: string;
  updated_at?: string;
}

export function DepreciationSettings() {
  const [settings, setSettings] = useState<DepreciationSettings>({
    company_id: '',
    default_depreciation_method: 'straight-line',
    default_depreciation_years: 5,
    default_salvage_percentage: 10,
    auto_calculate_depreciation: true,
    monthly_calculation_day: 1,
    journal_processing_day: 5,
    include_partial_months: true,
    round_to_nearest_dollar: true,
    fiscal_year_start_month: 1,
    processing_mode: 'historical',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingHistory, setIsProcessingHistory] = useState(false);
  const [historicalProcessingStatus, setHistoricalProcessingStatus] = useState<'none' | 'processing' | 'completed' | 'error'>('none');
  const [processingProgress, setProcessingProgress] = useState<{
    currentYear?: number;
    totalYears?: number;
    processedYears?: number;
  }>({});
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentCompany) {
      fetchSettings();
      checkHistoricalProcessingStatus();
    }
  }, [currentCompany]);

  const checkHistoricalProcessingStatus = async () => {
    if (!currentCompany) return;

    try {
      // Check if any journal entries exist for this company
      const { data: journalEntries, error } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('company_id', currentCompany.id)
        .eq('entry_type', 'depreciation')
        .limit(1);

      if (error) {
        console.error('Error checking historical processing status:', error);
        return;
      }

      if (journalEntries && journalEntries.length > 0) {
        setHistoricalProcessingStatus('completed');
      }
    } catch (error) {
      console.error('Error checking historical processing status:', error);
    }
  };

  const handleProcessHistoricalDepreciation = async () => {
    if (!currentCompany || isProcessingHistory) return;

    setIsProcessingHistory(true);
    setHistoricalProcessingStatus('processing');
    setProcessingProgress({});

    try {
      // First, get the processing status to determine what years need processing
      const { data: statusData, error: statusError } = await supabase
        .rpc('get_historical_processing_status', { 
          p_company_id: currentCompany.id 
        });

      if (statusError) throw statusError;

      const status = statusData[0];
      if (!status || !status.processing_needed) {
        setHistoricalProcessingStatus('completed');
        toast({
          title: "No Processing Needed",
          description: "Historical journal entries are already up to date.",
        });
        return;
      }

      const currentYear = new Date().getFullYear();
      const startYear = status.earliest_cow_year;
      const yearsToProcess = [];
      
      // Determine which years need processing
      for (let year = startYear; year <= currentYear; year++) {
        if (!status.years_with_entries.includes(year)) {
          yearsToProcess.push(year);
        }
      }

      if (yearsToProcess.length === 0) {
        setHistoricalProcessingStatus('completed');
        toast({
          title: "Processing Complete",
          description: "All historical journal entries are already generated.",
        });
        return;
      }

      setProcessingProgress({
        totalYears: yearsToProcess.length,
        processedYears: 0
      });

      let totalEntriesProcessed = 0;
      let totalAmount = 0;

      // Process each year individually
      for (let i = 0; i < yearsToProcess.length; i++) {
        const year = yearsToProcess[i];
        setProcessingProgress(prev => ({
          ...prev,
          currentYear: year,
          processedYears: i
        }));

        const { data: yearResult, error: yearError } = await supabase
          .rpc('process_historical_depreciation_by_year_with_mode', { 
            p_company_id: currentCompany.id,
            p_target_year: year,
            p_processing_mode: 'historical'
          });

        if (yearError) {
          throw new Error(`Failed to process year ${year}: ${yearError.message}`);
        }

        const result = yearResult as any;
        if (result?.success) {
          totalEntriesProcessed += result.cows_processed || 0;
          totalAmount += result.total_amount || 0;
        } else {
          throw new Error(result?.error || `Failed to process year ${year}`);
        }

        // Small delay between years to prevent overwhelming the database
        if (i < yearsToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setHistoricalProcessingStatus('completed');
      setProcessingProgress({});
      
      // Switch to production mode after historical processing is complete
      setSettings(prev => ({ ...prev, processing_mode: 'production' }));
      
      toast({
        title: "Historical Processing Complete",
        description: `Successfully processed ${yearsToProcess.length} years with ${totalEntriesProcessed} total entries and $${totalAmount.toFixed(2)} total depreciation. System switched to production mode.`,
      });

    } catch (error) {
      console.error('Error processing historical depreciation:', error);
      setHistoricalProcessingStatus('error');
      setProcessingProgress({});
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Failed to process historical depreciation records",
        variant: "destructive",
      });
    } finally {
      setIsProcessingHistory(false);
    }
  };

  const fetchSettings = async () => {
    if (!currentCompany) return;

    try {
      const { data: settingsData, error } = await supabase
        .rpc('fetch_depreciation_settings', { p_company_id: currentCompany.id });

      if (error) {
        console.error('Error fetching depreciation settings:', error);
      } else if (settingsData && settingsData.length > 0) {
        const dbSettings = settingsData[0];
        setSettings({
          id: dbSettings.id,
          company_id: currentCompany.id,
          default_depreciation_method: dbSettings.default_depreciation_method as 'straight-line' | 'declining-balance' | 'sum-of-years',
          default_depreciation_years: dbSettings.default_depreciation_years,
          default_salvage_percentage: dbSettings.default_salvage_percentage,
          auto_calculate_depreciation: dbSettings.auto_calculate_depreciation,
          monthly_calculation_day: dbSettings.monthly_calculation_day,
          journal_processing_day: dbSettings.journal_processing_day || 5,
          include_partial_months: dbSettings.include_partial_months,
          round_to_nearest_dollar: dbSettings.round_to_nearest_dollar,
          fiscal_year_start_month: dbSettings.fiscal_year_start_month,
          processing_mode: dbSettings.processing_mode || 'historical',
          created_at: dbSettings.created_at,
          updated_at: dbSettings.updated_at
        });
      } else {
        // Set defaults for new company
        setSettings(prev => ({
          ...prev,
          company_id: currentCompany.id
        }));
      }
    } catch (error) {
      console.error('Error loading depreciation settings:', error);
      setSettings(prev => ({
        ...prev,
        company_id: currentCompany.id
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentCompany) return;

    setIsSaving(true);
    try {
      const { data: savedSettings, error } = await supabase
        .rpc('upsert_depreciation_settings', {
          p_company_id: currentCompany.id,
          p_default_depreciation_method: settings.default_depreciation_method,
          p_default_depreciation_years: settings.default_depreciation_years,
          p_default_salvage_percentage: settings.default_salvage_percentage,
          p_auto_calculate_depreciation: settings.auto_calculate_depreciation,
          p_monthly_calculation_day: settings.monthly_calculation_day,
          p_include_partial_months: settings.include_partial_months,
          p_round_to_nearest_dollar: settings.round_to_nearest_dollar,
          p_fiscal_year_start_month: settings.fiscal_year_start_month,
          p_journal_processing_day: settings.journal_processing_day
        });

      if (error) {
        throw error;
      }

      // Update local state with saved ID
      setSettings(prev => ({
        ...prev,
        id: savedSettings,
        updated_at: new Date().toISOString()
      }));

      toast({
        title: "Settings Saved",
        description: "Depreciation settings have been updated successfully.",
      });
    } catch (error) {
      console.error('Error saving depreciation settings:', error);
      toast({
        title: "Error",
        description: "Failed to save depreciation settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };


  const handleInputChange = (field: keyof DepreciationSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5" />
          Depreciation Schedule Settings
        </CardTitle>
        <CardDescription>
          Configure how depreciation is calculated and scheduled for your dairy cow assets
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Default Depreciation Method */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Default Calculation Method
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="depreciation-method">Depreciation Method</Label>
              <Select
                value={settings.default_depreciation_method}
                onValueChange={(value: 'straight-line' | 'declining-balance' | 'sum-of-years') =>
                  handleInputChange('default_depreciation_method', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="straight-line">Straight-Line</SelectItem>
                  <SelectItem value="declining-balance">Declining Balance</SelectItem>
                  <SelectItem value="sum-of-years">Sum of Years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="depreciation-years">Default Useful Life (Years)</Label>
              <Input
                id="depreciation-years"
                type="number"
                min="1"
                max="20"
                value={settings.default_depreciation_years}
                onChange={(e) => handleInputChange('default_depreciation_years', parseInt(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="salvage-percentage">Default Salvage Value (%)</Label>
            <Input
              id="salvage-percentage"
              type="number"
              min="0"
              max="50"
              value={settings.default_salvage_percentage}
              onChange={(e) => handleInputChange('default_salvage_percentage', parseFloat(e.target.value))}
              placeholder="10"
            />
            <p className="text-xs text-muted-foreground">
              Percentage of purchase price retained as salvage value
            </p>
          </div>
        </div>

        <Separator />

        {/* Calculation Schedule */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Calculation Schedule
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="calculation-day">Monthly Calculation Day</Label>
              <Select
                value={settings.monthly_calculation_day.toString()}
                onValueChange={(value) => handleInputChange('monthly_calculation_day', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1st of the month</SelectItem>
                  <SelectItem value="15">15th of the month</SelectItem>
                  <SelectItem value="31">Last day of month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="journal-processing-day">Journal Processing Day</Label>
              <Select
                value={settings.journal_processing_day.toString()}
                onValueChange={(value) => handleInputChange('journal_processing_day', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1st</SelectItem>
                  <SelectItem value="2">2nd</SelectItem>
                  <SelectItem value="3">3rd</SelectItem>
                  <SelectItem value="4">4th</SelectItem>
                  <SelectItem value="5">5th</SelectItem>
                  <SelectItem value="6">6th</SelectItem>
                  <SelectItem value="7">7th</SelectItem>
                  <SelectItem value="8">8th</SelectItem>
                  <SelectItem value="9">9th</SelectItem>
                  <SelectItem value="10">10th</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Day of month to process previous month's journal entries
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal-year-start">Fiscal Year Start Month</Label>
              <Select
                value={settings.fiscal_year_start_month.toString()}
                onValueChange={(value) => handleInputChange('fiscal_year_start_month', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">January</SelectItem>
                  <SelectItem value="4">April</SelectItem>
                  <SelectItem value="7">July</SelectItem>
                  <SelectItem value="10">October</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        {/* Calculation Options */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Calculation Options
          </h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-calculate">Auto-calculate Monthly Depreciation</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically calculate and record monthly depreciation
                </p>
              </div>
              <Switch
                id="auto-calculate"
                checked={settings.auto_calculate_depreciation}
                onCheckedChange={(checked) => handleInputChange('auto_calculate_depreciation', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="partial-months">Include Partial Months</Label>
                <p className="text-xs text-muted-foreground">
                  Pro-rate depreciation for partial months when cows are acquired
                </p>
              </div>
              <Switch
                id="partial-months"
                checked={settings.include_partial_months}
                onCheckedChange={(checked) => handleInputChange('include_partial_months', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="round-dollars">Round to Nearest Dollar</Label>
                <p className="text-xs text-muted-foreground">
                  Round depreciation amounts to the nearest dollar
                </p>
              </div>
              <Switch
                id="round-dollars"
                checked={settings.round_to_nearest_dollar}
                onCheckedChange={(checked) => handleInputChange('round_to_nearest_dollar', checked)}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Historical Processing */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <History className="h-4 w-4" />
            Historical Journal Processing
          </h4>
          <div className="p-4 rounded-lg border bg-muted/50">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  {historicalProcessingStatus === 'completed' && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                  {historicalProcessingStatus === 'processing' && (
                    <Clock className="h-4 w-4 text-blue-600 animate-spin" />
                  )}
                  <Label className="text-sm font-medium">
                    Generate Historical Depreciation Records
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {historicalProcessingStatus === 'completed' ? (
                    "Historical depreciation journal entries have been generated for this company."
                  ) : historicalProcessingStatus === 'processing' ? (
                    <>
                      Processing historical depreciation records...
                      {processingProgress.currentYear && (
                        <span className="block mt-1 font-medium">
                          Processing year {processingProgress.currentYear} 
                          ({(processingProgress.processedYears || 0) + 1} of {processingProgress.totalYears})
                        </span>
                      )}
                    </>
                  ) : (
                    "Generate monthly depreciation journal entries for all existing cows from their start dates to present. This is typically run once for new companies."
                  )}
                </p>
              </div>
              <Button
                onClick={handleProcessHistoricalDepreciation}
                disabled={isProcessingHistory || historicalProcessingStatus === 'completed'}
                variant={historicalProcessingStatus === 'completed' ? 'outline' : 'default'}
                className="ml-4 shrink-0"
              >
                {isProcessingHistory ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : historicalProcessingStatus === 'completed' ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Completed
                  </>
                ) : (
                  <>
                    <History className="h-4 w-4 mr-2" />
                    Process History
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}