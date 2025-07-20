import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Cow, AcquisitionType } from '@/types/cow';
import { Loader2, Save } from 'lucide-react';

interface EditCowDialogProps {
  cow: Cow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updatedCow: Cow) => Promise<void>;
}

export function EditCowDialog({ cow, open, onOpenChange, onSave }: EditCowDialogProps) {
  const [formData, setFormData] = useState({
    tagNumber: '',
    name: '',
    birthDate: '',
    freshenDate: '',
    purchasePrice: '',
    salvageValue: '',
    acquisitionType: 'purchased' as AcquisitionType,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (cow && open) {
      setFormData({
        tagNumber: cow.tagNumber,
        name: cow.name || '',
        birthDate: cow.birthDate.toISOString().split('T')[0],
        freshenDate: cow.freshenDate.toISOString().split('T')[0],
        purchasePrice: cow.purchasePrice.toString(),
        salvageValue: cow.salvageValue.toString(),
        acquisitionType: cow.acquisitionType,
      });
    }
  }, [cow, open]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cow) return;

    setIsSubmitting(true);
    try {
      // Validate required fields
      if (!formData.tagNumber || !formData.birthDate || !formData.freshenDate) {
        throw new Error('Please fill in all required fields');
      }

      const purchasePrice = parseFloat(formData.purchasePrice);
      const salvageValue = parseFloat(formData.salvageValue);

      if (isNaN(purchasePrice) || purchasePrice <= 0) {
        throw new Error('Purchase price must be a valid positive number');
      }

      if (isNaN(salvageValue) || salvageValue < 0) {
        throw new Error('Salvage value must be a valid non-negative number');
      }

      const updatedCow: Cow = {
        ...cow,
        tagNumber: formData.tagNumber,
        name: formData.name || undefined,
        birthDate: new Date(formData.birthDate),
        freshenDate: new Date(formData.freshenDate),
        purchasePrice,
        salvageValue,
        acquisitionType: formData.acquisitionType,
      };

      await onSave(updatedCow);
      onOpenChange(false);

      toast({
        title: "Success",
        description: `Cow ${updatedCow.tagNumber} has been updated`,
      });

    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to update cow',
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    // Reset form data to original values
    if (cow) {
      setFormData({
        tagNumber: cow.tagNumber,
        name: cow.name || '',
        birthDate: cow.birthDate.toISOString().split('T')[0],
        freshenDate: cow.freshenDate.toISOString().split('T')[0],
        purchasePrice: cow.purchasePrice.toString(),
        salvageValue: cow.salvageValue.toString(),
        acquisitionType: cow.acquisitionType,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Cow Details</DialogTitle>
          <DialogDescription>
            Update the information for cow {cow?.tagNumber}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tagNumber">
                Tag Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-tagNumber"
                value={formData.tagNumber}
                onChange={(e) => handleInputChange('tagNumber', e.target.value)}
                placeholder="e.g., 001, A123"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-acquisitionType">
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
              <Label htmlFor="edit-name">Name (Optional)</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Bessie, Daisy"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-birthDate">
                Birth Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-birthDate"
                type="date"
                value={formData.birthDate}
                onChange={(e) => handleInputChange('birthDate', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-freshenDate">
                Freshen Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-freshenDate"
                type="date"
                value={formData.freshenDate}
                onChange={(e) => handleInputChange('freshenDate', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-purchasePrice">
                Purchase Price <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-purchasePrice"
                type="number"
                step="0.01"
                value={formData.purchasePrice}
                onChange={(e) => handleInputChange('purchasePrice', e.target.value)}
                placeholder="Enter purchase price"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-salvageValue">
                Salvage Value <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-salvageValue"
                type="number"
                step="0.01"
                value={formData.salvageValue}
                onChange={(e) => handleInputChange('salvageValue', e.target.value)}
                placeholder="Enter salvage value"
                required
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}