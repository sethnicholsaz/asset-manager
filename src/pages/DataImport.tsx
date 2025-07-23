import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from '@/components/ui/separator';
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Upload, AlertCircle, CheckCircle, FileText, UploadCloud } from "lucide-react";

// Import existing components
import { CowUpload } from '@/components/CowUpload';
import { CowForm } from '@/components/CowForm';
import { Cow } from '@/types/cow';

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

export default function DataImport() {
  // Manual import state
  const [cows, setCows] = useState<Cow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Automated import state
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessedResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<'fresh' | 'disposition' | null>(null);
  
  // Master file verification state
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  // Manual import functions
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
      const cowData = uploadedCows.map(cow => ({
        id: cow.tagNumber,
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

      // Create acquisition journal entries for each cow
      console.log('Creating acquisition journal entries for', cowData.length, 'cows...');
      for (const cow of cowData) {
        try {
          const { data: journalResult, error: journalError } = await supabase
            .rpc('process_acquisition_journal', {
              p_cow_id: cow.id,
              p_company_id: currentCompany.id
            });
          
          if (journalError) {
            console.error('Journal creation error for cow', cow.tag_number, ':', journalError);
          } else {
            console.log('Journal created for cow', cow.tag_number, ':', journalResult);
          }
        } catch (err) {
          console.error('Error creating journal for cow', cow.tag_number, ':', err);
        }
      }

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

  // Automated import functions
  const parseCsvData = (csvContent: string): AutomatedCowData[] => {
    const lines = csvContent.trim().split('\n');
    const firstLine = lines[0];
    
    let delimiter = ',';
    if (firstLine.includes('\t') && !firstLine.includes(',')) {
      delimiter = '\t';
    }
    
    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/"/g, ''));
    const expectedHeaders = ['ID', 'BDAT', 'EVENT', 'DIM', 'DATE', 'REMARK', 'PROTOCOLS', 'TECHNICIAN'];
    const normalizedHeaders = headers.map(h => h.toUpperCase());
    const missingHeaders = expectedHeaders.filter(expected => 
      !normalizedHeaders.includes(expected)
    );
    
    if (missingHeaders.length > 0) {
      throw new Error(`Invalid headers. Expected: ${expectedHeaders.join(', ')}. Found: ${headers.join(', ')}. Missing: ${missingHeaders.join(', ')}`);
    }

    return lines.slice(1).map(line => {
      const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      headers.forEach((header, index) => {
        const normalizedHeader = header.toUpperCase();
        row[normalizedHeader] = values[index] || '';
      });
      return row as AutomatedCowData;
    });
  };

  const processDate = (dateStr: string): Date => {
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
        if (row.EVENT.toUpperCase() !== 'FRESH') {
          result.skipped++;
          continue;
        }

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

        const birthYear = birthDate.getFullYear();
        const { data: priceDefaults } = await supabase
          .from('purchase_price_defaults')
          .select('*')
          .eq('birth_year', birthYear)
          .eq('company_id', currentCompany?.id)
          .single();

        let purchasePrice = 1500;
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
          salvage_value: purchasePrice * 0.1,
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
        if (!['DIED', 'SOLD'].includes(row.EVENT.toUpperCase())) {
          result.skipped++;
          continue;
        }

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
        const dispositionType = row.EVENT.toUpperCase() === 'DIED' ? 'death' : 'sale';
        const newStatus = row.EVENT.toUpperCase() === 'DIED' ? 'deceased' : 'sold';

        // First, bring the cow's depreciation up to date through the disposal month
        try {
          const { data: catchupResult, error: catchupError } = await supabase.functions.invoke('cow-depreciation-catchup', {
            body: {
              cow_id: existingCow.id,
              company_id: currentCompany?.id
            }
          });

          if (catchupError) {
            console.error(`Depreciation catch-up error for cow ${row.ID}:`, catchupError);
          } else {
            console.log(`Depreciation catch-up completed for cow ${row.ID}:`, catchupResult);
          }
        } catch (catchupError) {
          console.error(`Error calling depreciation catch-up for cow ${row.ID}:`, catchupError);
        }

        // Re-fetch cow data after depreciation catch-up to get updated values
        const { data: updatedCow } = await supabase
          .from('cows')
          .select('current_value, total_depreciation')
          .eq('id', existingCow.id)
          .single();

        const finalBookValue = updatedCow?.current_value || existingCow.current_value;

        const dispositionData = {
          cow_id: existingCow.id,
          disposition_date: dispositionDate.toISOString().split('T')[0],
          disposition_type: dispositionType,
          sale_amount: 0,
          final_book_value: Number(finalBookValue),
          gain_loss: 0 - Number(finalBookValue),
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, fileType: 'fresh' | 'disposition') => {
    const file = event.target.files?.[0];
    
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "Invalid file",
        description: "Please select a CSV file",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setUploadType(fileType);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadType) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file first",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const csvContent = await selectedFile.text();
      const data = parseCsvData(csvContent);

      let result: ProcessedResult;
      if (uploadType === 'fresh') {
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

        // Automatically process missing acquisition journals after successful cow upload
        console.log('🔍 Upload completed - checking if should auto-process acquisitions:', {
          uploadType,
          processed: result.processed,
          shouldProcess: uploadType === 'fresh'
        });
        
        if (uploadType === 'fresh') {
          try {
            console.log('🔄 Auto-processing missing acquisition journals...');
            const { data: acquisitionData, error: acquisitionError } = await supabase.rpc('process_missing_acquisition_journals', {
              p_company_id: currentCompany?.id
            });

            if (acquisitionError) {
              console.error('Error auto-processing acquisitions:', acquisitionError);
              toast({
                title: "Acquisition Processing Failed",
                description: "Upload successful, but failed to auto-process acquisition journals. Please run manually from Settings.",
                variant: "destructive",
              });
            } else if (acquisitionData && typeof acquisitionData === 'object' && 'success' in acquisitionData && acquisitionData.success && 'total_processed' in acquisitionData && (acquisitionData.total_processed as number) > 0) {
              toast({
                title: "Acquisition Journals Created",
                description: `Automatically created ${acquisitionData.total_processed as number} acquisition journal entries`,
              });
            }
          } catch (error) {
            console.error('Error in auto-processing acquisitions:', error);
            toast({
              title: "Acquisition Processing Error",
              description: "Upload successful, but error during auto-processing. Please run manually from Settings.",
              variant: "destructive",
            });
          }
        }
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
    }
  };

  // Master file verification functions
  const handleMasterFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "text/csv") {
      setMasterFile(file);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file.",
        variant: "destructive",
      });
    }
  };

  const handleMasterFileVerification = async () => {
    if (!masterFile || !currentCompany) return;

    setIsVerifying(true);
    try {
      const formData = new FormData();
      formData.append('master', masterFile);
      formData.append('company_id', currentCompany.id);

      const response = await fetch(
        'https://qadhrhlagitqfsyfcnnr.supabase.co/functions/v1/master-file-upload',
        {
          method: 'POST',
          body: formData,
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Verification failed');
      }

      toast({
        title: "Verification complete",
        description: result.message,
      });

      setMasterFile(null);

    } catch (error) {
      console.error('Verification error:', error);
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "An error occurred during verification.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Import</h1>
        <p className="text-muted-foreground">
          Import cow data manually or through automated CSV processing
        </p>
      </div>

      <Tabs defaultValue="manual" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Manual Import
          </TabsTrigger>
          <TabsTrigger value="automated" className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4" />
            Automated Import
          </TabsTrigger>
          <TabsTrigger value="verification" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Master File Verification
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="manual" className="space-y-8">
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
        </TabsContent>
        
        <TabsContent value="automated" className="space-y-6">
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
                    onChange={(e) => handleFileSelect(e, 'fresh')}
                    disabled={isProcessing}
                  />
                  {selectedFile && uploadType === 'fresh' && (
                    <p className="text-sm text-muted-foreground">
                      Selected: {selectedFile.name}
                    </p>
                  )}
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
                    onChange={(e) => handleFileSelect(e, 'disposition')}
                    disabled={isProcessing}
                  />
                  {selectedFile && uploadType === 'disposition' && (
                    <p className="text-sm text-muted-foreground">
                      Selected: {selectedFile.name}
                    </p>
                  )}
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

          {/* Upload Button */}
          {selectedFile && uploadType && (
            <Card>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5" />
                  <div>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Ready to process as {uploadType === 'fresh' ? 'Fresh Cows' : 'Dispositions'}
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={handleUpload} 
                  disabled={isProcessing}
                  className="min-w-[120px]"
                >
                  {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Processing...
                    </div>
                  ) : (
                    'Upload & Process'
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

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
                    <h4 className="font-medium">Errors:</h4>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {result.errors.map((error, index) => (
                        <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                          {error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="verification" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Master File Verification
              </CardTitle>
              <CardDescription>
                Upload a CSV file containing cow ID and birthdate columns for all active cows to verify data integrity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="master-file">Select Master File CSV</Label>
                <Input
                  id="master-file"
                  type="file"
                  accept=".csv"
                  onChange={handleMasterFileSelect}
                  disabled={isVerifying}
                />
                {masterFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {masterFile.name}
                  </p>
                )}
              </div>
              
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  <strong>Expected format:</strong> CSV should contain columns for cow ID/tag and birthdate
                  <br />
                  <strong>Purpose:</strong> Verifies data integrity and identifies discrepancies between your database and master file
                </AlertDescription>
              </Alert>
              
              <Button 
                onClick={handleMasterFileVerification}
                disabled={!masterFile || isVerifying}
                className="w-full"
              >
                {isVerifying ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Verifying...
                  </div>
                ) : (
                  'Verify Master File'
                )}
              </Button>
              
              {!masterFile && (
                <p className="text-sm text-muted-foreground text-center">
                  After verification, any discrepancies will appear in "Cows Needing Attention" for review
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}