import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, CheckCircle, Play, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ProcessingStatus {
  isProcessing: boolean;
  totalCowsProcessed: number;
  totalEntriesCreated: number;
  totalErrors: number;
  currentBatch: number;
  totalBatches: number;
  errorMessages: string[];
}

export function DepreciationCatchupProcessor() {
  const { currentCompany } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<ProcessingStatus>({
    isProcessing: false,
    totalCowsProcessed: 0,
    totalEntriesCreated: 0,
    totalErrors: 0,
    currentBatch: 0,
    totalBatches: 0,
    errorMessages: []
  });

  const [cowsNeedingCatchup, setCowsNeedingCatchup] = useState<number | null>(null);

  const checkCowsNeedingCatchup = async () => {
    if (!currentCompany) return;

    try {
      const { data, error } = await supabase
        .from('cows')
        .select('id')
        .eq('company_id', currentCompany.id)
        .eq('status', 'active')
        .lt('freshen_date', new Date().toISOString().split('T')[0]);

      if (error) throw error;

      // Check which cows have no depreciation entries
      const cowsWithDepreciation = new Set();
      for (const cow of data) {
        const { data: depreciationData } = await supabase
          .from('journal_lines')
          .select('id')
          .eq('cow_id', cow.id)
          .eq('account_code', '1500.1')
          .eq('line_type', 'credit')
          .limit(1);

        if (depreciationData && depreciationData.length > 0) {
          cowsWithDepreciation.add(cow.id);
        }
      }

      const cowsNeedingCatchup = data.length - cowsWithDepreciation.size;
      setCowsNeedingCatchup(cowsNeedingCatchup);

      if (cowsNeedingCatchup === 0) {
        toast({
          title: "No Processing Needed",
          description: "All cows already have their historical depreciation entries.",
        });
      }
    } catch (error) {
      console.error('Error checking cows needing catchup:', error);
      toast({
        title: "Error",
        description: "Failed to check cows needing depreciation catchup.",
        variant: "destructive",
      });
    }
  };

  const processDepreciationCatchup = async () => {
    if (!currentCompany) return;

    setStatus(prev => ({ ...prev, isProcessing: true, currentBatch: 0, totalBatches: 0 }));

    try {
      const batchSize = 50;
      let offset = 0;
      let totalCowsProcessed = 0;
      let totalEntriesCreated = 0;
      let totalErrors = 0;
      let errorMessages: string[] = [];
      let currentBatch = 0;

      // First, get total count to calculate total batches
      const { data: countData, error: countError } = await supabase
        .from('cows')
        .select('id', { count: 'exact' })
        .eq('company_id', currentCompany.id)
        .eq('status', 'active')
        .lt('freshen_date', new Date().toISOString().split('T')[0]);

      if (countError) throw countError;

      const totalCows = countData?.length || 0;
      const totalBatches = Math.ceil(totalCows / batchSize);

      setStatus(prev => ({ ...prev, totalBatches }));

      // Process in batches
      while (true) {
        currentBatch++;
        setStatus(prev => ({ ...prev, currentBatch }));

        const { data: batchResult, error: batchError } = await supabase
          .rpc('catch_up_cows_depreciation_batch', {
            p_company_id: currentCompany.id,
            p_batch_size: batchSize,
            p_offset: offset
          });

        if (batchError) {
          console.error('Batch processing error:', batchError);
          totalErrors++;
          errorMessages.push(`Batch ${currentBatch}: ${batchError.message}`);
        } else if (batchResult) {
          const result = batchResult as {
            success: boolean;
            total_cows_processed: number;
            total_entries_created: number;
            total_errors: number;
            error_messages: string[];
          };

          totalCowsProcessed += result.total_cows_processed;
          totalEntriesCreated += result.total_entries_created;
          totalErrors += result.total_errors;
          errorMessages.push(...result.error_messages);

          // Update status
          setStatus(prev => ({
            ...prev,
            totalCowsProcessed,
            totalEntriesCreated,
            totalErrors,
            errorMessages: [...errorMessages]
          }));

          // If no cows were processed in this batch, we're done
          if (result.total_cows_processed === 0) {
            break;
          }

          offset += batchSize;
        }

        // Add a small delay between batches to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setStatus(prev => ({ ...prev, isProcessing: false }));

      toast({
        title: "Processing Complete",
        description: `Processed ${totalCowsProcessed} cows and created ${totalEntriesCreated} depreciation entries.`,
      });

    } catch (error) {
      console.error('Error processing depreciation catchup:', error);
      setStatus(prev => ({ ...prev, isProcessing: false }));
      toast({
        title: "Error",
        description: "Failed to process depreciation catchup.",
        variant: "destructive",
      });
    }
  };

  const progress = status.totalBatches > 0 ? (status.currentBatch / status.totalBatches) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Historical Depreciation Catchup
        </CardTitle>
        <CardDescription>
          Create missing historical depreciation journal entries for cows that were uploaded without proper depreciation records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Button
            onClick={checkCowsNeedingCatchup}
            variant="outline"
            disabled={status.isProcessing}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Check Cows Needing Catchup
          </Button>

          {cowsNeedingCatchup !== null && (
            <div className="text-sm text-muted-foreground">
              {cowsNeedingCatchup} cows need depreciation catchup
            </div>
          )}
        </div>

        {cowsNeedingCatchup !== null && cowsNeedingCatchup > 0 && (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Found {cowsNeedingCatchup} cows that are missing historical depreciation entries. 
                This process will create monthly depreciation journal entries from each cow's freshen date to the current date.
              </AlertDescription>
            </Alert>

            <Button
              onClick={processDepreciationCatchup}
              disabled={status.isProcessing}
              className="w-full"
            >
              {status.isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing... (Batch {status.currentBatch}/{status.totalBatches})
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Depreciation Catchup
                </>
              )}
            </Button>

            {status.isProcessing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} />
                <div className="text-sm text-muted-foreground">
                  Processed {status.totalCowsProcessed} cows, created {status.totalEntriesCreated} entries
                  {status.totalErrors > 0 && `, ${status.totalErrors} errors`}
                </div>
              </div>
            )}

            {status.errorMessages.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div>Errors encountered:</div>
                    {status.errorMessages.slice(0, 5).map((error, index) => (
                      <div key={index} className="text-xs">• {error}</div>
                    ))}
                    {status.errorMessages.length > 5 && (
                      <div className="text-xs">... and {status.errorMessages.length - 5} more errors</div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {cowsNeedingCatchup === 0 && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              All cows already have their historical depreciation entries. No processing needed.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
} 