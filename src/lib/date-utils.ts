/**
 * Timezone-agnostic date utilities for consistent date handling
 * These functions prevent timezone conversion issues in business data
 */

/**
 * Format a date string for database storage (YYYY-MM-DD)
 * Always returns the same date regardless of timezone
 */
export function formatDateForDB(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a date string for display (no timezone conversion)
 * Uses the date as-is from the database
 */
export function formatDateForDisplay(dateString: string | Date, format: 'short' | 'long' | 'medium' = 'medium'): string {
  if (!dateString) return '';
  
  try {
    // Handle different date input formats more robustly
    let date: Date;
    
    if (typeof dateString === 'string') {
      // Check if it's already an ISO string with time
      if (dateString.includes('T')) {
        date = new Date(dateString);
      } else {
        // For date-only strings, parse as local date to avoid timezone shifts
        const [year, month, day] = dateString.split('-').map(Number);
        date = new Date(year, month - 1, day); // month is 0-indexed
      }
    } else {
      date = dateString;
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: format === 'short' ? '2-digit' : format === 'long' ? 'long' : 'short',
      day: '2-digit'
    };
    
    return date.toLocaleDateString('en-US', options);
  } catch (error) {
    console.error('Date formatting error:', error, 'Input:', dateString);
    return 'Invalid Date';
  }
}

/**
 * Get current date for database storage (YYYY-MM-DD)
 */
export function getCurrentDateForDB(): string {
  return formatDateForDB(new Date());
}

/**
 * Get current timestamp for database storage (ISO string)
 */
export function getCurrentTimestampForDB(): string {
  return new Date().toISOString();
}

/**
 * Parse a date string from the database without timezone conversion
 */
export function parseDateFromDB(dateString: string): Date {
  // Add time component to prevent timezone interpretation
  return new Date(dateString + 'T00:00:00');
}

/**
 * Calculate age in years from birth date (no timezone issues)
 */
export function calculateAge(birthDateString: string): number {
  const birthDate = parseDateFromDB(birthDateString);
  const today = new Date();
  
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Format date for form inputs (YYYY-MM-DD)
 */
export function formatDateForInput(date: Date | string): string {
  if (!date) return '';
  return formatDateForDB(date);
}