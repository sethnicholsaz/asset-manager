import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, CheckCircle2, DollarSign, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ProcessingResult {
  total_processed: number;
  total_amount: number;
  error_count: number;
  cows_checked: number;
  details: Array<{
    cow_id: string;
    tag_number: string;
    amount?: number;
    status: 'success' | 'error';
    error?: string;
  }>;
}

export function MissingAcquisitionsProcessor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  const processAcquisitions = async () => {
    if (!currentCompany) return;

    setIsProcessing(true);
    setResult(null);

    try {
      console.log('🏢 Processing company:', currentCompany.id);

      // Call the database function directly
      const { data, error } = await supabase.rpc('process_missing_acquisition_journals', {
        p_company_id: currentCompany.id
      });

      if (error) {
        console.error('Error processing acquisitions:', error);
        toast({
          title: "Processing Failed",
          description: error.message || "Failed to process missing acquisitions",
          variant: "destructive",
        });
        return;
      }

      // Type the response data properly
      const responseData = data as {
        success: boolean;
        total_processed: number;
        total_amount: number;
        error_count: number;
        results?: Array<{
          cow_id: string;
          tag_number: string;
          amount?: number;
          acquisition_type?: string;
          status: 'success' | 'error';
          error?: string;
        }>;
        error?: string;
      };

      if (responseData && responseData.success) {
        setResult({
          total_processed: responseData.total_processed,
          total_amount: responseData.total_amount,
          error_count: responseData.error_count,
          cows_checked: responseData.total_processed + responseData.error_count,
          details: responseData.results || []
        });
        
        toast({
          title: "Processing Complete",
          description: `Successfully processed ${responseData.total_processed} acquisition entries for a total of $${responseData.total_amount.toLocaleString()}`,
        });
      } else {
        toast({
          title: "Processing Failed",
          description: responseData?.error || "Failed to process missing acquisitions",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Process Missing Acquisition Journals
        </CardTitle>
        <CardDescription>
          Create acquisition journal entries for cows that were imported before this functionality was added.
          This processes both "purchased" and "raised" cows:
          <br />• <strong>Purchased cows:</strong> Debit "Dairy Cows", Credit "Cash"
          <br />• <strong>Raised cows:</strong> Debit "Dairy Cows", Credit "Heifers" (asset transfer)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This process will create journal entries for all cows that don't already have acquisition records.
            For purchased cows: Debit "Dairy Cows", Credit "Cash". For raised cows: Debit "Dairy Cows", Credit "Heifers".
          </AlertDescription>
        </Alert>

        <div className="flex gap-4">
          <Button 
            onClick={processAcquisitions}
            disabled={isProcessing}
            className="flex items-center gap-2"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isProcessing ? 'Processing...' : 'Process Missing Acquisitions'}
          </Button>
        </div>

        {result && (
          <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold">Processing Complete</h3>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{result.cows_checked}</div>
                <div className="text-sm text-muted-foreground">Cows Checked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{result.total_processed}</div>
                <div className="text-sm text-muted-foreground">Journals Created</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{formatCurrency(result.total_amount)}</div>
                <div className="text-sm text-muted-foreground">Total Amount</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{result.error_count}</div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
            </div>

            {result.total_processed > 0 && (
              <div>
                <h4 className="font-medium mb-2">Successfully Processed Cows:</h4>
                <div className="flex flex-wrap gap-2">
                  {result.details
                    .filter(detail => detail.status === 'success')
                    .slice(0, 10)
                    .map((detail) => (
                      <Badge key={detail.cow_id} variant="outline" className="text-green-600">
                        #{detail.tag_number} ({formatCurrency(detail.amount || 0)})
                      </Badge>
                    ))}
                  {result.details.filter(d => d.status === 'success').length > 10 && (
                    <Badge variant="outline">
                      +{result.details.filter(d => d.status === 'success').length - 10} more...
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {result.error_count > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-red-600">Errors:</h4>
                <div className="space-y-1">
                  {result.details
                    .filter(detail => detail.status === 'error')
                    .map((detail) => (
                      <div key={detail.cow_id} className="text-sm text-red-600">
                        Cow #{detail.tag_number}: {detail.error}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}