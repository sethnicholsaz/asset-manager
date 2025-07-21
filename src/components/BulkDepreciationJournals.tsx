import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Info } from 'lucide-react';

export const BulkDepreciationJournals = () => {
  const { toast } = useToast();
  const { currentCompany } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCowData, setIsLoadingCowData] = useState(false);
  const [cowDateInfo, setCowDateInfo] = useState<{
    oldestFreshenDate: string;
    newestFreshenDate: string;
    totalCows: number;
  } | null>(null);
  const [formData, setFormData] = useState({
    startYear: new Date().getFullYear() - 1,
    startMonth: 1,
    endYear: new Date().getFullYear(),
    endMonth: new Date().getMonth() + 1,
    useOldestCow: false
  });

  useEffect(() => {
    if (currentCompany) {
      loadCowDateInfo();
    }
  }, [currentCompany]);

  const loadCowDateInfo = async () => {
    if (!currentCompany) return;
    
    setIsLoadingCowData(true);
    try {
      const { data: cows, error } = await supabase
        .from('cows')
        .select('freshen_date')
        .eq('company_id', currentCompany.id)
        .eq('status', 'active')
        .order('freshen_date', { ascending: true });

      if (error) throw error;

      if (cows && cows.length > 0) {
        const oldestDate = new Date(cows[0].freshen_date);
        const newestDate = new Date(cows[cows.length - 1].freshen_date);
        
        // Ensure we don't go before 2024
        const earliestAllowed = new Date('2024-01-01');
        const effectiveOldest = oldestDate < earliestAllowed ? earliestAllowed : oldestDate;
        
        setCowDateInfo({
          oldestFreshenDate: effectiveOldest.toISOString().split('T')[0],
          newestFreshenDate: newestDate.toISOString().split('T')[0],
          totalCows: cows.length
        });
      }
    } catch (error) {
      console.error('Error loading cow date info:', error);
      toast({
        title: "Warning",
        description: "Could not load cow date information",
        variant: "destructive",
      });
    } finally {
      setIsLoadingCowData(false);
    }
  };

  const handleUseOldestCow = (checked: boolean) => {
    setFormData(prev => ({ ...prev, useOldestCow: checked }));
    
    if (checked && cowDateInfo) {
      const oldestDate = new Date(cowDateInfo.oldestFreshenDate);
      setFormData(prev => ({
        ...prev,
        startYear: oldestDate.getFullYear(),
        startMonth: oldestDate.getMonth() + 1,
        useOldestCow: true
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompany) {
      toast({
        title: "Error",
        description: "No company selected",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      console.log("Creating bulk depreciation journals...", formData);

      const { data, error } = await supabase.functions.invoke('create-bulk-depreciation-journals', {
        body: {
          company_id: currentCompany.id,
          start_year: formData.startYear,
          start_month: formData.startMonth,
          end_year: formData.endYear,
          end_month: formData.endMonth
        }
      });

      if (error) {
        console.error("Function error:", error);
        throw error;
      }

      console.log("Bulk journals result:", data);

      toast({
        title: "Success",
        description: `Created ${data.total_entries} depreciation journal entries`,
      });

    } catch (error) {
      console.error('Error creating bulk journals:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create bulk journals",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => Math.max(2024, currentYear - 5 + i));
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Bulk Depreciation Journals</CardTitle>
        <CardDescription>
          Generate historical depreciation journal entries for all active cows. 
          Each cow's depreciation will be calculated from their individual freshen date.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingCowData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading cow information...
          </div>
        ) : (
          <>
            {cowDateInfo && (
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <div className="flex items-start space-x-2">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="text-sm">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100">Cow Information</h4>
                    <p className="text-blue-700 dark:text-blue-300 mt-1">
                      You have {cowDateInfo.totalCows} active cows. 
                      Oldest freshen date: {new Date(cowDateInfo.oldestFreshenDate).toLocaleDateString()}
                      {cowDateInfo.oldestFreshenDate < '2024-01-01' && " (limited to 2024 start)"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {cowDateInfo && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="useOldestCow"
                    checked={formData.useOldestCow}
                    onCheckedChange={handleUseOldestCow}
                  />
                  <Label htmlFor="useOldestCow" className="text-sm">
                    Start from oldest cow's freshen date ({new Date(cowDateInfo.oldestFreshenDate).toLocaleDateString()})
                  </Label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startYear">Start Year</Label>
                  <Select 
                    value={formData.startYear.toString()} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, startYear: parseInt(value) }))}
                    disabled={formData.useOldestCow}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="startMonth">Start Month</Label>
                  <Select 
                    value={formData.startMonth.toString()} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, startMonth: parseInt(value) }))}
                    disabled={formData.useOldestCow}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map(month => (
                        <SelectItem key={month.value} value={month.value.toString()}>{month.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="endYear">End Year</Label>
                  <Select 
                    value={formData.endYear.toString()} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, endYear: parseInt(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="endMonth">End Month</Label>
                  <Select 
                    value={formData.endMonth.toString()} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, endMonth: parseInt(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map(month => (
                        <SelectItem key={month.value} value={month.value.toString()}>{month.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-medium mb-2">How this handles different cow freshen dates:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Each cow's depreciation starts from their individual freshen date</li>
                  <li>• Cows only appear in months after they've freshened</li>
                  <li>• Monthly depreciation is calculated per cow based on their age in months</li>
                  <li>• Creates proper journal entries with accurate posting periods</li>
                  <li>• Updates individual cow depreciation records and values</li>
                </ul>
              </div>

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Bulk Depreciation Journals
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
};