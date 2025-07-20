import { useState, useEffect } from 'react';
import { ArrowLeft, Trash2, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DispositionForm } from '@/components/DispositionForm';
import { Cow, CowDisposition } from '@/types/cow';
import { DepreciationCalculator } from '@/utils/depreciation';
import { useToast } from '@/hooks/use-toast';

const sampleCows: Cow[] = [
  {
    id: 'cow-001',
    tagNumber: '001',
    name: 'Bessie',
    birthDate: new Date('2020-03-15'),
    freshenDate: new Date('2022-04-01'),
    purchasePrice: 2200,
    salvageValue: 220,
    assetType: {
      id: 'dairy-cow',
      name: 'Dairy Cow',
      defaultDepreciationYears: 5,
      defaultDepreciationMethod: 'straight-line',
      defaultSalvagePercentage: 10
    },
    status: 'active',
    depreciationMethod: 'straight-line',
    currentValue: 1980,
    totalDepreciation: 220
  },
  {
    id: 'cow-002',
    tagNumber: '002',
    name: 'Daisy',
    birthDate: new Date('2019-08-20'),
    freshenDate: new Date('2021-09-15'),
    purchasePrice: 2100,
    salvageValue: 210,
    assetType: {
      id: 'dairy-cow',
      name: 'Dairy Cow',
      defaultDepreciationYears: 5,
      defaultDepreciationMethod: 'straight-line',
      defaultSalvagePercentage: 10
    },
    status: 'active',
    depreciationMethod: 'straight-line',
    currentValue: 1260,
    totalDepreciation: 840
  }
];

export default function Dispositions() {
  const [cows, setCows] = useState<Cow[]>(sampleCows);
  const [dispositions, setDispositions] = useState<CowDisposition[]>([]);
  const [selectedCow, setSelectedCow] = useState<Cow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  const activeCows = cows.filter(cow => cow.status === 'active');
  const disposedCows = cows.filter(cow => cow.status !== 'active');

  const totalGains = dispositions
    .filter(d => d.gainLoss > 0)
    .reduce((sum, d) => sum + d.gainLoss, 0);

  const totalLosses = dispositions
    .filter(d => d.gainLoss < 0)
    .reduce((sum, d) => sum + Math.abs(d.gainLoss), 0);

  const handleDisposition = (updatedCow: Cow, disposition: CowDisposition) => {
    setCows(prev => prev.map(cow => cow.id === updatedCow.id ? updatedCow : cow));
    setDispositions(prev => [...prev, disposition]);
    setShowForm(false);
    setSelectedCow(null);
  };

  const handleStartDisposition = (cow: Cow) => {
    setSelectedCow(cow);
    setShowForm(true);
  };

  const getDispositionBadgeVariant = (status: string) => {
    switch (status) {
      case 'sold':
        return 'default';
      case 'deceased':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  if (showForm && selectedCow) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => {
            setShowForm(false);
            setSelectedCow(null);
          }}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dispositions
        </Button>
        
        <DispositionForm
          cow={selectedCow}
          onDisposition={handleDisposition}
          onCancel={() => {
            setShowForm(false);
            setSelectedCow(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cow Dispositions</h1>
          <p className="text-muted-foreground">
            Manage cow sales, deaths, and disposals
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cows</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCows.length}</div>
            <p className="text-xs text-muted-foreground">
              Available for disposition
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disposed Cows</CardTitle>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{disposedCows.length}</div>
            <p className="text-xs text-muted-foreground">
              Sold or deceased
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Gains</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {DepreciationCalculator.formatCurrency(totalGains)}
            </div>
            <p className="text-xs text-muted-foreground">
              From asset sales
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Losses</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {DepreciationCalculator.formatCurrency(totalLosses)}
            </div>
            <p className="text-xs text-muted-foreground">
              From disposals
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Cows - Available for Disposition */}
      <Card>
        <CardHeader>
          <CardTitle>Active Cows</CardTitle>
          <CardDescription>
            Select a cow to record a disposition (sale, death, or culling)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeCows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No active cows available for disposition
            </p>
          ) : (
            <div className="space-y-3">
              {activeCows.map((cow) => {
                const currentDate = new Date();
                const monthlyDepreciation = DepreciationCalculator.calculateMonthlyDepreciation(cow, currentDate);
                const monthsSinceStart = DepreciationCalculator.getMonthsSinceStart(cow.freshenDate, currentDate);
                const totalDepreciation = monthlyDepreciation * monthsSinceStart;
                const bookValue = Math.max(cow.salvageValue, cow.purchasePrice - totalDepreciation);

                return (
                  <div
                    key={cow.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="font-medium">
                          {cow.tagNumber} {cow.name && `(${cow.name})`}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Born: {DepreciationCalculator.formatDate(cow.birthDate)} • 
                          Freshen: {DepreciationCalculator.formatDate(cow.freshenDate)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          Book Value: {DepreciationCalculator.formatCurrency(bookValue)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Original: {DepreciationCalculator.formatCurrency(cow.purchasePrice)}
                        </div>
                      </div>
                      
                      <Button
                        size="sm"
                        onClick={() => handleStartDisposition(cow)}
                      >
                        Record Disposition
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disposition History */}
      <Card>
        <CardHeader>
          <CardTitle>Disposition History</CardTitle>
          <CardDescription>
            Previous cow dispositions and their financial impact
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dispositions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No dispositions recorded yet
            </p>
          ) : (
            <div className="space-y-3">
              {dispositions.map((disposition) => {
                const cow = cows.find(c => c.id === disposition.cowId);
                return (
                  <div
                    key={disposition.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="font-medium">
                          {cow?.tagNumber} {cow?.name && `(${cow.name})`}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {DepreciationCalculator.formatDate(disposition.dispositionDate)} • 
                          {disposition.notes && ` ${disposition.notes}`}
                        </div>
                      </div>
                      <Badge variant={getDispositionBadgeVariant(cow?.status || 'unknown')}>
                        {disposition.dispositionType}
                      </Badge>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {disposition.dispositionType === 'sale' 
                          ? `Sale: ${DepreciationCalculator.formatCurrency(disposition.saleAmount)}`
                          : 'No Sale Amount'
                        }
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Book Value: {DepreciationCalculator.formatCurrency(disposition.finalBookValue)}
                      </div>
                      {disposition.gainLoss !== 0 && (
                        <div className={`text-xs font-medium ${
                          disposition.gainLoss > 0 ? 'text-success' : 'text-destructive'
                        }`}>
                          {disposition.gainLoss > 0 ? 'Gain' : 'Loss'}: {' '}
                          {DepreciationCalculator.formatCurrency(Math.abs(disposition.gainLoss))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}