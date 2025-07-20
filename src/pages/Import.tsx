import { useState } from 'react';
import { Cow } from '@/types/cow';
import { CowUpload } from '@/components/CowUpload';

export default function Import() {
  const [cows, setCows] = useState<Cow[]>([]);

  const handleCowUpload = (uploadedCows: Cow[]) => {
    setCows(prev => [...prev, ...uploadedCows]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Cow Data</h1>
          <p className="text-muted-foreground">
            Upload CSV files to import your dairy cow inventory
          </p>
        </div>
      </div>

      <CowUpload onUpload={handleCowUpload} />

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