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
import { Calendar, TrendingDown, Calculator, Settings } from 'lucide-react';

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
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentCompany) {
      fetchSettings();
    }
  }, [currentCompany]);

  const fetchSettings = async () => {
    if (!currentCompany) return;

    try {
      // For now, use localStorage with company-specific keys
      // This will be replaced with database calls once types are updated
      const storageKey = `depreciation_settings_${currentCompany.id}`;
      const stored = localStorage.getItem(storageKey);
      
      if (stored) {
        const parsedSettings = JSON.parse(stored);
        setSettings({
          ...parsedSettings,
          company_id: currentCompany.id
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
      // Store in localStorage with company-specific key
      const storageKey = `depreciation_settings_${currentCompany.id}`;
      const settingsToSave = {
        ...settings,
        company_id: currentCompany.id,
        updated_at: new Date().toISOString(),
        id: settings.id || crypto.randomUUID()
      };
      
      localStorage.setItem(storageKey, JSON.stringify(settingsToSave));
      setSettings(settingsToSave);

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