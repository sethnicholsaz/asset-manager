import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle, Info, Upload } from "lucide-react";

interface MasterFileData {
  id: string;
  birthdate: string;
}

interface VerificationResult {
  cowsNeedingDisposal: Array<{
    id: string;
    tagNumber: string;
    birthDate: string;
    status: string;
  }>;
  cowsMissingFromMaster: Array<{
    id: string;
    tagNumber: string;
    birthDate: string;
    status: string;
  }>;
  cowsMissingFreshenDate: Array<{
    id: string;
    tagNumber: string;
    birthDate: string;
    freshenDate: string | null;
  }>;
  totalMasterRecords: number;
  totalActiveInDb: number;
}

export default function MasterFileVerification() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<VerificationResult | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile);
      setResults(null);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file.",
        variant: "destructive",
      });
    }
  };

  const parseCsvData = (csvContent: string): MasterFileData[] => {
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    
    const idIndex = headers.findIndex(h => h.includes('id') || h.includes('tag'));
    const birthdateIndex = headers.findIndex(h => h.includes('birth') || h.includes('bdat'));
    
    if (idIndex === -1 || birthdateIndex === -1) {
      throw new Error('CSV must contain ID and birthdate columns');
    }

    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      return {
        id: values[idIndex],
        birthdate: values[birthdateIndex]
      };
    }).filter(row => row.id && row.birthdate);
  };

  const processDate = (dateStr: string): string => {
    // Handle various date formats
    const cleanDate = dateStr.replace(/['"]/g, '');
    
    if (cleanDate.includes('/')) {
      const [month, day, year] = cleanDate.split('/');
      const fullYear = year.length === 2 ? '20' + year : year;
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    return cleanDate;
  };

  const handleVerification = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const csvContent = await file.text();
      const masterData = parseCsvData(csvContent);

      // Get current company from auth context or however you manage it
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get user's company
      const { data: membership } = await supabase
        .from('company_memberships')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!membership) throw new Error('No company membership found');

      // Get all active cows from database
      const { data: activeCows, error: cowsError } = await supabase
        .from('cows')
        .select('id, tag_number, birth_date, freshen_date, status')
        .eq('company_id', membership.company_id)
        .eq('status', 'active');

      if (cowsError) throw cowsError;

      // Create verification results
      const results: VerificationResult = {
        cowsNeedingDisposal: [],
        cowsMissingFromMaster: [],
        cowsMissingFreshenDate: [],
        totalMasterRecords: masterData.length,
        totalActiveInDb: activeCows?.length || 0
      };

      // Check for cows missing freshen dates
      activeCows?.forEach(cow => {
        if (!cow.freshen_date) {
          results.cowsMissingFreshenDate.push({
            id: cow.id,
            tagNumber: cow.tag_number,
            birthDate: cow.birth_date,
            freshenDate: cow.freshen_date
          });
        }
      });

      // Create lookup for master data
      const masterLookup = new Set(
        masterData.map(m => `${m.id}_${processDate(m.birthdate)}`)
      );

      // Check for cows in DB but not in master (potentially need disposal)
      activeCows?.forEach(cow => {
        const key = `${cow.tag_number}_${cow.birth_date}`;
        if (!masterLookup.has(key)) {
          results.cowsNeedingDisposal.push({
            id: cow.id,
            tagNumber: cow.tag_number,
            birthDate: cow.birth_date,
            status: cow.status
          });
        }
      });

      // Create lookup for DB data
      const dbLookup = new Set(
        activeCows?.map(cow => `${cow.tag_number}_${cow.birth_date}`) || []
      );

      // Check for cows in master but not in DB (missing from database)
      masterData.forEach(master => {
        const key = `${master.id}_${processDate(master.birthdate)}`;
        if (!dbLookup.has(key)) {
          results.cowsMissingFromMaster.push({
            id: master.id,
            tagNumber: master.id,
            birthDate: processDate(master.birthdate),
            status: 'unknown'
          });
        }
      });

      setResults(results);
      toast({
        title: "Verification complete",
        description: `Processed ${masterData.length} master records against ${activeCows?.length || 0} active cows.`,
      });

    } catch (error) {
      console.error('Verification error:', error);
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "An error occurred during verification.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Master File Verification</h1>
          <p className="text-muted-foreground">
            Upload a master file to verify cow data integrity and identify discrepancies
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Master File
          </CardTitle>
          <CardDescription>
            Upload a CSV file containing cow ID and birthdate columns for all active cows
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="w-full"
            />
            <p className="text-sm text-muted-foreground mt-2">
              CSV should contain columns for cow ID/tag and birthdate
            </p>
          </div>
          
          <Button 
            onClick={handleVerification}
            disabled={!file || isProcessing}
            className="w-full"
          >
            {isProcessing ? "Processing..." : "Verify Master File"}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Verification Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span>Master file records:</span>
                <Badge variant="outline">{results.totalMasterRecords}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Active cows in database:</span>
                <Badge variant="outline">{results.totalActiveInDb}</Badge>
              </div>
            </CardContent>
          </Card>

          {results.cowsMissingFreshenDate.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Cows Missing Freshen Date ({results.cowsMissingFreshenDate.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.cowsMissingFreshenDate.map((cow, index) => (
                    <Alert key={index}>
                      <AlertDescription>
                        <strong>Tag #{cow.tagNumber}</strong> (Born: {cow.birthDate}) - Missing freshen date
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results.cowsNeedingDisposal.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Cows Possibly Needing Disposal ({results.cowsNeedingDisposal.length})
                </CardTitle>
                <CardDescription>
                  These cows are active in the database but not in the master file
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.cowsNeedingDisposal.map((cow, index) => (
                    <Alert key={index} variant="destructive">
                      <AlertDescription>
                        <strong>Tag #{cow.tagNumber}</strong> (Born: {cow.birthDate}) - Not found in master file
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results.cowsMissingFromMaster.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-blue-500" />
                  Cows Missing from Database ({results.cowsMissingFromMaster.length})
                </CardTitle>
                <CardDescription>
                  These cows are in the master file but not active in the database
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.cowsMissingFromMaster.map((cow, index) => (
                    <Alert key={index}>
                      <AlertDescription>
                        <strong>Tag #{cow.tagNumber}</strong> (Born: {cow.birthDate}) - Not found in database
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results.cowsNeedingDisposal.length === 0 && 
           results.cowsMissingFromMaster.length === 0 && 
           results.cowsMissingFreshenDate.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  All Good!
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>No discrepancies found. All cows match between master file and database.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}