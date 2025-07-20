import { Cow, DepreciationEntry, DepreciationMethod } from '@/types/cow';

export class DepreciationCalculator {
  static calculateMonthlyDepreciation(
    cow: Cow,
    currentDate: Date
  ): number {
    const depreciableAmount = cow.purchasePrice - cow.salvageValue;
    const depreciationYears = 5; // Standard 5-year depreciation for dairy cows
    
    switch (cow.depreciationMethod) {
      case 'straight-line':
        return depreciableAmount / (depreciationYears * 12);
      
      case 'declining-balance':
        // Double declining balance method
        const annualRate = 2 / depreciationYears;
        const monthlyRate = annualRate / 12;
        return cow.currentValue * monthlyRate;
      
      case 'sum-of-years':
        // Sum of years digits method
        const totalMonths = depreciationYears * 12;
        const monthsSinceStart = this.getMonthsSinceStart(cow.freshenDate, currentDate);
        const remainingMonths = Math.max(0, totalMonths - monthsSinceStart);
        const sumOfDigits = (totalMonths * (totalMonths + 1)) / 2;
        return (depreciableAmount * remainingMonths) / sumOfDigits;
      
      default:
        return depreciableAmount / (depreciationYears * 12);
    }
  }

  static getMonthsSinceStart(startDate: Date, currentDate: Date): number {
    const yearDiff = currentDate.getFullYear() - startDate.getFullYear();
    const monthDiff = currentDate.getMonth() - startDate.getMonth();
    return yearDiff * 12 + monthDiff;
  }

  static generateDepreciationSchedule(
    cow: Cow,
    startDate: Date,
    endDate: Date
  ): DepreciationEntry[] {
    const entries: DepreciationEntry[] = [];
    let currentDate = new Date(Math.max(startDate.getTime(), cow.freshenDate.getTime()));
    let accumulatedDepreciation = 0;
    let bookValue = cow.purchasePrice;

    while (currentDate <= endDate) {
      const monthlyDepreciation = this.calculateMonthlyDepreciation(cow, currentDate);
      accumulatedDepreciation += monthlyDepreciation;
      bookValue = Math.max(cow.salvageValue, cow.purchasePrice - accumulatedDepreciation);

      entries.push({
        id: `${cow.id}-${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`,
        cowId: cow.id,
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear(),
        depreciationAmount: monthlyDepreciation,
        accumulatedDepreciation,
        bookValue,
      });

      // Move to next month
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      
      // Stop if fully depreciated
      if (bookValue <= cow.salvageValue) break;
    }

    return entries;
  }

  static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  static formatDate(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(dateObj);
  }
}