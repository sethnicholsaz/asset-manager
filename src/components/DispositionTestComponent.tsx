import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { processDisposition } from '@/domain/disposition/disposition-processor';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Cow {
  id: string;
  tag_number: string;
  purchase_price: number;
  salvage_value: number;
  freshen_date: string;
  current_value: number;
  total_depreciation: number;
  status: string;
}

export function DispositionTestComponent() {
  const [cows, setCows] = useState<Cow[]>([]);
  const [selectedCow, setSelectedCow] = useState<string>('');
  const [dispositionDate, setDispositionDate] = useState<string>('');
  const [dispositionType, setDispositionType] = useState<'sale' | 'death' | 'culled'>('sale');
  const [saleAmount, setSaleAmount] = useState<string>('0');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  
  const { toast } = useToast();
  const { currentCompany } = useAuth();

  const loadCows = async () => {
    if (!currentCompany) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cows')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('status', 'active')
        .order('tag_number');

      if (error) throw error;
      setCows(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to load cows: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const testDisposition = async () => {
    if (!selectedCow || !dispositionDate || !currentCompany) {
      toast({
        title: "Error",
        description: "Please select a cow and disposition date",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const result = await processDisposition({
        cowId: selectedCow,
        companyId: currentCompany.id,
        dispositionDate: new Date(dispositionDate),
        dispositionType,
        saleAmount: parseFloat(saleAmount) || 0,
        notes: 'Test disposition with enhanced depreciation calculation'
      });

      setResult(result);
      
      if (result.success) {
        toast({
          title: "Success",
          description: `Disposition processed successfully. Book value: $${result.finalBookValue?.toFixed(2)}, Gain/Loss: $${result.gainLoss?.toFixed(2)}`,
        });
      } else {
        toast({
          title: "Error",
          description: result.error || 'Unknown error occurred',
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to process disposition: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedCowData = cows.find(cow => cow.id === selectedCow);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Enhanced Disposition Testing</CardTitle>
          <CardDescription>
            Test the improved disposition depreciation calculations with partial month handling
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={loadCows} disabled={loading}>
            {loading ? 'Loading...' : 'Load Active Cows'}
          </Button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cow-select">Select Cow</Label>
              <Select value={selectedCow} onValueChange={setSelectedCow}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a cow" />
                </SelectTrigger>
                <SelectContent>
                  {cows.map((cow) => (
                    <SelectItem key={cow.id} value={cow.id}>
                      #{cow.tag_number} - ${cow.purchase_price} (${cow.current_value})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="disposition-date">Disposition Date</Label>
              <Input
                id="disposition-date"
                type="date"
                value={dispositionDate}
                onChange={(e) => setDispositionDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="disposition-type">Disposition Type</Label>
              <Select value={dispositionType} onValueChange={(value: 'sale' | 'death' | 'culled') => setDispositionType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="death">Death</SelectItem>
                  <SelectItem value="culled">Culled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sale-amount">Sale Amount</Label>
              <Input
                id="sale-amount"
                type="number"
                step="0.01"
                value={saleAmount}
                onChange={(e) => setSaleAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {selectedCowData && (
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-sm">Selected Cow Details</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div><strong>Tag:</strong> #{selectedCowData.tag_number}</div>
                <div><strong>Purchase Price:</strong> ${selectedCowData.purchase_price.toFixed(2)}</div>
                <div><strong>Salvage Value:</strong> ${selectedCowData.salvage_value.toFixed(2)}</div>
                <div><strong>Current Value:</strong> ${selectedCowData.current_value.toFixed(2)}</div>
                <div><strong>Total Depreciation:</strong> ${selectedCowData.total_depreciation.toFixed(2)}</div>
                <div><strong>Freshen Date:</strong> {new Date(selectedCowData.freshen_date).toLocaleDateString()}</div>
              </CardContent>
            </Card>
          )}

          <Button 
            onClick={testDisposition} 
            disabled={loading || !selectedCow || !dispositionDate}
            className="w-full"
          >
            {loading ? 'Processing...' : 'Test Disposition'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 