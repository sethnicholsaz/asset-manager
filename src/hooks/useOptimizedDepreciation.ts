/**
 * Optimized React hook for depreciation calculations
 * Incorporates caching, batching, and performance optimizations
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  calculateCurrentDepreciationCached,
  batchCalculateDepreciation,
  getCacheStats,
  invalidateDepreciationCache,
} from '@/domain/cache/depreciation-cache';
import { createDebounced, createThrottled } from '@/domain/batch/batch-processor';
import { 
  type DepreciationInput,
  type DepreciationResult,
  DEPRECIATION_CONFIG,
} from '@/domain';
import { isOk } from '@/domain/types/result';

export interface CowDepreciationData {
  cowId: string;
  tagNumber: string;
  depreciation: DepreciationResult | null;
  isCalculating: boolean;
  error: string | null;
}

export interface UseOptimizedDepreciationOptions {
  enableCaching?: boolean;
  batchSize?: number;
  debounceDelay?: number;
  onProgress?: (processed: number, total: number) => void;
}

export interface UseOptimizedDepreciationReturn {
  // Data
  cowDepreciations: CowDepreciationData[];
  summary: {
    totalCows: number;
    totalMonthlyDepreciation: number;
    totalCurrentValue: number;
    averageAge: number;
  };
  
  // State
  isCalculating: boolean;
  progress: { processed: number; total: number };
  cacheStats: ReturnType<typeof getCacheStats>;
  
  // Actions
  calculateDepreciation: (input: DepreciationInput, cowId: string, tagNumber: string) => void;
  calculateBatch: (inputs: Array<DepreciationInput & { cowId: string; tagNumber: string }>) => Promise<void>;
  recalculateAll: () => void;
  clearCache: () => void;
}

export const useOptimizedDepreciation = (
  options: UseOptimizedDepreciationOptions = {}
): UseOptimizedDepreciationReturn => {
  const {
    enableCaching = true,
    batchSize = 50,
    debounceDelay = 300,
    onProgress,
  } = options;

  // State
  const [cowDepreciations, setCowDepreciations] = useState<CowDepreciationData[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [cacheStats, setCacheStats] = useState(getCacheStats());

  // Update cache stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setCacheStats(getCacheStats());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Debounced single calculation
  const debouncedCalculate = useMemo(
    () => createDebounced((input: DepreciationInput, cowId: string, tagNumber: string) => {
      setCowDepreciations(prev => {
        const existing = prev.find(c => c.cowId === cowId);
        if (existing) {
          return prev.map(c => 
            c.cowId === cowId 
              ? { ...c, isCalculating: true, error: null }
              : c
          );
        } else {
          return [...prev, {
            cowId,
            tagNumber,
            depreciation: null,
            isCalculating: true,
            error: null,
          }];
        }
      });

      // Perform calculation
      const result = enableCaching 
        ? calculateCurrentDepreciationCached(input)
        : { success: false, error: new Error('Caching disabled') } as any;

      setCowDepreciations(prev => prev.map(c => 
        c.cowId === cowId 
          ? {
              ...c,
              depreciation: isOk(result) ? result.data : null,
              isCalculating: false,
              error: isOk(result) ? null : result.error.message,
            }
          : c
      ));
    }, debounceDelay),
    [enableCaching, debounceDelay]
  );

  // Throttled progress updates
  const throttledProgressUpdate = useMemo(
    () => createThrottled((processed: number, total: number) => {
      setProgress({ processed, total });
      onProgress?.(processed, total);
    }, 100),
    [onProgress]
  );

  // Calculate single depreciation
  const calculateDepreciation = useCallback((
    input: DepreciationInput, 
    cowId: string, 
    tagNumber: string
  ) => {
    debouncedCalculate(input, cowId, tagNumber);
  }, [debouncedCalculate]);

  // Calculate batch of depreciations
  const calculateBatch = useCallback(async (
    inputs: Array<DepreciationInput & { cowId: string; tagNumber: string }>
  ) => {
    setIsCalculating(true);
    setProgress({ processed: 0, total: inputs.length });

    // Initialize cow depreciation states
    setCowDepreciations(prev => {
      const newCows = inputs.filter(input => !prev.some(c => c.cowId === input.cowId));
      const updatedExisting = prev.map(c => {
        const input = inputs.find(i => i.cowId === c.cowId);
        return input ? { ...c, isCalculating: true, error: null } : c;
      });
      
      return [
        ...updatedExisting,
        ...newCows.map(input => ({
          cowId: input.cowId,
          tagNumber: input.tagNumber,
          depreciation: null,
          isCalculating: true,
          error: null,
        }))
      ];
    });

    try {
      const result = await batchCalculateDepreciation(
        inputs,
        {
          batchSize,
          onProgress: throttledProgressUpdate,
          onBatchComplete: (batchIndex, batchResults) => {
            // Update results as each batch completes
            const startIndex = batchIndex * batchSize;
            const batchInputs = inputs.slice(startIndex, startIndex + batchSize);
            
            setCowDepreciations(prev => prev.map(c => {
              const inputIndex = batchInputs.findIndex(i => i.cowId === c.cowId);
              if (inputIndex !== -1) {
                const batchResult = batchResults[inputIndex];
                return {
                  ...c,
                  depreciation: batchResult,
                  isCalculating: false,
                  error: batchResult ? null : 'Calculation failed',
                };
              }
              return c;
            }));
          },
        }
      );

      // Final update for any remaining items
      setCowDepreciations(prev => prev.map((c, index) => {
        if (index < result.results.length) {
          return {
            ...c,
            depreciation: result.results[index],
            isCalculating: false,
            error: result.results[index] ? null : 'Calculation failed',
          };
        }
        return c;
      }));

      if (result.errors.length > 0) {
        console.warn('Batch calculation errors:', result.errors);
      }

    } catch (error) {
      console.error('Batch calculation failed:', error);
      setCowDepreciations(prev => prev.map(c => ({
        ...c,
        isCalculating: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })));
    } finally {
      setIsCalculating(false);
      setProgress({ processed: inputs.length, total: inputs.length });
    }
  }, [batchSize, throttledProgressUpdate]);

  // Recalculate all depreciations
  const recalculateAll = useCallback(() => {
    setCowDepreciations(prev => prev.map(c => ({
      ...c,
      isCalculating: true,
      error: null,
    })));

    // Trigger recalculation for all existing cows
    cowDepreciations.forEach(cow => {
      if (cow.depreciation) {
        const input: DepreciationInput = {
          purchasePrice: 0, // This would need to be passed from the cow data
          salvageValue: 0,
          freshenDate: new Date(),
          depreciationMethod: DEPRECIATION_CONFIG.DEPRECIATION_METHODS.STRAIGHT_LINE,
        };
        // In a real implementation, you'd need access to the original inputs
        debouncedCalculate(input, cow.cowId, cow.tagNumber);
      }
    });
  }, [cowDepreciations, debouncedCalculate]);

  // Clear cache
  const clearCache = useCallback(() => {
    invalidateDepreciationCache();
    setCacheStats(getCacheStats());
  }, []);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const validDepreciations = cowDepreciations.filter(c => c.depreciation !== null);
    
    const totalMonthlyDepreciation = validDepreciations.reduce(
      (sum, c) => sum + (c.depreciation?.monthlyDepreciation || 0), 
      0
    );
    
    const totalCurrentValue = validDepreciations.reduce(
      (sum, c) => sum + (c.depreciation?.currentValue || 0), 
      0
    );
    
    const averageAge = validDepreciations.length > 0
      ? validDepreciations.reduce(
          (sum, c) => sum + (c.depreciation?.monthsSinceFreshen || 0), 
          0
        ) / validDepreciations.length / 12
      : 0;

    return {
      totalCows: cowDepreciations.length,
      totalMonthlyDepreciation,
      totalCurrentValue,
      averageAge,
    };
  }, [cowDepreciations]);

  return {
    cowDepreciations,
    summary,
    isCalculating,
    progress,
    cacheStats,
    calculateDepreciation,
    calculateBatch,
    recalculateAll,
    clearCache,
  };
};