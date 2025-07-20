import { useState } from 'react';
import { Cow } from '@/types/cow';
import { CowDataTable } from '@/components/CowDataTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, DollarSign, Calendar } from 'lucide-react';

// Sample data for demo
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
    totalDepreciation: 220,
    acquisitionType: 'purchased'
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
    totalDepreciation: 840,
    acquisitionType: 'raised'
  }
];

const Index = () => {
  const [cows, setCows] = useState<Cow[]>(sampleCows);

  const handleDeleteCow = (cowId: string) => {
    setCows(prev => prev.filter(cow => cow.id !== cowId));
  };

  // Calculate summary statistics
  const totalAssetValue = cows.reduce((sum, cow) => sum + cow.purchasePrice, 0);
  const totalCurrentValue = cows.reduce((sum, cow) => sum + cow.currentValue, 0);
  const totalDepreciation = cows.reduce((sum, cow) => sum + cow.totalDepreciation, 0);
  const activeCows = cows.filter(cow => cow.status === 'active').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your dairy cow assets and depreciation
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cows</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCows}</div>
            <p className="text-xs text-muted-foreground">
              Currently in herd
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Asset Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalAssetValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Original purchase value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalCurrentValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              After depreciation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Depreciation</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalDepreciation.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Accumulated to date
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cow Inventory Table */}
      <CowDataTable 
        cows={cows} 
        onDeleteCow={handleDeleteCow}
      />

      {/* Quick Start Guide */}
      {cows.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>
              Follow these steps to begin tracking your dairy cow depreciation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <span className="text-2xl">📊</span>
                </div>
                <h3 className="font-medium">1. Prepare Your Data</h3>
                <p className="text-sm text-muted-foreground">
                  Create a CSV file with cow information including tag numbers, birth dates, freshen dates, and purchase prices
                </p>
              </div>
              
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <span className="text-2xl">📤</span>
                </div>
                <h3 className="font-medium">2. Import Your Cows</h3>
                <p className="text-sm text-muted-foreground">
                  Use the Import page to upload your CSV file and automatically populate your cow inventory
                </p>
              </div>
              
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <span className="text-2xl">📈</span>
                </div>
                <h3 className="font-medium">3. Generate Reports</h3>
                <p className="text-sm text-muted-foreground">
                  Create monthly depreciation reports and journal entries for your accounting system
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Index;