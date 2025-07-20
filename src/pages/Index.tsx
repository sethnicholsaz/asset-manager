import { useState } from 'react';
import { Cow } from '@/types/cow';
import { CowUpload } from '@/components/CowUpload';
import { CowDataTable } from '@/components/CowDataTable';
import { DepreciationReport } from '@/components/DepreciationReport';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const Index = () => {
  const [cows, setCows] = useState<Cow[]>([]);

  const handleCowUpload = (uploadedCows: Cow[]) => {
    setCows(prev => [...prev, ...uploadedCows]);
  };

  const handleDeleteCow = (cowId: string) => {
    setCows(prev => prev.filter(cow => cow.id !== cowId));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">🐄</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Dairy Cow Depreciation Tracker</h1>
              <p className="text-muted-foreground">Professional asset depreciation management for dairy operations</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="upload">Import</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <CowDataTable 
              cows={cows} 
              onDeleteCow={handleDeleteCow}
            />
          </TabsContent>

          <TabsContent value="upload" className="space-y-6">
            <CowUpload onUpload={handleCowUpload} />
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <DepreciationReport cows={cows} />
          </TabsContent>
        </Tabs>

        {/* Quick Start Guide */}
        {cows.length === 0 && (
          <Card className="mt-8">
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
                    Use the Import tab to upload your CSV file and automatically populate your cow inventory
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
    </div>
  );
};

export default Index;
