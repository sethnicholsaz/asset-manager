import { useState } from 'react';
import { Cow } from '@/types/cow';
import { CowUpload } from '@/components/CowUpload';
import { CowForm } from '@/components/CowForm';
import { Separator } from '@/components/ui/separator';

export default function Import() {
  const [cows, setCows] = useState<Cow[]>([]);

  const handleCowUpload = (uploadedCows: Cow[]) => {
    setCows(prev => [...prev, ...uploadedCows]);
  };

  const handleAddCow = (cow: Cow) => {
    setCows(prev => [...prev, cow]);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Cow Data</h1>
          <p className="text-muted-foreground">
            Upload CSV files or add cows manually to build your inventory
          </p>
        </div>
      </div>

      {/* CSV Upload Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Bulk Import</h2>
          <p className="text-sm text-muted-foreground">
            Upload a CSV file to import multiple cows at once
          </p>
        </div>
        <CowUpload onUpload={handleCowUpload} />
      </div>

      <div className="flex items-center gap-4">
        <Separator className="flex-1" />
        <span className="text-sm text-muted-foreground">OR</span>
        <Separator className="flex-1" />
      </div>

      {/* Manual Entry Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Manual Entry</h2>
          <p className="text-sm text-muted-foreground">
            Add individual cows one at a time
          </p>
        </div>
        <CowForm onAddCow={handleAddCow} />
      </div>

      {cows.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Recently Imported ({cows.length} cows)</h2>
          <div className="grid gap-4">
            {cows.slice(0, 5).map((cow) => (
              <div key={cow.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">
                    {cow.tagNumber} {cow.name && `(${cow.name})`}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Purchase Price: ${cow.purchasePrice.toLocaleString()}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Added just now
                </div>
              </div>
            ))}
            {cows.length > 5 && (
              <div className="text-center text-muted-foreground">
                and {cows.length - 5} more...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}