import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PurchasePriceDefault } from '@/types/cow';
import { useAuth } from '@/contexts/AuthContext';

interface CowUploadProps {
  onUpload: (data: any[]) => Promise<void>;
}

export function CowUpload({ onUpload }: CowUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [priceDefaults, setPriceDefaults] = useState<PurchasePriceDefault[]>([]);
  const [defaultAcquisitionType, setDefaultAcquisitionType] = useState<'purchased' | 'raised'>('purchased');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { currentCompany } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      if (!currentCompany?.id) return;

      // Fetch price defaults
      const { data: priceData, error: priceError } = await supabase
        .from('purchase_price_defaults')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('birth_year', { ascending: false });
      
      if (priceError) {
        console.error('Error fetching price defaults:', priceError);
      } else {
        const defaults = (priceData || []).map(item => ({
          ...item,
          created_at: new Date(item.created_at),
          updated_at: new Date(item.updated_at)
        }));
        setPriceDefaults(defaults);
      }

      // Fetch acquisition settings
      const { data: acquisitionData, error: acquisitionError } = await supabase
        .from('acquisition_settings')
        .select('default_acquisition_type')
        .eq('company_id', currentCompany.id)
        .maybeSingle();
      
      if (acquisitionError) {
        console.error('Error fetching acquisition settings:', acquisitionError);
      } else if (acquisitionData) {
        setDefaultAcquisitionType(acquisitionData.default_acquisition_type as 'purchased' | 'raised');
      }
    };

    fetchData();
  }, [currentCompany?.id]);

  const calculatePurchasePrice = (birthDate: Date, freshenDate: Date, birthYear: number) => {
    const defaults = priceDefaults.find(d => d.birth_year === birthYear);
    if (!defaults) return null;

    const daysDiff = Math.floor((freshenDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
    const accruedValue = daysDiff * defaults.daily_accrual_rate;
    
    return defaults.default_price + accruedValue;
  };

  const generateSampleCSV = () => {
    const sampleData = [
      ['tagNumber', 'name', 'birthDate', 'freshenDate', 'purchasePrice', 'salvageValue', 'acquisitionType'],
      ['001', 'Bessie', '2020-03-15', '2022-01-10', '2500', '250', 'purchased'],
      ['002', 'Molly', '2019-08-22', '2021-05-15', '', '', 'raised'],
      ['003', '', '2020-11-05', '2022-08-20', '2800', '280', 'purchased'],
      ['004', 'Daisy', '2021-01-12', '2022-10-18', '', '300', 'raised'],
      ['005', 'Luna', '2019-06-30', '2021-03-25', '3000', '300', 'purchased']
    ];

    const csvContent = sampleData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sample_cow_data.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Sample Downloaded",
      description: "Sample CSV file has been downloaded to help you format your data.",
    });
  };

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
      const requiredHeaders = ['tagnumber', 'birthdate', 'freshendate'];
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
                case 'acquisitiontype':
                  cow.acquisitionType = value.toLowerCase() === 'raised' ? 'raised' : 'purchased';
                  break;
              }
            });

            // Calculate purchase price if not provided
            if (!cow.purchasePrice && cow.birthDate && cow.freshenDate) {
              const birthYear = cow.birthDate.getFullYear();
              const calculatedPrice = calculatePurchasePrice(cow.birthDate, cow.freshenDate, birthYear);
              if (calculatedPrice) {
                cow.purchasePrice = calculatedPrice;
              } else {
                // Fallback to a default if no price defaults found
                cow.purchasePrice = 2000; // Default base price
              }
            }

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
            
            // Set default acquisition type if not provided
            if (!cow.acquisitionType) {
              cow.acquisitionType = defaultAcquisitionType;
            }
            
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

      await onUpload(data);
      setUploadStatus('success');
      // Don't show the toast here as the parent component will handle it

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
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Need a template? Download our sample CSV file to get started.
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={generateSampleCSV}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download Sample
          </Button>
        </div>

        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Select a CSV file to upload cow data
            </p>
            <p className="text-xs text-muted-foreground">
              Supports .csv files up to 10MB
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
          </ul>
          <p className="font-medium mt-3">Optional columns:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>name - Cow name</li>
            <li>purchasePrice - Initial cost/value (auto-calculated if not provided)</li>
            <li>salvageValue - End-of-life value (defaults to 10% of purchase price)</li>
            <li>acquisitionType - "purchased" or "raised" (defaults to configured setting)</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Auto-calculation:</strong> If purchasePrice is not provided, it will be calculated using birth year defaults plus daily accrual rate from birth to freshen date.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Acquisition Type:</strong> Use "purchased" for cows bought from external sources, "raised" for cows born and raised on your farm. Default can be configured in Settings → Acquisition.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}