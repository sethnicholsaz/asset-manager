import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Upload, AlertCircle, CheckCircle, FileText } from "lucide-react";

interface AutomatedCowData {
  ID: string;
  BDAT: string;
  EVENT: string;
  DIM: string;
  DATE: string;
  REMARK: string;
  PROTOCOLS: string;
  TECHNICIAN: string;
}

interface ProcessedResult {
  processed: number;
  skipped: number;
  errors: string[];
}

export default function AutomatedImport() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessedResult | null>(null);
  const { toast } = useToast();
  const { currentCompany } = useAuth();

  const parseCsvData = (csvContent: string): AutomatedCowData[] => {
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    // Validate headers
    const expectedHeaders = ['ID', 'BDAT', 'EVENT', 'DIM', 'DATE', 'REMARK', 'PROTOCOLS', 'TECHNICIAN'];
    const hasValidHeaders = expectedHeaders.every(header => headers.includes(header));
    
    if (!hasValidHeaders) {
      throw new Error(`Invalid headers. Expected: ${expectedHeaders.join(', ')}`);
    }

    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row as AutomatedCowData;
    });
  };

  const processDate = (dateStr: string): Date => {
    // Handle various date formats
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }
    return date;
  };

  const processFreshCows = async (data: AutomatedCowData[]): Promise<ProcessedResult> => {
    const result: ProcessedResult = { processed: 0, skipped: 0, errors: [] };
    
    for (const row of data) {
      try {
        if (row.EVENT !== 'Fresh') {
          result.skipped++;
          continue;
        }

        // Check if cow already exists
        const { data: existingCow } = await supabase
          .from('cows')
          .select('id')
          .eq('tag_number', row.ID)
          .eq('company_id', currentCompany?.id)
          .single();

        if (existingCow) {
          result.skipped++;
          result.errors.push(`Cow ${row.ID} already exists`);
          continue;
        }

        const birthDate = processDate(row.BDAT);
        const freshenDate = processDate(row.DATE);

        // Calculate purchase price (simplified - using birth year 2024 as default)
        const birthYear = birthDate.getFullYear();
        const { data: priceDefaults } = await supabase
          .from('purchase_price_defaults')
          .select('*')
          .eq('birth_year', birthYear)
          .eq('company_id', currentCompany?.id)
          .single();

        let purchasePrice = 1500; // Default fallback
        if (priceDefaults) {
          const daysDiff = Math.floor((freshenDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
          purchasePrice = Number(priceDefaults.default_price) + (daysDiff * Number(priceDefaults.daily_accrual_rate));
        }

        const cowData = {
          id: row.ID,
          tag_number: row.ID,
          birth_date: birthDate.toISOString().split('T')[0],
          freshen_date: freshenDate.toISOString().split('T')[0],
          purchase_price: purchasePrice,
          current_value: purchasePrice,
          salvage_value: purchasePrice * 0.1, // 10% default
          asset_type_id: 'dairy-cow',
          status: 'active',
          depreciation_method: 'straight-line',
          total_depreciation: 0,
          acquisition_type: 'purchased',
          company_id: currentCompany?.id
        };

        const { error } = await supabase
          .from('cows')
          .insert(cowData);

        if (error) {
          result.errors.push(`Failed to insert cow ${row.ID}: ${error.message}`);
        } else {
          result.processed++;
        }
      } catch (error) {
        result.errors.push(`Error processing cow ${row.ID}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  };

  const processDispositions = async (data: AutomatedCowData[]): Promise<ProcessedResult> => {
    const result: ProcessedResult = { processed: 0, skipped: 0, errors: [] };
    
    for (const row of data) {
      try {
        if (!['Died', 'Sold'].includes(row.EVENT)) {
          result.skipped++;
          continue;
        }

        // Find existing cow
        const { data: existingCow, error: cowError } = await supabase
          .from('cows')
          .select('*')
          .eq('tag_number', row.ID)
          .eq('company_id', currentCompany?.id)
          .single();

        if (cowError || !existingCow) {
          result.errors.push(`Cow ${row.ID} not found for disposition`);
          continue;
        }

        const dispositionDate = processDate(row.DATE);
        const dispositionType = row.EVENT === 'Died' ? 'death' : 'sale';
        const newStatus = row.EVENT === 'Died' ? 'deceased' : 'sold';

        // Create disposition record
        const dispositionData = {
          cow_id: existingCow.id,
          disposition_date: dispositionDate.toISOString().split('T')[0],
          disposition_type: dispositionType,
          sale_amount: 0, // Default to 0 as requested
          final_book_value: Number(existingCow.current_value),
          gain_loss: 0 - Number(existingCow.current_value), // Loss = 0 - current_value
          company_id: currentCompany?.id
        };

        const { data: disposition, error: dispositionError } = await supabase
          .from('cow_dispositions')
          .insert(dispositionData)
          .select()
          .single();

        if (dispositionError) {
          result.errors.push(`Failed to create disposition for cow ${row.ID}: ${dispositionError.message}`);
          continue;
        }

        // Update cow status and link to disposition
        const { error: updateError } = await supabase
          .from('cows')
          .update({
            status: newStatus,
            disposition_id: disposition.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingCow.id);

        if (updateError) {
          result.errors.push(`Failed to update cow ${row.ID} status: ${updateError.message}`);
        } else {
          result.processed++;
        }
      } catch (error) {
        result.errors.push(`Error processing disposition ${row.ID}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, fileType: 'fresh' | 'disposition') => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('File selected:', file.name, 'Type:', fileType);

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid file",
        description: "Please select a CSV file",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const csvContent = await file.text();
      console.log('CSV content preview:', csvContent.substring(0, 200));
      const data = parseCsvData(csvContent);
      console.log('Parsed data:', data.slice(0, 2)); // Log first 2 rows

      let result: ProcessedResult;
      if (fileType === 'fresh') {
        result = await processFreshCows(data);
      } else {
        result = await processDispositions(data);
      }

      setResult(result);

      if (result.processed > 0) {
        toast({
          title: "Upload successful",
          description: `Processed ${result.processed} records successfully`,
        });
      }

      if (result.errors.length > 0) {
        toast({
          title: "Some errors occurred",
          description: `${result.errors.length} errors encountered`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      // Reset file input
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Automated Import</h1>
        <p className="text-muted-foreground">
          Upload CSV files for automated processing of fresh cows and dispositions
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Fresh Cows Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Fresh Cows
            </CardTitle>
            <CardDescription>
              Upload CSV file containing fresh cow data (EVENT=Fresh)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fresh-upload">Select Fresh Cows CSV</Label>
              <Input
                id="fresh-upload"
                type="file"
                accept=".csv"
                onChange={(e) => handleFileUpload(e, 'fresh')}
                disabled={isProcessing}
              />
            </div>
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                <strong>Expected columns:</strong> ID, BDAT, EVENT, DIM, DATE, REMARK, PROTOCOLS, TECHNICIAN
                <br />
                <strong>Processing:</strong> Only rows with EVENT=Fresh will be processed as new cows
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Dispositions Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Dispositions
            </CardTitle>
            <CardDescription>
              Upload CSV file containing disposition data (EVENT=Died/Sold)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="disposition-upload">Select Dispositions CSV</Label>
              <Input
                id="disposition-upload"
                type="file"
                accept=".csv"
                onChange={(e) => handleFileUpload(e, 'disposition')}
                disabled={isProcessing}
              />
            </div>
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                <strong>Expected columns:</strong> ID, BDAT, EVENT, DIM, DATE, REMARK, PROTOCOLS, TECHNICIAN
                <br />
                <strong>Processing:</strong> Only rows with EVENT=Died or EVENT=Sold will be processed
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {/* Processing Status */}
      {isProcessing && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span>Processing file...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.errors.length === 0 ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              )}
              Processing Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{result.processed}</div>
                <div className="text-sm text-muted-foreground">Processed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{result.skipped}</div>
                <div className="text-sm text-muted-foreground">Skipped</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{result.errors.length}</div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-red-600">Errors:</h4>
                <div className="bg-red-50 rounded-md p-3 max-h-40 overflow-y-auto">
                  {result.errors.map((error, index) => (
                    <div key={index} className="text-sm text-red-700">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}