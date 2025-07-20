import { useState } from 'react';
import { MoreHorizontal, Calendar, DollarSign, TrendingDown } from 'lucide-react';
import { Cow } from '@/types/cow';
import { DepreciationCalculator } from '@/utils/depreciation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface CowDataTableProps {
  cows: Cow[];
  onEditCow?: (cow: Cow) => void;
  onDeleteCow?: (cowId: string) => void;
}

export function CowDataTable({ cows, onEditCow, onDeleteCow }: CowDataTableProps) {
  const [sortColumn, setSortColumn] = useState<keyof Cow>('tagNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: keyof Cow) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedCows = [...cows].sort((a, b) => {
    const aValue = a[sortColumn];
    const bValue = b[sortColumn];
    
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const getStatusBadge = (status: string) => {
    const variants = {
      active: 'default',
      sold: 'secondary',
      deceased: 'destructive',
      retired: 'outline'
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const calculateMonthsInService = (freshenDate: Date) => {
    const now = new Date();
    return DepreciationCalculator.getMonthsSinceStart(freshenDate, now);
  };

  const totalValue = cows.reduce((sum, cow) => sum + cow.purchasePrice, 0);
  const totalCurrentValue = cows.reduce((sum, cow) => sum + cow.currentValue, 0);
  const totalDepreciation = totalValue - totalCurrentValue;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Cows</p>
                <p className="text-2xl font-bold">{cows.length.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Original Value</p>
                <p className="text-2xl font-bold">{DepreciationCalculator.formatCurrency(totalValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Value</p>
                <p className="text-2xl font-bold">{DepreciationCalculator.formatCurrency(totalCurrentValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-warning/10 rounded-lg flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Depreciation</p>
                <p className="text-2xl font-bold">{DepreciationCalculator.formatCurrency(totalDepreciation)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Dairy Cow Inventory</CardTitle>
          <CardDescription>
            Manage your dairy cow assets and track depreciation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50" 
                    onClick={() => handleSort('tagNumber')}
                  >
                    Tag Number {sortColumn === 'tagNumber' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('freshenDate')}
                  >
                    Freshen Date {sortColumn === 'freshenDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead>Months in Service</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('purchasePrice')}
                  >
                    Purchase Price {sortColumn === 'purchasePrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('currentValue')}
                  >
                    Current Value {sortColumn === 'currentValue' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCows.map((cow) => (
                  <TableRow key={cow.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{cow.tagNumber}</TableCell>
                    <TableCell>{cow.name || '-'}</TableCell>
                    <TableCell>{DepreciationCalculator.formatDate(cow.freshenDate)}</TableCell>
                    <TableCell>{calculateMonthsInService(cow.freshenDate)} months</TableCell>
                    <TableCell>{DepreciationCalculator.formatCurrency(cow.purchasePrice)}</TableCell>
                    <TableCell>{DepreciationCalculator.formatCurrency(cow.currentValue)}</TableCell>
                    <TableCell>{getStatusBadge(cow.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditCow?.(cow)}>
                            Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDeleteCow?.(cow.id)}>
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {cows.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p>No cows imported yet</p>
                <p className="text-sm">Upload a CSV file to get started</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}