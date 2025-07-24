/**
 * Modern functional CowForm using domain-driven architecture
 * Demonstrates migration from imperative to functional approach
 */

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Calculator, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Use new domain imports
import { 
  CreateCowSchema,
  validateCreateCow,
  calculateCurrentDepreciation,
  DEPRECIATION_CONFIG,
  isOk,
  unwrapOr,
  formatCurrency,
  type CreateCowData,
  type Result,
  ValidationError,
} from '@/domain';

interface CowFormFunctionalProps {
  onAddCow: (cow: any) => void;
  onCancel?: () => void;
}

interface PurchasePriceDefault {
  id: string;
  birth_year: number;
  default_price: number;
  daily_accrual_rate: number;
}

// Pure function for calculating purchase price
const calculatePurchasePrice = (
  birthDate: Date,
  freshenDate: Date,
  defaults: PurchasePriceDefault[]
): number | null => {
  const birthYear = birthDate.getFullYear();
  const priceDefault = defaults.find(d => d.birth_year === birthYear);
  
  if (!priceDefault) return null;
  
  const daysDiff = Math.floor(
    (freshenDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysDiff < 0) return null;
  
  return priceDefault.default_price + (daysDiff * priceDefault.daily_accrual_rate);
};

// Pure function for form validation
const validateCowForm = (data: any): Result<CreateCowData, ValidationError> => {
  const validation = validateCreateCow(data);
  
  if (!validation.success) {
    return {
      success: false,
      error: new ValidationError(
        validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      )
    };
  }
  
  return {
    success: true,
    data: validation.data
  };
};

export function CowFormFunctional({ onAddCow, onCancel }: CowFormFunctionalProps) {
  const [priceDefaults, setPriceDefaults] = useState<PurchasePriceDefault[]>([]);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [currentDepreciation, setCurrentDepreciation] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { currentCompany } = useAuth();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<CreateCowData>({
    resolver: zodResolver(CreateCowSchema),
    defaultValues: {
      acquisitionType: 'purchased',
      depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
      status: 'active',
      salvageValue: 500, // Default salvage value
      companyId: currentCompany?.id || '',
    },
  });

  // Watch form values for real-time calculations
  const watchedValues = watch();
  const birthDate = watch('birthDate');
  const freshenDate = watch('freshenDate');
  const purchasePrice = watch('purchasePrice');
  const salvageValue = watch('salvageValue');

  // Fetch price defaults on mount
  useEffect(() => {
    const fetchPriceDefaults = async () => {
      try {
        const { data, error } = await supabase
          .from('purchase_price_defaults')
          .select('*')
          .order('birth_year', { ascending: false });
        
        if (error) throw error;
        if (data) setPriceDefaults(data);
      } catch (error) {
        console.error('Failed to fetch price defaults:', error);
        toast({
          title: "Warning",
          description: "Could not load price defaults. Manual entry required.",
          variant: "destructive",
        });
      }
    };

    fetchPriceDefaults();
  }, [toast]);

  // Auto-calculate purchase price when dates change
  useEffect(() => {
    if (birthDate && freshenDate && !purchasePrice && priceDefaults.length > 0) {
      const calculated = calculatePurchasePrice(
        new Date(birthDate),
        new Date(freshenDate),
        priceDefaults
      );
      setCalculatedPrice(calculated);
    } else {
      setCalculatedPrice(null);
    }
  }, [birthDate, freshenDate, purchasePrice, priceDefaults]);

  // Calculate current depreciation for preview
  useEffect(() => {
    if (purchasePrice && salvageValue && freshenDate) {
      const depreciationInput = {
        purchasePrice: Number(purchasePrice),
        salvageValue: Number(salvageValue),
        freshenDate: new Date(freshenDate),
      };

      const result = calculateCurrentDepreciation(depreciationInput);
      setCurrentDepreciation(isOk(result) ? result.data : null);
    } else {
      setCurrentDepreciation(null);
    }
  }, [purchasePrice, salvageValue, freshenDate]);

  const useCalculatedPrice = () => {
    if (calculatedPrice) {
      setValue('purchasePrice', calculatedPrice);
    }
  };

  const onSubmit = async (data: CreateCowData) => {
    if (!currentCompany) {
      toast({
        title: "Error",
        description: "Please select a company first",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Validate data using domain validation
      const validationResult = validateCowForm({
        ...data,
        companyId: currentCompany.id,
      });

      if (!isOk(validationResult)) {
        throw validationResult.error;
      }

      const validatedData = validationResult.data;

      // Calculate initial depreciation values
      const depreciationResult = calculateCurrentDepreciation({
        purchasePrice: validatedData.purchasePrice,
        salvageValue: validatedData.salvageValue,
        freshenDate: validatedData.freshenDate,
      });

      const depreciation = unwrapOr(depreciationResult, {
        totalDepreciation: 0,
        currentValue: validatedData.purchasePrice,
        monthlyDepreciation: 0,
        monthsSinceFreshen: 0,
        remainingMonths: 60,
      });

      // Create cow record in database
      const cowId = crypto.randomUUID();
      const cowData = {
        id: cowId,
        company_id: currentCompany.id,
        tag_number: validatedData.tagNumber,
        name: validatedData.name || null,
        birth_date: validatedData.birthDate.toISOString().split('T')[0],
        freshen_date: validatedData.freshenDate.toISOString().split('T')[0],
        purchase_price: validatedData.purchasePrice,
        salvage_value: validatedData.salvageValue,
        asset_type_id: validatedData.assetType,
        status: validatedData.status,
        depreciation_method: validatedData.depreciationMethod,
        current_value: depreciation.currentValue,
        total_depreciation: depreciation.totalDepreciation,
        acquisition_type: validatedData.acquisitionType,
      };

      const { data: cow, error } = await supabase
        .from('cows')
        .insert(cowData)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Success",
        description: `Cow ${validatedData.tagNumber} added successfully`,
      });

      onAddCow(cow);
      reset();
      setCalculatedPrice(null);
      setCurrentDepreciation(null);

    } catch (error) {
      console.error('Error adding cow:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add cow",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Add New Cow
        </CardTitle>
        <CardDescription>
          Enter cow information. Purchase price can be auto-calculated based on dates.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tagNumber">Tag Number *</Label>
              <Input
                id="tagNumber"
                {...register('tagNumber')}
                placeholder="A001"
                className={errors.tagNumber ? 'border-red-500' : ''}
              />
              {errors.tagNumber && (
                <p className="text-sm text-red-600">{errors.tagNumber.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name (Optional)</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder="Bessie"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="birthDate">Birth Date *</Label>
              <Input
                id="birthDate"
                type="date"
                {...register('birthDate', { valueAsDate: true })}
                className={errors.birthDate ? 'border-red-500' : ''}
              />
              {errors.birthDate && (
                <p className="text-sm text-red-600">{errors.birthDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="freshenDate">Freshen Date *</Label>
              <Input
                id="freshenDate"
                type="date"
                {...register('freshenDate', { valueAsDate: true })}
                className={errors.freshenDate ? 'border-red-500' : ''}
              />
              {errors.freshenDate && (
                <p className="text-sm text-red-600">{errors.freshenDate.message}</p>
              )}
            </div>
          </div>

          {/* Price Calculation */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchasePrice">Purchase Price *</Label>
                <div className="flex gap-2">
                  <Input
                    id="purchasePrice"
                    type="number"
                    step="0.01"
                    {...register('purchasePrice', { valueAsNumber: true })}
                    placeholder="2500.00"
                    className={errors.purchasePrice ? 'border-red-500' : ''}
                  />
                  {calculatedPrice && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={useCalculatedPrice}
                      className="flex items-center gap-1"
                    >
                      <Calculator className="h-4 w-4" />
                      Use {formatCurrency(calculatedPrice)}
                    </Button>
                  )}
                </div>
                {errors.purchasePrice && (
                  <p className="text-sm text-red-600">{errors.purchasePrice.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="salvageValue">Salvage Value *</Label>
                <Input
                  id="salvageValue"
                  type="number"
                  step="0.01"
                  {...register('salvageValue', { valueAsNumber: true })}
                  placeholder="500.00"
                  className={errors.salvageValue ? 'border-red-500' : ''}
                />
                {errors.salvageValue && (
                  <p className="text-sm text-red-600">{errors.salvageValue.message}</p>
                )}
              </div>
            </div>

            {/* Depreciation Preview */}
            {currentDepreciation && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Depreciation Preview:</strong> Monthly: {formatCurrency(currentDepreciation.monthlyDepreciation)}, 
                  Current Value: {formatCurrency(currentDepreciation.currentValue)}, 
                  Total Depreciated: {formatCurrency(currentDepreciation.totalDepreciation)}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Additional Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="acquisitionType">Acquisition Type *</Label>
              <Select 
                value={watchedValues.acquisitionType} 
                onValueChange={(value) => setValue('acquisitionType', value as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select acquisition type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchased">Purchased</SelectItem>
                  <SelectItem value="raised">Raised</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assetType">Asset Type *</Label>
              <Input
                id="assetType"
                {...register('assetType')}
                placeholder="Dairy Cow"
                defaultValue="Dairy Cow"
                className={errors.assetType ? 'border-red-500' : ''}
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? 'Adding...' : 'Add Cow'}
            </Button>
            
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}