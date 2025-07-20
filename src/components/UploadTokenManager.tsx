import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Copy, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UploadToken {
  id: string;
  token_name: string;
  token_value: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export function UploadTokenManager() {
  const { currentCompany } = useAuth();
  const { toast } = useToast();
  const [tokens, setTokens] = useState<UploadToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [visibleTokens, setVisibleTokens] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTokens();
  }, [currentCompany]);

  const fetchTokens = async () => {
    if (!currentCompany?.id) return;

    try {
      const { data, error } = await supabase
        .from('upload_tokens')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTokens(data || []);
    } catch (error) {
      console.error('Error fetching tokens:', error);
      toast({
        title: "Error",
        description: "Failed to fetch upload tokens",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateToken = () => {
    return crypto.randomUUID().replace(/-/g, '');
  };

  const createToken = async () => {
    if (!currentCompany?.id || !newTokenName.trim()) return;

    setIsCreating(true);
    try {
      const tokenValue = generateToken();
      
      const { error } = await supabase
        .from('upload_tokens')
        .insert({
          company_id: currentCompany.id,
          token_name: newTokenName.trim(),
          token_value: tokenValue,
          is_active: true
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Upload token created successfully",
      });

      setNewTokenName('');
      setIsDialogOpen(false);
      fetchTokens();
    } catch (error) {
      console.error('Error creating token:', error);
      toast({
        title: "Error",
        description: "Failed to create upload token",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const deleteToken = async (tokenId: string) => {
    try {
      const { error } = await supabase
        .from('upload_tokens')
        .delete()
        .eq('id', tokenId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Upload token deleted successfully",
      });

      fetchTokens();
    } catch (error) {
      console.error('Error deleting token:', error);
      toast({
        title: "Error",
        description: "Failed to delete upload token",
        variant: "destructive",
      });
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast({
      title: "Copied",
      description: "Token copied to clipboard",
    });
  };

  const toggleTokenVisibility = (tokenId: string) => {
    const newVisible = new Set(visibleTokens);
    if (newVisible.has(tokenId)) {
      newVisible.delete(tokenId);
    } else {
      newVisible.add(tokenId);
    }
    setVisibleTokens(newVisible);
  };

  const formatToken = (token: string, isVisible: boolean) => {
    if (isVisible) return token;
    return '••••••••••••••••••••••••••••••••';
  };

  if (isLoading) {
    return <div>Loading tokens...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>
            Your company details and identifiers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Company Name</Label>
              <div className="text-sm text-muted-foreground mt-1">
                {currentCompany?.name || 'No company selected'}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Company UUID</Label>
              <div className="flex items-center space-x-2 mt-1">
                <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                  {currentCompany?.id || 'No company selected'}
                </code>
                {currentCompany?.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToken(currentCompany.id)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Use this UUID for API integrations and external systems
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Tokens */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>CSV Upload Tokens</CardTitle>
              <CardDescription>
                Manage access tokens for CSV upload API endpoint
              </CardDescription>
            </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Token
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Upload Token</DialogTitle>
                <DialogDescription>
                  Create a new token for CSV upload access.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="tokenName">Token Name</Label>
                  <Input
                    id="tokenName"
                    placeholder="e.g., Production API, Test Environment"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={createToken} 
                    disabled={!newTokenName.trim() || isCreating}
                  >
                    {isCreating ? 'Creating...' : 'Create Token'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {tokens.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No upload tokens found. Create one to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {tokens.map((token) => (
              <div key={token.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-medium">{token.token_name}</h4>
                    <Badge variant={token.is_active ? "default" : "secondary"}>
                      {token.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteToken(token.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center space-x-2 mb-2">
                  <code className="bg-muted px-2 py-1 rounded text-sm flex-1 font-mono">
                    {formatToken(token.token_value, visibleTokens.has(token.id))}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleTokenVisibility(token.id)}
                  >
                    {visibleTokens.has(token.id) ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToken(token.token_value)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  Created: {new Date(token.created_at).toLocaleDateString()}
                  {token.last_used_at && (
                    <span className="ml-4">
                      Last used: {new Date(token.last_used_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}