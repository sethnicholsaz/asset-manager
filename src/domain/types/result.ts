/**
 * Result type for functional error handling
 * Inspired by Rust's Result<T, E> type
 */

export type Result<T, E = Error> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly success: true;
  readonly data: T;
}

export interface Err<E> {
  readonly success: false;
  readonly error: E;
}

/**
 * Create a successful result
 */
export const ok = <T>(data: T): Ok<T> => ({
  success: true,
  data,
});

/**
 * Create an error result
 */
export const err = <E>(error: E): Err<E> => ({
  success: false,
  error,
});

/**
 * Check if result is successful
 */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => {
  return result.success;
};

/**
 * Check if result is an error
 */
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => {
  return !result.success;
};

/**
 * Map over successful result
 */
export const map = <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> => {
  return isOk(result) ? ok(fn(result.data)) : result;
};

/**
 * Chain results together (flatMap)
 */
export const chain = <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> => {
  return isOk(result) ? fn(result.data) : result;
};

/**
 * Map over error result
 */
export const mapErr = <T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> => {
  return isErr(result) ? err(fn(result.error)) : result;
};

/**
 * Get data from result or throw error
 */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (isOk(result)) {
    return result.data;
  }
  throw result.error;
};

/**
 * Get data from result or return default value
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T => {
  return isOk(result) ? result.data : defaultValue;
};

/**
 * Convert multiple results into a single result containing an array
 */
export const sequence = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const data: T[] = [];
  
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    data.push(result.data);
  }
  
  return ok(data);
};

/**
 * Common error types for the dairy application
 */
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class CalculationError extends Error {
  constructor(message: string, public cowId?: string) {
    super(message);
    this.name = 'CalculationError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}