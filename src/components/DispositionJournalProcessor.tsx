import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ProcessingResult {
  success: boolean;
  total_processed: number;
  total_errors: number;
  error_messages: string[];
}

export function DispositionJournalProcessor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const { currentCompany } = useAuth();

  const processMissingJournals = async () => {
    if (!currentCompany) {
      setResult({
        success: false,
        total_processed: 0,
        total_errors: 1,
        error_messages: ['No company selected']
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      // Call the function to process missing disposition journals
      const { data, error } = await supabase.rpc('process_missing_disposition_journals', {
        p_company_id: currentCompany.id
      });

      if (error) {
        throw error;
      }

      setResult(data as unknown as ProcessingResult);

    } catch (error) {
      console.error('Error processing missing disposition journals:', error);
      setResult({
        success: false,
        total_processed: 0,
        total_errors: 1,
        error_messages: [error instanceof Error ? error.message : 'Unknown error occurred']
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const checkMissingJournals = async () => {
    if (!currentCompany) {
      setResult({
        success: false,
        total_processed: 0,
        total_errors: 1,
        error_messages: ['No company selected']
      });
      return;
    }

    try {
      // Check for dispositions without journal entries
      const { data: missingJournals, error } = await supabase
        .from('cow_dispositions')
        .select('id, disposition_date, disposition_type, cow_id')
        .eq('company_id', currentCompany.id)
        .is('journal_entry_id', null);

      if (error) {
        console.error('Error checking missing journals:', error);
        return;
      }

      if (missingJournals && missingJournals.length > 0) {
        setResult({
          success: true,
          total_processed: 0,
          total_errors: 0,
          error_messages: [`Found ${missingJournals.length} dispositions without journal entries`]
        });
      } else {
        setResult({
          success: true,
          total_processed: 0,
          total_errors: 0,
          error_messages: ['All dispositions have journal entries']
        });
      }

    } catch (error) {
      console.error('Error checking missing journals:', error);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Disposition Journal Processor
        </CardTitle>
        <CardDescription>
          Process missing disposition journal entries for dispositions that were uploaded without journals
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={processMissingJournals} 
            disabled={isProcessing}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Process Missing Journals'
            )}
          </Button>
          <Button 
            onClick={checkMissingJournals} 
            disabled={isProcessing}
            variant="outline"
          >
            Check Status
          </Button>
        </div>

        {result && (
          <Alert className={result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            {result.success ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription className="space-y-2">
              {result.total_processed > 0 && (
                <div className="text-green-700">
                  ✅ Successfully processed {result.total_processed} disposition journal(s)
                </div>
              )}
              {result.total_errors > 0 && (
                <div className="text-red-700">
                  ❌ {result.total_errors} error(s) occurred during processing
                </div>
              )}
              {result.error_messages.length > 0 && (
                <div className="text-sm">
                  {result.error_messages.map((message, index) => (
                    <div key={index} className="mt-1">
                      {message}
                    </div>
                  ))}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="text-sm text-muted-foreground">
          <p>This tool will:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Find dispositions without journal entries</li>
            <li>Create proper journal entries with accurate calculations</li>
            <li>Handle partial month depreciation if needed</li>
            <li>Clean up any future depreciation entries</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
} 