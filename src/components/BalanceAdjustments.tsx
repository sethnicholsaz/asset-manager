
import { useState, useEffect } from 'react';
import { Calculator, Plus, Trash2, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { DepreciationCalculator } from '@/utils/depreciation';

interface BalanceAdjustment {
  id: string;
  company_id: string;
  adjustment_date: Date;
  prior_period_month: number;
  prior_period_year: number;
  adjustment_type: 'depreciation_correction' | 'disposition_correction' | 'manual_adjustment';
  adjustment_amount: number;
  description: string;
  cow_tag?: string;
  applied_to_current_month: boolean;
  journal_entry_id?: string;
  created_at: Date;
  updated_at: Date;
}

export function BalanceAdjustments() {
  const [adjustments, setAdjustments] = useState<BalanceAdjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    adjustment_type: 'manual_adjustment',
    adjustment_amount: '',
    description: '',
    cow_tag: '',
    prior_period_month: new Date().getMonth() + 1,
    prior_period_year: new Date().getFullYear()
  });
  const { currentCompany } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentCompany) {
      fetchAdjustments();
    }
  }, [currentCompany]);

  const fetchAdjustments = async () => {
    if (!currentCompany) return;

    try {
      const { data, error } = await supabase
        .from('balance_adjustments')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const transformedAdjustments: BalanceAdjustment[] = (data || []).map(adj => ({
        id: adj.id,
        company_id: adj.company_id,
        adjustment_date: new Date(adj.adjustment_date),
        prior_period_month: adj.prior_period_month,
        prior_period_year: adj.prior_period_year,
        adjustment_type: adj.adjustment_type,
        adjustment_amount: adj.adjustment_amount,
        description: adj.description,
        cow_tag: adj.cow_tag,
        applied_to_current_month: adj.applied_to_current_month,
        journal_entry_id: adj.journal_entry_id,
        created_at: new Date(adj.created_at),
        updated_at: new Date(adj.updated_at)
      }));

      setAdjustments(transformedAdjustments);
    } catch (error) {
      console.error('Error fetching balance adjustments:', error);
      toast({
        title: "Error",
        description: "Failed to load balance adjustments",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompany) return;

    try {
      const { data, error } = await supabase
        .from('balance_adjustments')
        .insert({
          company_id: currentCompany.id,
          adjustment_date: new Date().toISOString(),
          prior_period_month: formData.prior_period_month,
          prior_period_year: formData.prior_period_year,
          adjustment_type: formData.adjustment_type,
          adjustment_amount: parseFloat(formData.adjustment_amount),
          description: formData.description,
          cow_tag: formData.cow_tag || null,
          applied_to_current_month: false
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Success",
        description: "Balance adjustment recorded successfully",
      });

      setIsDialogOpen(false);
      setFormData({
        adjustment_type: 'manual_adjustment',
        adjustment_amount: '',
        description: '',
        cow_tag: '',
        prior_period_month: new Date().getMonth() + 1,
        prior_period_year: new Date().getFullYear()
      });
      fetchAdjustments();
    } catch (error) {
      console.error('Error creating balance adjustment:', error);
      toast({
        title: "Error",
        description: "Failed to create balance adjustment",
        variant: "destructive",
      });
    }
  };

  const applyAdjustment = async (adjustmentId: string) => {
    try {
      // Mark adjustment as applied
      const { error: updateError } = await supabase
        .from('balance_adjustments')
        .update({ 
          applied_to_current_month: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', adjustmentId);

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: "Adjustment will be included in the next month's journal entries",
      });

      fetchAdjustments();
    } catch (error) {
      console.error('Error applying adjustment:', error);
      toast({
        title: "Error",
        description: "Failed to apply adjustment",
        variant: "destructive",
      });
    }
  };

  const deleteAdjustment = async (adjustmentId: string) => {
    try {
      const { error } = await supabase
        .from('balance_adjustments')
        .delete()
        .eq('id', adjustmentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Balance adjustment deleted",
      });

      fetchAdjustments();
    } catch (error) {
      console.error('Error deleting adjustment:', error);
      toast({
        title: "Error",
        description: "Failed to delete adjustment",
        variant: "destructive",
      });
    }
  };

  const getAdjustmentTypeLabel = (type: string) => {
    switch (type) {
      case 'depreciation_correction':
        return 'Depreciation Correction';
      case 'disposition_correction':
        return 'Disposition Correction';
      default:
        return 'Manual Adjustment';
    }
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' })
  }));

  const years = Array.from({ length: 5 }, (_, i) => {
    const year = new Date().getFullYear() - 2 + i;
    return { value: year, label: year.toString() };
  });

  const totalPendingAdjustments = adjustments
    .filter(adj => !adj.applied_to_current_month)
    .reduce((sum, adj) => sum + adj.adjustment_amount, 0);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Balance Adjustments
          </CardTitle>
          <CardDescription>
            Record and track prior period corrections that need to be balanced in current month journal entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              {totalPendingAdjustments !== 0 && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  totalPendingAdjustments > 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
                }`}>
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Pending Adjustments: {DepreciationCalculator.formatCurrency(totalPendingAdjustments)}
                  </span>
                </div>
              )}
            </div>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Adjustment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Balance Adjustment</DialogTitle>
                  <DialogDescription>
                    Record a prior period correction that needs to be balanced in future journal entries
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Prior Period Month</Label>
                      <Select 
                        value={formData.prior_period_month.toString()} 
                        onValueChange={(value) => setFormData({...formData, prior_period_month: parseInt(value)})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {months.map(month => (
                            <SelectItem key={month.value} value={month.value.toString()}>
                              {month.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Prior Period Year</Label>
                      <Select 
                        value={formData.prior_period_year.toString()} 
                        onValueChange={(value) => setFormData({...formData, prior_period_year: parseInt(value)})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map(year => (
                            <SelectItem key={year.value} value={year.value.toString()}>
                              {year.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Adjustment Type</Label>
                    <Select 
                      value={formData.adjustment_type} 
                      onValueChange={(value) => setFormData({...formData, adjustment_type: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual_adjustment">Manual Adjustment</SelectItem>
                        <SelectItem value="depreciation_correction">Depreciation Correction</SelectItem>
                        <SelectItem value="disposition_correction">Disposition Correction</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Adjustment Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Enter amount (positive for debit, negative for credit)"
                      value={formData.adjustment_amount}
                      onChange={(e) => setFormData({...formData, adjustment_amount: e.target.value})}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Cow Tag (Optional)</Label>
                    <Input
                      placeholder="Enter cow tag if applicable"
                      value={formData.cow_tag}
                      onChange={(e) => setFormData({...formData, cow_tag: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Describe the reason for this adjustment..."
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Record Adjustment</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Prior Period</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Cow Tag</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((adjustment) => (
                  <TableRow key={adjustment.id}>
                    <TableCell>{DepreciationCalculator.formatDate(adjustment.adjustment_date)}</TableCell>
                    <TableCell>
                      {new Date(2000, adjustment.prior_period_month - 1, 1).toLocaleString('en-US', { month: 'short' })} {adjustment.prior_period_year}
                    </TableCell>
                    <TableCell>{getAdjustmentTypeLabel(adjustment.adjustment_type)}</TableCell>
                    <TableCell>{adjustment.cow_tag || '-'}</TableCell>
                    <TableCell className={adjustment.adjustment_amount >= 0 ? 'text-destructive' : 'text-success'}>
                      {DepreciationCalculator.formatCurrency(adjustment.adjustment_amount)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{adjustment.description}</TableCell>
                    <TableCell>
                      {adjustment.applied_to_current_month ? (
                        <span className="flex items-center gap-1 text-success">
                          <Check className="h-4 w-4" />
                          Applied
                        </span>
                      ) : (
                        <span className="text-warning">Pending</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {!adjustment.applied_to_current_month && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => applyAdjustment(adjustment.id)}
                          >
                            Apply
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteAdjustment(adjustment.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {adjustments.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p>No balance adjustments recorded</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
