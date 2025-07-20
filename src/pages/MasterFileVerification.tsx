import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle, Info, Upload, Plus, X, Calendar, DollarSign } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface StagingRecord {
  id: string;
  discrepancy_type: string;
  cow_id: string | null;
  tag_number: string;
  birth_date: string;
  freshen_date: string | null;
  current_status: string | null;
  master_file_name: string | null;
  action_taken: string;
  verification_date: string;
}

interface ActionDialogData {
  record: StagingRecord;
  actionType: 'add_cow' | 'dispose_cow' | 'reinstate_cow' | 'update_freshen' | 'ignore';
}

export default function MasterFileVerification() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stagingRecords, setStagingRecords] = useState<StagingRecord[]>([]);
  const [actionDialog, setActionDialog] = useState<ActionDialogData | null>(null);
  const [actionForm, setActionForm] = useState({
    dispositionType: 'sale' as 'sale' | 'death' | 'culled',
    dispositionDate: '',
    saleAmount: '',
    freshenDate: '',
    notes: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    loadStagingRecords();
  }, []);

  const loadStagingRecords = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from('company_memberships')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!membership) return;

      const { data: records, error } = await supabase
        .from('master_file_staging')
        .select('*')
        .eq('company_id', membership.company_id)
        .eq('action_taken', 'pending')
        .order('verification_date', { ascending: false });

      if (error) {
        console.error('Error loading staging records:', error);
        return;
      }

      setStagingRecords(records || []);
    } catch (error) {
      console.error('Error in loadStagingRecords:', error);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file.",
        variant: "destructive",
      });
    }
  };

  const handleVerification = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: membership } = await supabase
        .from('company_memberships')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!membership) throw new Error('No company membership found');

      const formData = new FormData();
      formData.append('master', file);
      formData.append('company_id', membership.company_id);

      const response = await fetch(
        'https://qadhrhlagitqfsyfcnnr.supabase.co/functions/v1/master-file-upload',
        {
          method: 'POST',
          body: formData,
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Verification failed');
      }

      toast({
        title: "Verification complete",
        description: result.message,
      });

      await loadStagingRecords();

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

  const openActionDialog = (record: StagingRecord, actionType: ActionDialogData['actionType']) => {
    setActionDialog({ record, actionType });
    setActionForm({
      dispositionType: 'sale',
      dispositionDate: new Date().toISOString().split('T')[0],
      saleAmount: '',
      freshenDate: record.freshen_date || '',
      notes: ''
    });
  };

  const handleAction = async () => {
    if (!actionDialog) return;

    try {
      const { record, actionType } = actionDialog;

      if (actionType === 'add_cow') {
        // Validate required fields
        if (!actionForm.freshenDate) {
          toast({
            title: "Validation Error",
            description: "Freshen date is required",
            variant: "destructive",
          });
          return;
        }

        // Add cow to database
        const cowData = {
          id: `${record.tag_number}_${record.birth_date}`,
          tag_number: record.tag_number,
          birth_date: record.birth_date,
          freshen_date: actionForm.freshenDate,
          purchase_price: 0, // Default, can be updated later
          salvage_value: 0,
          current_value: 0,
          status: 'active',
          acquisition_type: 'purchased',
          company_id: (await supabase.from('company_memberships').select('company_id').eq('user_id', (await supabase.auth.getUser()).data.user?.id).single()).data?.company_id
        };

        const { error: cowError } = await supabase.from('cows').insert(cowData);
        if (cowError) throw cowError;

      } else if (actionType === 'dispose_cow' && record.cow_id) {
        // Create disposition
        const { data: cow } = await supabase
          .from('cows')
          .select('current_value')
          .eq('id', record.cow_id)
          .single();

        const dispositionData = {
          cow_id: record.cow_id,
          disposition_date: actionForm.dispositionDate,
          disposition_type: actionForm.dispositionType,
          sale_amount: parseFloat(actionForm.saleAmount) || 0,
          final_book_value: cow?.current_value || 0,
          gain_loss: (parseFloat(actionForm.saleAmount) || 0) - (cow?.current_value || 0),
          notes: actionForm.notes,
          company_id: (await supabase.from('company_memberships').select('company_id').eq('user_id', (await supabase.auth.getUser()).data.user?.id).single()).data?.company_id
        };

        const { error: dispositionError } = await supabase.from('cow_dispositions').insert(dispositionData);
        if (dispositionError) throw dispositionError;

        // Update cow status
        const { error: cowUpdateError } = await supabase
          .from('cows')
          .update({ status: actionForm.dispositionType === 'sale' ? 'sold' : 'deceased' })
          .eq('id', record.cow_id);

        if (cowUpdateError) throw cowUpdateError;

      } else if (actionType === 'update_freshen' && record.cow_id) {
        // Update freshen date
        const { error: updateError } = await supabase
          .from('cows')
          .update({ freshen_date: actionForm.freshenDate })
          .eq('id', record.cow_id);

        if (updateError) throw updateError;
      }

      // Update staging record
      const { error: stagingError } = await supabase
        .from('master_file_staging')
        .update({
          action_taken: actionType === 'ignore' ? 'ignored' : 
                       actionType === 'add_cow' ? 'cow_added' :
                       actionType === 'dispose_cow' ? 'cow_disposed' :
                       actionType === 'update_freshen' ? 'freshen_updated' :
                       'cow_reinstated',
          action_date: new Date().toISOString(),
          action_notes: actionForm.notes,
          disposition_type: actionType === 'dispose_cow' ? actionForm.dispositionType : null,
          disposition_date: actionType === 'dispose_cow' ? actionForm.dispositionDate : null,
          sale_amount: actionType === 'dispose_cow' ? parseFloat(actionForm.saleAmount) || 0 : null
        })
        .eq('id', record.id);

      if (stagingError) throw stagingError;

      toast({
        title: "Action completed",
        description: `Successfully ${actionType.replace('_', ' ')} for cow ${record.tag_number}`,
      });

      setActionDialog(null);
      await loadStagingRecords();

    } catch (error) {
      console.error('Action error:', error);
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const getDiscrepancyDescription = (record: StagingRecord) => {
    switch (record.discrepancy_type) {
      case 'missing_from_master':
        return `Cow #${record.tag_number} (Born: ${record.birth_date}) is in master file but not in database`;
      case 'needs_disposal':
        return `Cow #${record.tag_number} (Born: ${record.birth_date}) is active in database but not in master file`;
      case 'missing_freshen_date':
        return `Cow #${record.tag_number} (Born: ${record.birth_date}) is missing freshen date`;
      default:
        return 'Unknown discrepancy';
    }
  };

  const getActionButtons = (record: StagingRecord) => {
    switch (record.discrepancy_type) {
      case 'missing_from_master':
        return (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => openActionDialog(record, 'add_cow')}>
              <Plus className="h-4 w-4 mr-1" />
              Add Cow
            </Button>
            <Button size="sm" variant="outline" onClick={() => openActionDialog(record, 'ignore')}>
              <X className="h-4 w-4 mr-1" />
              Ignore
            </Button>
          </div>
        );
      case 'needs_disposal':
        return (
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => openActionDialog(record, 'dispose_cow')}>
              <X className="h-4 w-4 mr-1" />
              Mark Disposed
            </Button>
            <Button size="sm" variant="outline" onClick={() => openActionDialog(record, 'ignore')}>
              Ignore
            </Button>
          </div>
        );
      case 'missing_freshen_date':
        return (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => openActionDialog(record, 'update_freshen')}>
              <Calendar className="h-4 w-4 mr-1" />
              Add Freshen Date
            </Button>
            <Button size="sm" variant="outline" onClick={() => openActionDialog(record, 'ignore')}>
              <X className="h-4 w-4 mr-1" />
              Ignore
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Master File Verification</h1>
          <p className="text-muted-foreground">
            Upload a master file to verify cow data integrity and take action on discrepancies
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

      {stagingRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Pending Actions ({stagingRecords.length})
            </CardTitle>
            <CardDescription>
              Review and take action on the discrepancies found
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stagingRecords.map((record) => (
              <div key={record.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{getDiscrepancyDescription(record)}</p>
                    <div className="flex gap-2">
                      <Badge variant="outline">{record.discrepancy_type.replace('_', ' ')}</Badge>
                      {record.master_file_name && (
                        <Badge variant="secondary">File: {record.master_file_name}</Badge>
                      )}
                    </div>
                  </div>
                  {getActionButtons(record)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {stagingRecords.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              No Pending Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>No discrepancies requiring action. Upload a master file to verify your data.</p>
          </CardContent>
        </Card>
      )}

      {/* Action Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.actionType === 'add_cow' && 'Add Cow to Database'}
              {actionDialog?.actionType === 'dispose_cow' && 'Mark Cow as Disposed'}
              {actionDialog?.actionType === 'update_freshen' && 'Update Freshen Date'}
              {actionDialog?.actionType === 'ignore' && 'Ignore Discrepancy'}
            </DialogTitle>
            <DialogDescription>
              Cow #{actionDialog?.record.tag_number} (Born: {actionDialog?.record.birth_date})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {actionDialog?.actionType === 'add_cow' && (
              <div className="space-y-2">
                <Label htmlFor="freshenDate">Freshen Date *</Label>
                <Input
                  id="freshenDate"
                  type="date"
                  value={actionForm.freshenDate}
                  onChange={(e) => setActionForm({...actionForm, freshenDate: e.target.value})}
                  required
                />
              </div>
            )}

            {actionDialog?.actionType === 'dispose_cow' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dispositionType">Disposition Type</Label>
                  <Select value={actionForm.dispositionType} onValueChange={(value: any) => setActionForm({...actionForm, dispositionType: value})}>
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
                    value={actionForm.dispositionDate}
                    onChange={(e) => setActionForm({...actionForm, dispositionDate: e.target.value})}
                  />
                </div>

                {actionForm.dispositionType === 'sale' && (
                  <div className="space-y-2">
                    <Label htmlFor="saleAmount">Sale Amount</Label>
                    <Input
                      id="saleAmount"
                      type="number"
                      placeholder="0.00"
                      value={actionForm.saleAmount}
                      onChange={(e) => setActionForm({...actionForm, saleAmount: e.target.value})}
                    />
                  </div>
                )}
              </>
            )}

            {actionDialog?.actionType === 'update_freshen' && (
              <div className="space-y-2">
                <Label htmlFor="freshenDate">Freshen Date</Label>
                <Input
                  id="freshenDate"
                  type="date"
                  value={actionForm.freshenDate}
                  onChange={(e) => setActionForm({...actionForm, freshenDate: e.target.value})}
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any additional notes..."
                value={actionForm.notes}
                onChange={(e) => setActionForm({...actionForm, notes: e.target.value})}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleAction} disabled={
              actionDialog?.actionType === 'add_cow' && !actionForm.freshenDate ||
              actionDialog?.actionType === 'update_freshen' && !actionForm.freshenDate
            }>
              {actionDialog?.actionType === 'ignore' ? 'Ignore' : 'Confirm Action'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}