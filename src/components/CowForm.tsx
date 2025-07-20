import { useState, useEffect } from 'react';
import { Plus, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Cow, PurchasePriceDefault, AcquisitionType } from '@/types/cow';
import { supabase } from '@/integrations/supabase/client';

interface CowFormProps {
  onAddCow: (cow: Cow) => void;
}

export function CowForm({ onAddCow }: CowFormProps) {
  const [formData, setFormData] = useState({
    tagNumber: '',
    name: '',
    birthDate: '',
    freshenDate: '',
    purchasePrice: '',
    salvageValue: '',
    acquisitionType: 'purchased' as AcquisitionType,
  });
  const [priceDefaults, setPriceDefaults] = useState<PurchasePriceDefault[]>([]);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchPriceDefaults = async () => {
      const { data, error } = await supabase
        .from('purchase_price_defaults')
        .select('*')
        .order('birth_year', { ascending: false });
      
      if (!error && data) {
        const defaults = data.map(item => ({
          ...item,
          created_at: new Date(item.created_at),
          updated_at: new Date(item.updated_at)
        }));
        setPriceDefaults(defaults);
      }
    };

    fetchPriceDefaults();
  }, []);

  useEffect(() => {
    // Auto-calculate purchase price when birth and freshen dates are set
    if (formData.birthDate && formData.freshenDate && !formData.purchasePrice) {
      const birthDate = new Date(formData.birthDate);
      const freshenDate = new Date(formData.freshenDate);
      const birthYear = birthDate.getFullYear();
      
      const defaults = priceDefaults.find(d => d.birth_year === birthYear);
      if (defaults) {
        const daysDiff = Math.floor((freshenDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
        const accruedValue = daysDiff * defaults.daily_accrual_rate;
        const calculatedPrice = defaults.default_price + accruedValue;
        setCalculatedPrice(calculatedPrice);
      } else {
        setCalculatedPrice(null);
      }
    } else {
      setCalculatedPrice(null);
    }
  }, [formData.birthDate, formData.freshenDate, formData.purchasePrice, priceDefaults]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const useCalculatedPrice = () => {
    if (calculatedPrice) {
      setFormData(prev => ({ ...prev, purchasePrice: calculatedPrice.toString() }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!formData.tagNumber || !formData.birthDate || !formData.freshenDate) {
        throw new Error('Please fill in all required fields');
      }

      const purchasePrice = parseFloat(formData.purchasePrice) || calculatedPrice || 2000;
      const salvageValue = parseFloat(formData.salvageValue) || purchasePrice * 0.1;

      const newCow: Cow = {
        id: `cow-${formData.tagNumber}-${Date.now()}`,
        tagNumber: formData.tagNumber,
        name: formData.name || undefined,
        birthDate: new Date(formData.birthDate),
        freshenDate: new Date(formData.freshenDate),
        purchasePrice,
        salvageValue,
        assetType: {
          id: 'dairy-cow',
          name: 'Dairy Cow',
          defaultDepreciationYears: 5,
          defaultDepreciationMethod: 'straight-line',
          defaultSalvagePercentage: 10
        },
        status: 'active',
        depreciationMethod: 'straight-line',
        currentValue: purchasePrice,
        totalDepreciation: 0,
        acquisitionType: formData.acquisitionType
      };

      onAddCow(newCow);

      // Reset form
      setFormData({
        tagNumber: '',
        name: '',
        birthDate: '',
        freshenDate: '',
        purchasePrice: '',
        salvageValue: '',
        acquisitionType: 'purchased',
      });

      toast({
        title: "Cow Added",
        description: `Successfully added cow ${newCow.tagNumber}`,
      });

    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to add cow',
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Add Cow Manually
        </CardTitle>
        <CardDescription>
          Enter cow information manually to add to your inventory
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tagNumber">
                Tag Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tagNumber"
                value={formData.tagNumber}
                onChange={(e) => handleInputChange('tagNumber', e.target.value)}
                placeholder="e.g., 001, A123"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="acquisitionType">
                Acquisition Type <span className="text-destructive">*</span>
              </Label>
              <Select 
                value={formData.acquisitionType} 
                onValueChange={(value: AcquisitionType) => handleInputChange('acquisitionType', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchased">Purchased</SelectItem>
                  <SelectItem value="raised">Raised</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name (Optional)</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Bessie, Daisy"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="birthDate">
                Birth Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="birthDate"
                type="date"
                value={formData.birthDate}
                onChange={(e) => handleInputChange('birthDate', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="freshenDate">
                Freshen Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="freshenDate"
                type="date"
                value={formData.freshenDate}
                onChange={(e) => handleInputChange('freshenDate', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchasePrice">Purchase Price</Label>
              <div className="space-y-2">
                <Input
                  id="purchasePrice"
                  type="number"
                  step="0.01"
                  value={formData.purchasePrice}
                  onChange={(e) => handleInputChange('purchasePrice', e.target.value)}
                  placeholder="Enter manually or use calculated"
                />
                {calculatedPrice && !formData.purchasePrice && (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                    <Calculator className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Calculated: ${calculatedPrice.toFixed(2)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={useCalculatedPrice}
                    >
                      Use This
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="salvageValue">Salvage Value</Label>
              <Input
                id="salvageValue"
                type="number"
                step="0.01"
                value={formData.salvageValue}
                onChange={(e) => handleInputChange('salvageValue', e.target.value)}
                placeholder="Defaults to 10% of purchase price"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use 10% of purchase price
              </p>
            </div>
          </div>

          {/* Info about automatic calculation */}
          {calculatedPrice && (
            <div className="bg-muted/30 p-4 rounded-lg space-y-2">
              <h4 className="font-medium text-sm">Price Calculation Details</h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  • Base price for {new Date(formData.birthDate).getFullYear()}: $
                  {priceDefaults.find(d => d.birth_year === new Date(formData.birthDate).getFullYear())?.default_price?.toFixed(2) || 'N/A'}
                </p>
                <p>
                  • Daily accrual rate: $
                  {priceDefaults.find(d => d.birth_year === new Date(formData.birthDate).getFullYear())?.daily_accrual_rate?.toFixed(2) || 'N/A'}
                </p>
                <p>
                  • Days from birth to freshen: {Math.floor((new Date(formData.freshenDate).getTime() - new Date(formData.birthDate).getTime()) / (1000 * 60 * 60 * 24))}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? 'Adding Cow...' : 'Add Cow'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}