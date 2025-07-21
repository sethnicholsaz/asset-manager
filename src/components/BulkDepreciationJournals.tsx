import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export const BulkDepreciationJournals = () => {
  const { toast } = useToast();
  const { currentCompany } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    startYear: new Date().getFullYear() - 1,
    startMonth: 1,
    endYear: new Date().getFullYear(),
    endMonth: new Date().getMonth() + 1
  });

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
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);
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
          This will create monthly depreciation entries and update cow depreciation records.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startYear">Start Year</Label>
              <Select 
                value={formData.startYear.toString()} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, startYear: parseInt(value) }))}
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
            <h4 className="font-medium mb-2">What this will do:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Calculate monthly depreciation for all active cows</li>
              <li>• Create journal entries with proper posting periods</li>
              <li>• Update cow depreciation and current values</li>
              <li>• Track accumulated depreciation per cow per month</li>
            </ul>
          </div>

          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Bulk Depreciation Journals
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};