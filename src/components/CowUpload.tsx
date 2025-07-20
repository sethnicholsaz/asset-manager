import { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

interface CowUploadProps {
  onUpload: (data: any[]) => void;
}

export function CowUpload({ onUpload }: CowUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadStatus('error');
      setErrorMessage('Please select a CSV file');
      return;
    }

    setIsProcessing(true);
    setUploadStatus('idle');
    setErrorMessage('');

    try {
      const text = await file.text();
      const rows = text.split('\n').map(row => row.split(','));
      const headers = rows[0].map(h => h.trim().toLowerCase());
      
      // Validate required headers
      const requiredHeaders = ['tagnumber', 'birthdate', 'freshendate', 'purchaseprice'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      
      if (missingHeaders.length > 0) {
        throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
      }

      // Parse data rows
      const data = rows.slice(1)
        .filter(row => row.some(cell => cell.trim())) // Filter empty rows
        .map((row, index) => {
          try {
            const cow: any = {};
            headers.forEach((header, i) => {
              const value = row[i]?.trim();
              if (!value) return;

              switch (header) {
                case 'tagnumber':
                  cow.tagNumber = value;
                  break;
                case 'name':
                  cow.name = value;
                  break;
                case 'birthdate':
                  cow.birthDate = new Date(value);
                  break;
                case 'freshendate':
                  cow.freshenDate = new Date(value);
                  break;
                case 'purchaseprice':
                  cow.purchasePrice = parseFloat(value);
                  break;
                case 'salvagevalue':
                  cow.salvageValue = parseFloat(value) || 0;
                  break;
              }
            });

            // Generate ID and set defaults
            cow.id = `cow-${cow.tagNumber}-${Date.now()}`;
            cow.status = 'active';
            cow.depreciationMethod = 'straight-line';
            cow.assetType = { 
              id: 'dairy-cow',
              name: 'Dairy Cow',
              defaultDepreciationYears: 5,
              defaultDepreciationMethod: 'straight-line',
              defaultSalvagePercentage: 10
            };
            
            if (!cow.salvageValue && cow.purchasePrice) {
              cow.salvageValue = cow.purchasePrice * 0.1; // Default 10% salvage value
            }
            
            cow.currentValue = cow.purchasePrice;
            cow.totalDepreciation = 0;

            return cow;
          } catch (error) {
            throw new Error(`Error processing row ${index + 2}: ${error}`);
          }
        });

      if (data.length === 0) {
        throw new Error('No valid data rows found');
      }

      onUpload(data);
      setUploadStatus('success');
      toast({
        title: "Upload Successful",
        description: `Successfully imported ${data.length} cows`,
      });

    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to process file');
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : 'Failed to process file',
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Import Cow Data
        </CardTitle>
        <CardDescription>
          Upload a CSV file containing your dairy cow information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Select a CSV file to upload cow data
            </p>
            <Button 
              onClick={handleUploadClick}
              disabled={isProcessing}
              className="mt-4"
            >
              {isProcessing ? 'Processing...' : 'Choose File'}
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploadStatus === 'success' && (
          <Alert className="border-success bg-success/10">
            <CheckCircle className="h-4 w-4 text-success" />
            <AlertDescription className="text-success-foreground">
              File uploaded successfully!
            </AlertDescription>
          </Alert>
        )}

        {uploadStatus === 'error' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {errorMessage}
            </AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-muted-foreground space-y-2">
          <p className="font-medium">Required CSV columns:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>tagNumber - Unique identifier for the cow</li>
            <li>birthDate - Birth date (MM/DD/YYYY or YYYY-MM-DD)</li>
            <li>freshenDate - First freshen date (depreciation start)</li>
            <li>purchasePrice - Initial cost/value</li>
          </ul>
          <p className="font-medium mt-3">Optional columns:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>name - Cow name</li>
            <li>salvageValue - End-of-life value (defaults to 10% of purchase price)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}