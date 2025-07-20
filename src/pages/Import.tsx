import { useState } from 'react';
import { Cow } from '@/types/cow';
import { CowUpload } from '@/components/CowUpload';
import { CowForm } from '@/components/CowForm';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Save, CheckCircle } from 'lucide-react';

export default function Import() {
  const [cows, setCows] = useState<Cow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  const handleCowUpload = async (uploadedCows: Cow[]) => {
    if (!currentCompany) {
      toast({
        title: "Error",
        description: "Please select a company first",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Transform the cow data for database insertion
      const cowData = uploadedCows.map(cow => ({
        id: cow.tagNumber, // Use tag number as ID
        tag_number: cow.tagNumber,
        name: cow.name || null,
        birth_date: cow.birthDate.toISOString().split('T')[0],
        freshen_date: cow.freshenDate.toISOString().split('T')[0],
        purchase_price: cow.purchasePrice,
        salvage_value: cow.salvageValue,
        current_value: cow.purchasePrice,
        total_depreciation: 0,
        status: 'active',
        depreciation_method: 'straight-line',
        acquisition_type: cow.acquisitionType,
        asset_type_id: 'dairy-cow',
        company_id: currentCompany.id
      }));

      const { error } = await supabase
        .from('cows')
        .insert(cowData);

      if (error) throw error;

      setCows(prev => [...prev, ...uploadedCows]);
      
      toast({
        title: "Success!",
        description: `Successfully imported ${uploadedCows.length} cows to your inventory`,
      });
    } catch (error) {
      console.error('Error saving cows:', error);
      toast({
        title: "Error",
        description: "Failed to save cows to database. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCow = (cow: Cow) => {
    setCows(prev => [...prev, cow]);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Cow Data</h1>
          <p className="text-muted-foreground">
            Upload CSV files or add cows manually to build your inventory
          </p>
        </div>
      </div>

      {/* CSV Upload Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Bulk Import</h2>
          <p className="text-sm text-muted-foreground">
            Upload a CSV file to import multiple cows at once
          </p>
        </div>
        <CowUpload onUpload={handleCowUpload} />
      </div>

      <div className="flex items-center gap-4">
        <Separator className="flex-1" />
        <span className="text-sm text-muted-foreground">OR</span>
        <Separator className="flex-1" />
      </div>

      {/* Manual Entry Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Manual Entry</h2>
          <p className="text-sm text-muted-foreground">
            Add individual cows one at a time
          </p>
        </div>
        <CowForm onAddCow={handleAddCow} />
      </div>

      {cows.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Recently Imported ({cows.length} cows)</h2>
          <div className="grid gap-4">
            {cows.slice(0, 5).map((cow) => (
              <div key={cow.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">
                    {cow.tagNumber} {cow.name && `(${cow.name})`}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Purchase Price: ${cow.purchasePrice.toLocaleString()}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Added just now
                </div>
              </div>
            ))}
            {cows.length > 5 && (
              <div className="text-center text-muted-foreground">
                and {cows.length - 5} more...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}