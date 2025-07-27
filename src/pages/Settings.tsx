
import { Building, Calculator, DollarSign, FileText, Scale, Copy, Database } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DepreciationSettings } from '@/components/DepreciationSettings';
import { PurchasePriceSettings } from '@/components/PurchasePriceSettings';
import { GLAccountSettings } from '@/components/GLAccountSettings';
import { BalanceAdjustments } from '@/components/BalanceAdjustments';
import { UploadTokenManager } from '@/components/UploadTokenManager';
import { AcquisitionSettings } from '@/components/AcquisitionSettings';
import { MissingAcquisitionsProcessor } from '@/components/MissingAcquisitionsProcessor';
import { MissingDispositionsProcessor } from '@/components/MissingDispositionsProcessor';
import { DispositionJournalProcessor } from '@/components/DispositionJournalProcessor';
import { DepreciationCatchupProcessor } from '@/components/DepreciationCatchupProcessor';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  const copyToClipboard = (text: string, description: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description,
    });
  };

  if (!currentCompany) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">No Company Selected</h2>
          <p className="text-muted-foreground">Please select a company to access settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your company settings, depreciation preferences, and account configurations
        </p>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Company & API
          </TabsTrigger>
          <TabsTrigger value="depreciation" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Depreciation
          </TabsTrigger>
          <TabsTrigger value="pricing" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Pricing
          </TabsTrigger>
          <TabsTrigger value="acquisition" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Acquisition
          </TabsTrigger>
          <TabsTrigger value="accounts" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            GL Accounts
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Balance Adjustments
          </TabsTrigger>
          <TabsTrigger value="data-processing" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Data Processing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>
                Basic information about your company
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Company Name</label>
                  <p className="text-lg font-semibold">{currentCompany.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Company Slug</label>
                  <p className="text-lg font-mono bg-muted px-2 py-1 rounded">{currentCompany.slug}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Subscription Status</label>
                  <p className="text-lg capitalize">{currentCompany.subscription_status}</p>
                </div>
                {currentCompany.trial_ends_at && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Trial Ends</label>
                    <p className="text-lg">{new Date(currentCompany.trial_ends_at).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
              
              <div className="border-t pt-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Company UUID</label>
                  <div className="flex items-center space-x-2 mt-1">
                    <code className="bg-muted px-2 py-1 rounded text-sm font-mono flex-1">
                      {currentCompany.id}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(currentCompany.id, "Company UUID copied to clipboard")}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use this UUID for API integrations and external systems
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">API Access Tokens</h3>
              <p className="text-sm text-muted-foreground">
                Manage access tokens for CSV upload API endpoint and external integrations
              </p>
            </div>
            <UploadTokenManager />
          </div>
        </TabsContent>

        <TabsContent value="depreciation" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Depreciation Settings</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure default depreciation methods and calculation preferences
            </p>
          </div>
          <DepreciationSettings />
        </TabsContent>

        <TabsContent value="pricing" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Purchase Price Defaults</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Set default purchase prices and daily accrual rates by birth year
            </p>
          </div>
          <PurchasePriceSettings />
        </TabsContent>

        <TabsContent value="acquisition" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Acquisition Type Settings</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure default acquisition type for cow imports and data entry
            </p>
          </div>
          <AcquisitionSettings />
        </TabsContent>

        <TabsContent value="accounts" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">General Ledger Accounts</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure GL account codes and names for journal entries
            </p>
          </div>
          <GLAccountSettings />
        </TabsContent>

        <TabsContent value="adjustments" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Balance Adjustments</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Record prior period corrections that need to be balanced in current month journals
            </p>
          </div>
          <BalanceAdjustments />
        </TabsContent>

        <TabsContent value="data-processing" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Data Processing</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Tools for processing and fixing historical data after system updates
            </p>
          </div>
          <MissingAcquisitionsProcessor />
          <MissingDispositionsProcessor />
          <DispositionJournalProcessor />
          <DepreciationCatchupProcessor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
