import { useState } from 'react';
import { Calculator, Trash2, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Cow, CowDisposition, JournalEntry, DispositionType } from '@/types/cow';
import { DepreciationCalculator } from '@/utils/depreciation';
import { supabase } from '@/integrations/supabase/client';

interface DispositionFormProps {
  cow: Cow;
  onDisposition: (cow: Cow, disposition: CowDisposition) => void;
  onCancel: () => void;
}

export function DispositionForm({ cow, onDisposition, onCancel }: DispositionFormProps) {
  const [dispositionType, setDispositionType] = useState<DispositionType>('sale');
  const [dispositionDate, setDispositionDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleAmount, setSaleAmount] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Calculate current book value
  const currentDate = new Date(dispositionDate);
  const monthlyDepreciation = DepreciationCalculator.calculateMonthlyDepreciation(cow, currentDate);
  const monthsSinceStart = DepreciationCalculator.getMonthsSinceStart(cow.freshenDate, currentDate);
  const totalDepreciation = monthlyDepreciation * monthsSinceStart;
  const bookValue = Math.max(cow.salvageValue, cow.purchasePrice - totalDepreciation);

  const saleAmountNum = parseFloat(saleAmount) || 0;
  const gainLoss = saleAmountNum - bookValue;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      // Create disposition record
      const disposition: CowDisposition = {
        id: `disp-${cow.id}-${Date.now()}`,
        cowId: cow.id,
        dispositionDate: new Date(dispositionDate),
        dispositionType,
        saleAmount: saleAmountNum,
        finalBookValue: bookValue,
        gainLoss,
        notes: notes || undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Create journal entry for disposition
      const journalEntry: JournalEntry = {
        id: `je-disp-${cow.id}-${Date.now()}`,
        entryDate: new Date(dispositionDate),
        description: `${dispositionType === 'sale' ? 'Sale' : 'Disposal'} of cow ${cow.tagNumber}`,
        totalAmount: Math.max(saleAmountNum, bookValue),
        entryType: 'disposition',
        lines: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Build journal lines based on disposition type
      if (dispositionType === 'sale') {
        // Cash (or Accounts Receivable)
        journalEntry.lines.push({
          id: `jl-cash-${Date.now()}`,
          journalEntryId: journalEntry.id,
          accountCode: '1010',
          accountName: 'Cash',
          description: `Sale of cow ${cow.tagNumber}`,
          debitAmount: saleAmountNum,
          creditAmount: 0,
          lineType: 'debit',
          createdAt: new Date()
        });

        // Accumulated Depreciation
        journalEntry.lines.push({
          id: `jl-accum-dep-${Date.now()}`,
          journalEntryId: journalEntry.id,
          accountCode: '1500.1',
          accountName: 'Accumulated Depreciation - Dairy Cows',
          description: `Removal of accumulated depreciation for cow ${cow.tagNumber}`,
          debitAmount: totalDepreciation,
          creditAmount: 0,
          lineType: 'debit',
          createdAt: new Date()
        });

        // Asset (Dairy Cows)
        journalEntry.lines.push({
          id: `jl-asset-${Date.now()}`,
          journalEntryId: journalEntry.id,
          accountCode: '1500',
          accountName: 'Dairy Cows',
          description: `Removal of cow asset ${cow.tagNumber}`,
          debitAmount: 0,
          creditAmount: cow.purchasePrice,
          lineType: 'credit',
          createdAt: new Date()
        });

        // Gain or Loss on Sale
        if (gainLoss !== 0) {
          journalEntry.lines.push({
            id: `jl-gain-loss-${Date.now()}`,
            journalEntryId: journalEntry.id,
            accountCode: gainLoss > 0 ? '8100' : '7100',
            accountName: gainLoss > 0 ? 'Gain on Sale of Assets' : 'Loss on Sale of Assets',
            description: `${gainLoss > 0 ? 'Gain' : 'Loss'} on sale of cow ${cow.tagNumber}`,
            debitAmount: gainLoss < 0 ? Math.abs(gainLoss) : 0,
            creditAmount: gainLoss > 0 ? gainLoss : 0,
            lineType: gainLoss < 0 ? 'debit' : 'credit',
            createdAt: new Date()
          });
        }
      } else {
        // Death/Culling - Loss
        journalEntry.lines.push({
          id: `jl-accum-dep-${Date.now()}`,
          journalEntryId: journalEntry.id,
          accountCode: '1500.1',
          accountName: 'Accumulated Depreciation - Dairy Cows',
          description: `Removal of accumulated depreciation for cow ${cow.tagNumber}`,
          debitAmount: totalDepreciation,
          creditAmount: 0,
          lineType: 'debit',
          createdAt: new Date()
        });

        journalEntry.lines.push({
          id: `jl-loss-${Date.now()}`,
          journalEntryId: journalEntry.id,
          accountCode: '7100',
          accountName: 'Loss on Disposal of Assets',
          description: `Loss on ${dispositionType} of cow ${cow.tagNumber}`,
          debitAmount: bookValue,
          creditAmount: 0,
          lineType: 'debit',
          createdAt: new Date()
        });

        journalEntry.lines.push({
          id: `jl-asset-${Date.now()}`,
          journalEntryId: journalEntry.id,
          accountCode: '1500',
          accountName: 'Dairy Cows',
          description: `Removal of cow asset ${cow.tagNumber}`,
          debitAmount: 0,
          creditAmount: cow.purchasePrice,
          lineType: 'credit',
          createdAt: new Date()
        });
      }

      // Store to database
      const { error: dispositionError } = await supabase
        .from('cow_dispositions')
        .insert({
          cow_id: disposition.cowId,
          disposition_date: disposition.dispositionDate.toISOString().split('T')[0],
          disposition_type: disposition.dispositionType,
          sale_amount: disposition.saleAmount,
          final_book_value: disposition.finalBookValue,
          gain_loss: disposition.gainLoss,
          notes: disposition.notes
        });

      if (dispositionError) throw dispositionError;

      const { error: journalError } = await supabase
        .from('journal_entries')
        .insert({
          entry_date: journalEntry.entryDate.toISOString().split('T')[0],
          description: journalEntry.description,
          total_amount: journalEntry.totalAmount,
          entry_type: journalEntry.entryType
        });

      if (journalError) throw journalError;

      // Update cow status
      const updatedCow = {
        ...cow,
        status: dispositionType === 'sale' ? 'sold' as const : 'deceased' as const,
        dispositionId: disposition.id
      };

      onDisposition(updatedCow, disposition);

      toast({
        title: "Disposition Recorded",
        description: `Successfully recorded ${dispositionType} of cow ${cow.tagNumber}`,
      });

    } catch (error) {
      console.error('Error recording disposition:', error);
      toast({
        title: "Error",
        description: "Failed to record disposition. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Record Cow Disposition
        </CardTitle>
        <CardDescription>
          Record the sale or disposal of cow {cow.tagNumber}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Current Asset Info */}
          <div className="bg-muted/30 p-4 rounded-lg space-y-2">
            <h4 className="font-medium">Current Asset Information</h4>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Purchase Price:</span>
                <span className="ml-2 font-medium">{DepreciationCalculator.formatCurrency(cow.purchasePrice)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Current Book Value:</span>
                <span className="ml-2 font-medium">{DepreciationCalculator.formatCurrency(bookValue)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Depreciation:</span>
                <span className="ml-2 font-medium">{DepreciationCalculator.formatCurrency(totalDepreciation)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Freshen Date:</span>
                <span className="ml-2 font-medium">{DepreciationCalculator.formatDate(cow.freshenDate)}</span>
              </div>
            </div>
          </div>

          {/* Disposition Details */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dispositionType">Disposition Type</Label>
              <Select value={dispositionType} onValueChange={(value: DispositionType) => setDispositionType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="death">Death</SelectItem>
                  <SelectItem value="culled">Culled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dispositionDate">Disposition Date</Label>
              <Input
                id="dispositionDate"
                type="date"
                value={dispositionDate}
                onChange={(e) => setDispositionDate(e.target.value)}
                required
              />
            </div>
          </div>

          {dispositionType === 'sale' && (
            <div className="space-y-2">
              <Label htmlFor="saleAmount">Sale Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="saleAmount"
                  type="number"
                  step="0.01"
                  value={saleAmount}
                  onChange={(e) => setSaleAmount(e.target.value)}
                  className="pl-10"
                  placeholder="0.00"
                  required={dispositionType === 'sale'}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about the disposition..."
              rows={3}
            />
          </div>

          {/* Gain/Loss Calculation */}
          {dispositionType === 'sale' && saleAmount && (
            <div className="bg-muted/30 p-4 rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Financial Impact
              </h4>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Book Value:</span>
                  <span className="ml-2 font-medium">{DepreciationCalculator.formatCurrency(bookValue)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Sale Amount:</span>
                  <span className="ml-2 font-medium">{DepreciationCalculator.formatCurrency(saleAmountNum)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {gainLoss >= 0 ? 'Gain:' : 'Loss:'}
                  </span>
                  <span className={`ml-2 font-medium ${gainLoss >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {DepreciationCalculator.formatCurrency(Math.abs(gainLoss))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isProcessing}
              className="flex-1"
            >
              {isProcessing ? 'Processing...' : 'Record Disposition'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isProcessing}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}