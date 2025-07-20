import { Settings as SettingsIcon, Building, Calculator, DollarSign, FileText, Database, Copy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PurchasePriceSettings } from '@/components/PurchasePriceSettings';
import { DepreciationSettings } from '@/components/DepreciationSettings';
import { GLAccountSettings } from '@/components/GLAccountSettings';
import { UploadTokenManager } from '@/components/UploadTokenManager';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export default function Settings() {
  const { currentCompany } = useAuth();

  const copyCompanyId = () => {
    if (currentCompany?.id) {
      navigator.clipboard.writeText(currentCompany.id);
      toast({
        title: "Copied!",
        description: "Company UUID copied to clipboard",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage your company configuration and preferences
          </p>
        </div>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
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
          <TabsTrigger value="accounts" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            GL Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Company Information
              </CardTitle>
              <CardDescription>
                Company details for API integrations and external services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Company Name</label>
                  <p className="text-sm mt-1">{currentCompany?.name || 'Not available'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Company UUID</label>
                  <div className="flex items-center space-x-2 mt-1">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                      {currentCompany?.id || 'Not available'}
                    </code>
                    {currentCompany?.id && (
                      <Button variant="outline" size="sm" onClick={copyCompanyId}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use this UUID for API integrations and external service configurations
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
            <h2 className="text-xl font-semibold">Depreciation Configuration</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure how depreciation is calculated and scheduled for your dairy cow assets
            </p>
          </div>
          <DepreciationSettings />
        </TabsContent>

        <TabsContent value="pricing" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Purchase Price Configuration</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure default purchase prices and daily accrual rates for automatic price calculations
            </p>
          </div>
          <PurchasePriceSettings />
        </TabsContent>

        <TabsContent value="accounts" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">General Ledger Accounts</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure which GL accounts to use for journal entries and financial reporting
            </p>
          </div>
          <GLAccountSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}