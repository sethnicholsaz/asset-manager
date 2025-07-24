import '@testing-library/jest-dom';

// Mock Date for consistent testing
const mockDate = new Date('2025-01-15T00:00:00.000Z');
global.Date = class extends Date {
  constructor(...args: any[]) {
    if (args.length === 0) {
      super(mockDate);
    } else {
      super(...args);
    }
  }
  
  static now() {
    return mockDate.getTime();
  }
} as any;