import { useState, useEffect } from 'react';
import { Save, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface GLAccount {
  account_type: string;
  account_code: string;
  account_name: string;
}

const DEFAULT_ACCOUNTS = [
  { account_type: 'cash', label: 'Cash', account_code: '1000', account_name: 'Cash' },
  { account_type: 'dairy_cows', label: 'Dairy Cows Asset', account_code: '1500', account_name: 'Dairy Cows' },
  { account_type: 'accumulated_depreciation', label: 'Accumulated Depreciation', account_code: '1500.1', account_name: 'Accumulated Depreciation - Dairy Cows' },
  { account_type: 'depreciation_expense', label: 'Depreciation Expense', account_code: '6100', account_name: 'Depreciation Expense' },
  { account_type: 'gain_on_sale', label: 'Gain on Sale of Assets', account_code: '8000', account_name: 'Gain on Sale of Assets' },
  { account_type: 'loss_on_sale', label: 'Loss on Sale of Assets', account_code: '9000', account_name: 'Loss on Sale of Assets' }
];

export function GLAccountSettings() {
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchGLAccounts();
  }, [currentCompany]);

  const fetchGLAccounts = async () => {
    if (!currentCompany) return;

    try {
      const { data, error } = await supabase
        .from('gl_account_settings')
        .select('account_type, account_code, account_name')
        .eq('company_id', currentCompany.id);

      if (error) throw error;

      // If no accounts found, initialize with defaults
      if (!data || data.length === 0) {
        setAccounts(DEFAULT_ACCOUNTS.map(({ account_type, account_code, account_name }) => ({
          account_type,
          account_code,
          account_name
        })));
      } else {
        setAccounts(data);
      }
    } catch (error) {
      console.error('Error fetching GL accounts:', error);
      toast({
        title: "Error",
        description: "Failed to load GL account settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateAccount = (accountType: string, field: 'account_code' | 'account_name', value: string) => {
    setAccounts(prev => prev.map(account =>
      account.account_type === accountType
        ? { ...account, [field]: value }
        : account
    ));
  };

  const saveGLAccounts = async () => {
    if (!currentCompany) return;

    setIsSaving(true);
    try {
      // Upsert all accounts
      const upsertData = accounts.map(account => ({
        company_id: currentCompany.id,
        account_type: account.account_type,
        account_code: account.account_code,
        account_name: account.account_name
      }));

      const { error } = await supabase
        .from('gl_account_settings')
        .upsert(upsertData, {
          onConflict: 'company_id,account_type'
        });

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: "GL account settings have been updated successfully",
      });
    } catch (error) {
      console.error('Error saving GL accounts:', error);
      toast({
        title: "Error",
        description: "Failed to save GL account settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-10 bg-muted rounded flex-1"></div>
                  <div className="h-10 bg-muted rounded flex-1"></div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          General Ledger Account Mapping
        </CardTitle>
        <CardDescription>
          Configure which GL accounts to use for journal entries. These accounts will be used in depreciation and disposition journal entries.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6">
          {DEFAULT_ACCOUNTS.map(({ account_type, label }) => {
            const account = accounts.find(a => a.account_type === account_type) || {
              account_type,
              account_code: '',
              account_name: ''
            };

            return (
              <div key={account_type} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground">
                    {account_type === 'cash' && 'Used when recording cash receipts from sales'}
                    {account_type === 'dairy_cows' && 'Asset account for dairy cow purchases'}
                    {account_type === 'accumulated_depreciation' && 'Contra-asset account for depreciation'}
                    {account_type === 'depreciation_expense' && 'Expense account for monthly depreciation'}
                    {account_type === 'gain_on_sale' && 'Income account for gains on asset sales'}
                    {account_type === 'loss_on_sale' && 'Expense account for losses on asset sales'}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor={`${account_type}-code`}>Account Code</Label>
                  <Input
                    id={`${account_type}-code`}
                    value={account.account_code}
                    onChange={(e) => updateAccount(account_type, 'account_code', e.target.value)}
                    placeholder="e.g., 1000"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor={`${account_type}-name`}>Account Name</Label>
                  <Input
                    id={`${account_type}-name`}
                    value={account.account_name}
                    onChange={(e) => updateAccount(account_type, 'account_name', e.target.value)}
                    placeholder="e.g., Cash"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button onClick={saveGLAccounts} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save GL Account Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}