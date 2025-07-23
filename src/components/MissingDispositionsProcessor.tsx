import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProcessingResult {
  success: boolean;
  total_processed: number;
  total_amount: number;
  error_count: number;
  error?: string;
  results: Array<{
    disposition_id?: string;
    cow_id?: string;
    tag_number: string;
    disposition_type?: string;
    sale_amount?: number;
    display_amount?: number; // Add the new display amount field
    status: string;
    error?: string;
  }>;
}

export function MissingDispositionsProcessor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);

  const processDispositions = async () => {
    setIsProcessing(true);
    setResult(null);

    try {
      // Get the current user's company
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to process dispositions");
        return;
      }

      // Get user's company membership
      const { data: membership } = await supabase
        .from("company_memberships")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!membership) {
        toast.error("No company found for user");
        return;
      }

      // Call the RPC function to process missing disposition journals
      const { data, error } = await supabase.rpc("process_missing_disposition_journals", {
        p_company_id: membership.company_id
      });

      if (error) {
        console.error("Error processing dispositions:", error);
        toast.error("Failed to process dispositions: " + error.message);
        return;
      }

      setResult(data as unknown as ProcessingResult);
      
      if ((data as any).success) {
        toast.success(`Successfully processed ${(data as any).total_processed} dispositions with ${(data as any).error_count} errors`);
      } else {
        toast.error("Processing failed: " + (data as any).error);
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Process Missing Disposition Journals</CardTitle>
        <CardDescription>
          Generate journal entries for cow dispositions that don't have associated journal entries yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This will process all dispositions in your company that are missing journal entries. 
            Each disposition will get its own individual journal entry.
          </AlertDescription>
        </Alert>

        <Button 
          onClick={processDispositions} 
          disabled={isProcessing}
          className="w-full"
        >
          {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isProcessing ? "Processing..." : "Process Missing Disposition Journals"}
        </Button>

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-700">{result.total_processed}</div>
                <div className="text-sm text-green-600">Journals Created</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-700">{formatCurrency(result.total_amount)}</div>
                <div className="text-sm text-blue-600">Total Sale Amount</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-700">{result.error_count}</div>
                <div className="text-sm text-red-600">Errors</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-700">{result.results.length}</div>
                <div className="text-sm text-gray-600">Total Checked</div>
              </div>
            </div>

            {result.results.filter(r => r.status === 'success').length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Successfully Processed Dispositions:</h3>
                <div className="space-y-1 text-sm max-h-40 overflow-y-auto">
                  {result.results
                    .filter(r => r.status === 'success')
                    .slice(0, 10)
                    .map((item, index) => (
                      <div key={index} className="text-green-700">
                        #{item.tag_number} ({item.disposition_type}) - {formatCurrency(item.display_amount || item.sale_amount || 0)}
                      </div>
                    ))}
                  {result.results.filter(r => r.status === 'success').length > 10 && (
                    <div className="text-green-600">
                      +{result.results.filter(r => r.status === 'success').length - 10} more...
                    </div>
                  )}
                </div>
              </div>
            )}

            {result.results.filter(r => r.status === 'error').length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 text-red-700">Errors:</h3>
                <div className="space-y-1 text-sm max-h-40 overflow-y-auto">
                  {result.results
                    .filter(r => r.status === 'error')
                    .slice(0, 20)
                    .map((item, index) => (
                      <div key={index} className="text-red-600">
                        Cow #{item.tag_number}: {item.error}
                      </div>
                    ))}
                  {result.results.filter(r => r.status === 'error').length > 20 && (
                    <div className="text-red-500">
                      +{result.results.filter(r => r.status === 'error').length - 20} more errors...
                    </div>
                  )}
                </div>
              </div>
            )}

            {result.results.filter(r => r.status === 'info').length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 text-blue-700">Information:</h3>
                <div className="space-y-1 text-sm">
                  {result.results
                    .filter(r => r.status === 'info')
                    .map((item, index) => (
                      <div key={index} className="text-blue-600">
                        {item.error}
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