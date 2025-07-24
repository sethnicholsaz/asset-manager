# Migration Guide: Functional Domain Architecture

This guide helps migrate from the old class-based approach to the new functional domain architecture.

## Overview of Changes

### 1. **Centralized Configuration**
- All account codes and depreciation settings moved to `src/domain/config/depreciation-config.ts`
- No more hardcoded values scattered throughout the codebase

### 2. **Functional Programming**
- Replaced `DepreciationCalculator` class with pure functions
- Added `Result<T, E>` type for error handling
- Immutable data structures throughout

### 3. **Domain-Driven Design**
- Business logic moved to `src/domain/` folder
- Clear separation between domain, application, and infrastructure layers

### 4. **Input Validation**
- Added Zod schemas for all data structures
- Type-safe validation with meaningful error messages

## Migration Examples

### Old Class-Based Approach

```typescript
// ❌ Old way
import { DepreciationCalculator } from '@/utils/depreciation';

const monthlyDepreciation = DepreciationCalculator.calculateMonthlyDepreciation(cow, new Date());
const currentValues = DepreciationCalculator.calculateCurrentDepreciation({
  purchasePrice: cow.purchasePrice,
  salvageValue: cow.salvageValue,
  freshenDate: cow.freshenDate,
});
```

### New Functional Approach

```typescript
// ✅ New way
import { 
  calculateMonthlyDepreciation, 
  calculateCurrentDepreciation,
  isOk,
  unwrapOr 
} from '@/domain';

const input = {
  purchasePrice: cow.purchasePrice,
  salvageValue: cow.salvageValue,
  freshenDate: cow.freshenDate,
  depreciationMethod: cow.depreciationMethod,
};

const monthlyResult = calculateMonthlyDepreciation(input, new Date());
const monthlyDepreciation = unwrapOr(monthlyResult, 0);

const currentResult = calculateCurrentDepreciation(input);
if (isOk(currentResult)) {
  const { totalDepreciation, currentValue } = currentResult.data;
  // Use values safely
} else {
  console.error('Calculation failed:', currentResult.error.message);
}
```

### Journal Entry Creation

```typescript
// ❌ Old way - Manual journal line creation
const journalLines = [
  {
    account_code: '6100',
    account_name: 'Depreciation Expense',
    description: `Monthly depreciation - Cow #${cow.tag_number}`,
    debit_amount: depreciationAmount,
    credit_amount: 0,
    line_type: 'debit'
  },
  {
    account_code: '1500.1',
    account_name: 'Accumulated Depreciation - Dairy Cows',
    description: `Monthly depreciation - Cow #${cow.tag_number}`,
    debit_amount: 0,
    credit_amount: depreciationAmount,
    line_type: 'credit'
  }
];

// ✅ New way - Functional journal builder
import { createJournalEntry, isOk } from '@/domain';

const depreciationData = {
  companyId: cow.company_id,
  cowId: cow.id,
  cowTag: cow.tag_number,
  entryDate: new Date(),
  depreciationAmount: amount,
};

const journalResult = createJournalEntry('depreciation', depreciationData);
if (isOk(journalResult)) {
  const entry = journalResult.data;
  // Entry is automatically balanced and validated
} else {
  console.error('Journal creation failed:', journalResult.error.message);
}
```

### Error Handling

```typescript
// ❌ Old way - Try/catch everywhere
try {
  const result = someCalculation();
  // Handle success
} catch (error) {
  console.error('Something went wrong:', error);
  // Hard to know what type of error occurred
}

// ✅ New way - Result types
import { isOk, isErr } from '@/domain';

const result = someCalculation();
if (isOk(result)) {
  // Handle success case
  const data = result.data;
} else if (result.error instanceof ValidationError) {
  // Handle validation errors specifically
  console.error('Validation failed:', result.error.message);
} else if (result.error instanceof CalculationError) {
  // Handle calculation errors specifically
  console.error('Calculation failed:', result.error.message);
}
```

### Data Validation

```typescript
// ❌ Old way - Manual validation
if (!cow.purchasePrice || cow.purchasePrice <= 0) {
  throw new Error('Purchase price must be positive');
}
if (cow.salvageValue >= cow.purchasePrice) {
  throw new Error('Salvage value must be less than purchase price');
}

// ✅ New way - Schema validation
import { validateCow } from '@/domain';

const validation = validateCow(rawCowData);
if (!validation.success) {
  console.error('Validation errors:', validation.error.errors);
  return;
}

const cow = validation.data; // Type-safe validated data
```

## Component Migration Example

### Before

```typescript
// ❌ Old component approach
import { DepreciationCalculator } from '@/utils/depreciation';

const CowDepreciationComponent = ({ cow }) => {
  const [depreciation, setDepreciation] = useState(null);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    try {
      const result = DepreciationCalculator.calculateCurrentDepreciation({
        purchasePrice: cow.purchase_price,
        salvageValue: cow.salvage_value,
        freshenDate: cow.freshen_date,
      });
      setDepreciation(result);
      setError(null);
    } catch (err) {
      setError(err.message);
      setDepreciation(null);
    }
  }, [cow]);

  if (error) return <div>Error: {error}</div>;
  if (!depreciation) return <div>Loading...</div>;
  
  return (
    <div>
      <p>Current Value: ${depreciation.currentValue}</p>
      <p>Total Depreciation: ${depreciation.totalDepreciation}</p>
    </div>
  );
};
```

### After

```typescript
// ✅ New functional component approach
import { calculateCurrentDepreciation, isOk, formatCurrency } from '@/domain';

const CowDepreciationComponent = ({ cow }) => {
  const [state, setState] = useState({ depreciation: null, error: null, loading: true });
  
  useEffect(() => {
    const input = {
      purchasePrice: cow.purchase_price,
      salvageValue: cow.salvage_value,
      freshenDate: new Date(cow.freshen_date),
    };
    
    const result = calculateCurrentDepreciation(input);
    
    if (isOk(result)) {
      setState({ 
        depreciation: result.data, 
        error: null, 
        loading: false 
      });
    } else {
      setState({ 
        depreciation: null, 
        error: result.error.message, 
        loading: false 
      });
    }
  }, [cow]);

  if (state.loading) return <div>Loading...</div>;
  if (state.error) return <div>Error: {state.error}</div>;
  
  return (
    <div>
      <p>Current Value: {formatCurrency(state.depreciation.currentValue)}</p>
      <p>Total Depreciation: {formatCurrency(state.depreciation.totalDepreciation)}</p>
    </div>
  );
};
```

## Migration Checklist

### Phase 1: Foundation (✅ Complete)
- [x] Create domain folder structure
- [x] Implement Result type for error handling
- [x] Add centralized configuration
- [x] Create functional depreciation calculator
- [x] Add input validation with Zod
- [x] Create journal entry builder

### Phase 2: Component Migration (Next)
- [ ] Update CowForm to use new validation
- [ ] Migrate DepreciationReport to functional approach
- [ ] Update DispositionReport with new journal builder
- [ ] Refactor data import components

### Phase 3: Edge Function Migration
- [ ] Update monthly-journal-processor to use new builders
- [ ] Migrate cow-depreciation-catchup function
- [ ] Update disposition processing logic

### Phase 4: Testing & Optimization
- [ ] Add comprehensive unit tests
- [ ] Performance testing with large datasets
- [ ] Database query optimization
- [ ] Error monitoring integration

## Benefits of the New Approach

1. **Type Safety**: Comprehensive validation prevents runtime errors
2. **Maintainability**: Clear separation of concerns and functional composition
3. **Testability**: Pure functions are easy to test in isolation
4. **Error Handling**: Explicit error types make debugging easier
5. **Performance**: Immutable data structures prevent unexpected mutations
6. **Consistency**: Centralized configuration eliminates scattered constants

## Need Help?

- Check `src/domain/examples/depreciation-usage.ts` for usage examples
- All domain functions are documented with TypeScript types
- The old API remains available during migration (marked as `@deprecated`)
- Result types make error handling explicit and safe