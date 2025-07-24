/**
 * Performance optimization: Caching layer for depreciation calculations
 * Reduces redundant calculations and improves UI responsiveness
 */

import { 
  calculateCurrentDepreciation,
  type DepreciationInput,
  type DepreciationResult,
  type Result,
} from '../depreciation/depreciation-calculator';
import { isOk } from '../types/result';

// In-memory cache with LRU eviction
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Cache instances
const depreciationCache = new LRUCache<string, DepreciationResult>(500);
const priceDefaultsCache = new LRUCache<string, any[]>(10);

// Cache key generators
const createDepreciationCacheKey = (input: DepreciationInput): string => {
  return `${input.purchasePrice}-${input.salvageValue}-${input.freshenDate.getTime()}-${input.depreciationMethod}`;
};

const createPriceDefaultsCacheKey = (companyId: string): string => {
  return `price-defaults-${companyId}`;
};

/**
 * Cached depreciation calculation
 */
export const calculateCurrentDepreciationCached = (
  input: DepreciationInput
): Result<DepreciationResult, Error> => {
  const cacheKey = createDepreciationCacheKey(input);
  
  // Check cache first
  const cached = depreciationCache.get(cacheKey);
  if (cached) {
    return { success: true, data: cached };
  }
  
  // Calculate and cache result
  const result = calculateCurrentDepreciation(input);
  if (isOk(result)) {
    depreciationCache.set(cacheKey, result.data);
  }
  
  return result;
};

/**
 * Batch depreciation calculations with caching
 */
export const calculateBatchDepreciationCached = (
  inputs: DepreciationInput[]
): Result<DepreciationResult, Error>[] => {
  return inputs.map(input => calculateCurrentDepreciationCached(input));
};

/**
 * Cache price defaults to reduce database calls
 */
export const cachePriceDefaults = (companyId: string, defaults: any[]): void => {
  const cacheKey = createPriceDefaultsCacheKey(companyId);
  priceDefaultsCache.set(cacheKey, defaults);
};

/**
 * Get cached price defaults
 */
export const getCachedPriceDefaults = (companyId: string): any[] | undefined => {
  const cacheKey = createPriceDefaultsCacheKey(companyId);
  return priceDefaultsCache.get(cacheKey);
};

/**
 * Invalidate caches (call when data changes)
 */
export const invalidateDepreciationCache = (): void => {
  depreciationCache.clear();
};

export const invalidatePriceDefaultsCache = (companyId?: string): void => {
  if (companyId) {
    const cacheKey = createPriceDefaultsCacheKey(companyId);
    priceDefaultsCache.has(cacheKey) && priceDefaultsCache.set(cacheKey, []);
  } else {
    priceDefaultsCache.clear();
  }
};

/**
 * Cache statistics for monitoring
 */
export const getCacheStats = () => {
  return {
    depreciation: {
      size: depreciationCache.size(),
      maxSize: 500,
    },
    priceDefaults: {
      size: priceDefaultsCache.size(),
      maxSize: 10,
    },
  };
};