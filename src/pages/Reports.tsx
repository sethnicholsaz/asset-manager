import { Cow } from '@/types/cow';
import { DepreciationReport } from '@/components/DepreciationReport';

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

export default function Reports() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Depreciation Reports</h1>
          <p className="text-muted-foreground">
            Generate monthly depreciation schedules and journal entries
          </p>
        </div>
      </div>

      <DepreciationReport cows={sampleCows} />
    </div>
  );
}