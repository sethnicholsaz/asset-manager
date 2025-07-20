import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export function AcquisitionSettings() {
  const { currentCompany } = useAuth();
  const { toast } = useToast();
  const [defaultAcquisitionType, setDefaultAcquisitionType] = useState<'purchased' | 'raised'>('purchased');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!currentCompany?.id) return;

      try {
        const { data, error } = await supabase
          .from('acquisition_settings')
          .select('*')
          .eq('company_id', currentCompany.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching acquisition settings:', error);
          toast({
            title: "Error",
            description: "Failed to load acquisition settings",
            variant: "destructive",
          });
        } else if (data) {
          setDefaultAcquisitionType(data.default_acquisition_type as 'purchased' | 'raised');
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [currentCompany?.id, toast]);

  const handleSave = async () => {
    if (!currentCompany?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('acquisition_settings')
        .upsert({
          company_id: currentCompany.id,
          default_acquisition_type: defaultAcquisitionType,
        }, {
          onConflict: 'company_id'
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Settings Saved",
        description: "Acquisition settings have been updated successfully",
      });
    } catch (error) {
      console.error('Error saving acquisition settings:', error);
      toast({
        title: "Error",
        description: "Failed to save acquisition settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Acquisition Type</CardTitle>
        <CardDescription>
          Configure the default acquisition type for new cow imports when not specified in the CSV
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <Label className="text-base font-medium">Default Acquisition Type for CSV Uploads</Label>
          <RadioGroup
            value={defaultAcquisitionType}
            onValueChange={(value) => setDefaultAcquisitionType(value as 'purchased' | 'raised')}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="purchased" id="purchased" />
              <Label htmlFor="purchased" className="cursor-pointer">
                <div className="space-y-1">
                  <div className="font-medium">Purchased</div>
                  <div className="text-sm text-muted-foreground">
                    Cows acquired from external sources (bought from other farms, dealers, etc.)
                  </div>
                </div>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="raised" id="raised" />
              <Label htmlFor="raised" className="cursor-pointer">
                <div className="space-y-1">
                  <div className="font-medium">Raised</div>
                  <div className="text-sm text-muted-foreground">
                    Cows born and raised on your farm (homebred animals)
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="pt-4 border-t">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Settings
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">Note:</p>
          <p>
            This setting only applies when the CSV file doesn't include an "acquisitionType" column. 
            Individual CSV entries can still override this default by including the acquisitionType column 
            with values "purchased" or "raised".
          </p>
        </div>
      </CardContent>
    </Card>
  );
}