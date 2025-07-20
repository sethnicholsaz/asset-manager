import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PurchasePriceDefault } from '@/types/cow';
import { supabase } from '@/integrations/supabase/client';

export function PurchasePriceSettings() {
  const [defaults, setDefaults] = useState<PurchasePriceDefault[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ default_price: '', daily_accrual_rate: '' });
  const [newEntry, setNewEntry] = useState({ birth_year: '', default_price: '', daily_accrual_rate: '' });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchDefaults();
  }, []);

  const fetchDefaults = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_price_defaults')
        .select('*')
        .order('birth_year', { ascending: false });
      
      if (error) throw error;
      
      const formattedData = (data || []).map(item => ({
        ...item,
        created_at: new Date(item.created_at),
        updated_at: new Date(item.updated_at)
      }));
      
      setDefaults(formattedData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load purchase price defaults",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (item: PurchasePriceDefault) => {
    setEditingId(item.id);
    setEditData({
      default_price: item.default_price.toString(),
      daily_accrual_rate: item.daily_accrual_rate.toString()
    });
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const { error } = await supabase
        .from('purchase_price_defaults')
        .update({
          default_price: parseFloat(editData.default_price),
          daily_accrual_rate: parseFloat(editData.daily_accrual_rate),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      await fetchDefaults();
      setEditingId(null);
      toast({
        title: "Success",
        description: "Purchase price default updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update purchase price default",
        variant: "destructive",
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditData({ default_price: '', daily_accrual_rate: '' });
  };

  const handleDelete = async (id: string, birthYear: number) => {
    if (!confirm(`Are you sure you want to delete the defaults for birth year ${birthYear}?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('purchase_price_defaults')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchDefaults();
      toast({
        title: "Success",
        description: "Purchase price default deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete purchase price default",
        variant: "destructive",
      });
    }
  };

  const handleAddNew = async () => {
    try {
      if (!newEntry.birth_year || !newEntry.default_price || !newEntry.daily_accrual_rate) {
        throw new Error('Please fill in all fields');
      }

      const { error } = await supabase
        .from('purchase_price_defaults')
        .insert({
          birth_year: parseInt(newEntry.birth_year),
          default_price: parseFloat(newEntry.default_price),
          daily_accrual_rate: parseFloat(newEntry.daily_accrual_rate)
        });

      if (error) throw error;

      await fetchDefaults();
      setNewEntry({ birth_year: '', default_price: '', daily_accrual_rate: '' });
      setShowAddDialog(false);
      toast({
        title: "Success",
        description: "New purchase price default added successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add purchase price default",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Purchase Price Defaults</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Purchase Price Defaults</CardTitle>
        <CardDescription>
          Configure default purchase prices and daily accrual rates by birth year
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              These values are used to automatically calculate purchase prices when importing cows
            </p>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Year
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Purchase Price Default</DialogTitle>
                  <DialogDescription>
                    Set the default purchase price and daily accrual rate for a birth year
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="birthYear">Birth Year</Label>
                    <Input
                      id="birthYear"
                      type="number"
                      value={newEntry.birth_year}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, birth_year: e.target.value }))}
                      placeholder="e.g., 2024"
                    />
                  </div>
                  <div>
                    <Label htmlFor="defaultPrice">Default Price ($)</Label>
                    <Input
                      id="defaultPrice"
                      type="number"
                      step="0.01"
                      value={newEntry.default_price}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, default_price: e.target.value }))}
                      placeholder="e.g., 2400.00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dailyAccrual">Daily Accrual Rate ($)</Label>
                    <Input
                      id="dailyAccrual"
                      type="number"
                      step="0.01"
                      value={newEntry.daily_accrual_rate}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, daily_accrual_rate: e.target.value }))}
                      placeholder="e.g., 1.70"
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleAddNew} className="flex-1">
                      Add Default
                    </Button>
                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {defaults.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No purchase price defaults configured yet
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Birth Year</TableHead>
                    <TableHead>Default Price</TableHead>
                    <TableHead>Daily Accrual Rate</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {defaults.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.birth_year}</TableCell>
                      <TableCell>
                        {editingId === item.id ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={editData.default_price}
                            onChange={(e) => setEditData(prev => ({ ...prev, default_price: e.target.value }))}
                            className="w-24"
                          />
                        ) : (
                          `$${item.default_price.toFixed(2)}`
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === item.id ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={editData.daily_accrual_rate}
                            onChange={(e) => setEditData(prev => ({ ...prev, daily_accrual_rate: e.target.value }))}
                            className="w-24"
                          />
                        ) : (
                          `$${item.daily_accrual_rate.toFixed(2)}`
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {editingId === item.id ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSaveEdit(item.id)}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelEdit}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEdit(item)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(item.id, item.birth_year)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="bg-muted/30 p-4 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">How Price Calculation Works</h4>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• <strong>Default Price:</strong> Base purchase price for cows born in that year</p>
              <p>• <strong>Daily Accrual Rate:</strong> Amount added per day from birth to freshen date</p>
              <p>• <strong>Final Price:</strong> Default Price + (Days from Birth to Freshen × Daily Accrual Rate)</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}