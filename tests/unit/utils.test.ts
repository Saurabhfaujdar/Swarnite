import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatIndianNumber,
  formatWeight,
  formatDate,
  formatDateForInput,
  getToday,
  calculateGST,
  calculateFineWeight,
  calculateMetalAmount,
  calculateLabourAmount,
  getFinancialYear,
  getDayName,
  debounce,
  numberToWords,
} from '../../src/lib/utils';

// ─── formatCurrency ────────────────────────────────────────
describe('formatCurrency', () => {
  it('formats a positive number as INR currency', () => {
    const result = formatCurrency(1500);
    expect(result).toContain('1,500.00');
    // May contain ₹ or "INR" depending on locale support
  });

  it('formats zero correctly', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0.00');
  });

  it('handles null/undefined by returning ₹0', () => {
    expect(formatCurrency(null)).toContain('0.00');
    expect(formatCurrency(undefined)).toContain('0.00');
  });

  it('formats a string number', () => {
    const result = formatCurrency('250000');
    expect(result).toContain('2,50,000.00');
  });

  it('handles large Indian number grouping (lakh, crore)', () => {
    const result = formatCurrency(10000000);
    expect(result).toContain('1,00,00,000.00');
  });
});

// ─── formatIndianNumber ────────────────────────────────────
describe('formatIndianNumber', () => {
  it('formats 1234567 with Indian commas', () => {
    expect(formatIndianNumber(1234567)).toBe('12,34,567.00');
  });

  it('returns 0 for null/undefined', () => {
    expect(formatIndianNumber(null)).toBe('0.00');
    expect(formatIndianNumber(undefined)).toBe('0.00');
  });

  it('handles string input', () => {
    expect(formatIndianNumber('50000')).toBe('50,000.00');
  });

  it('handles negative numbers', () => {
    const result = formatIndianNumber(-1500);
    expect(result).toContain('1,500.00');
  });
});

// ─── formatWeight ──────────────────────────────────────────
describe('formatWeight', () => {
  it('formats weight to 3 decimal places', () => {
    expect(formatWeight(12.5)).toBe('12.500');
  });

  it('formats 0 correctly', () => {
    expect(formatWeight(0)).toBe('0.000');
  });

  it('handles null/undefined', () => {
    expect(formatWeight(null)).toBe('0.000');
    expect(formatWeight(undefined)).toBe('0.000');
  });

  it('formats string numbers', () => {
    expect(formatWeight('4.12345')).toBe('4.123');
  });

  it('pads when less than 3 decimals', () => {
    expect(formatWeight(3.1)).toBe('3.100');
  });
});

// ─── formatDate ────────────────────────────────────────────
describe('formatDate', () => {
  it('returns empty string for null/undefined', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
  });

  it('formats a Date object', () => {
    const result = formatDate(new Date('2024-12-25'));
    expect(result).toMatch(/25/);
    expect(result).toMatch(/12/);
    expect(result).toMatch(/2024/);
  });

  it('formats a string date', () => {
    const result = formatDate('2024-01-15T00:00:00Z');
    expect(result).toMatch(/15/);
    expect(result).toMatch(/01/);
  });
});

// ─── formatDateForInput ────────────────────────────────────
describe('formatDateForInput', () => {
  it('returns empty for null', () => {
    expect(formatDateForInput(null)).toBe('');
  });

  it('formats a Date to YYYY-MM-DD', () => {
    const result = formatDateForInput(new Date('2024-06-15T12:00:00Z'));
    expect(result).toMatch(/^2024-06-15$/);
  });
});

// ─── getToday ──────────────────────────────────────────────
describe('getToday', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const today = getToday();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns today\'s date', () => {
    const today = getToday();
    const now = new Date().toISOString().split('T')[0];
    expect(today).toBe(now);
  });
});

// ─── calculateGST ─────────────────────────────────────────
describe('calculateGST', () => {
  it('calculates default 1.5% CGST and 1.5% SGST', () => {
    const gst = calculateGST(10000);
    expect(gst.cgst).toBe(150);
    expect(gst.sgst).toBe(150);
    expect(gst.total).toBe(300);
    expect(gst.taxableAmount).toBe(10000);
  });

  it('calculates with custom rates', () => {
    const gst = calculateGST(50000, 2.5, 2.5);
    expect(gst.cgst).toBe(1250);
    expect(gst.sgst).toBe(1250);
    expect(gst.total).toBe(2500);
  });

  it('handles zero amount', () => {
    const gst = calculateGST(0);
    expect(gst.cgst).toBe(0);
    expect(gst.sgst).toBe(0);
    expect(gst.total).toBe(0);
  });

  it('handles large amounts accurately', () => {
    const gst = calculateGST(1000000);
    expect(gst.cgst).toBe(15000);
    expect(gst.sgst).toBe(15000);
    expect(gst.total).toBe(30000);
  });
});

// ─── calculateFineWeight ───────────────────────────────────
describe('calculateFineWeight', () => {
  it('calculates fine weight from gross weight and purity', () => {
    expect(calculateFineWeight(10, 91.6)).toBeCloseTo(9.16);
  });

  it('calculates 999 purity', () => {
    expect(calculateFineWeight(10, 99.9)).toBeCloseTo(9.99);
  });

  it('handles zero gross weight', () => {
    expect(calculateFineWeight(0, 91.6)).toBe(0);
  });

  it('handles zero purity', () => {
    expect(calculateFineWeight(10, 0)).toBe(0);
  });

  it('calculates for 75% purity (18KT)', () => {
    expect(calculateFineWeight(20, 75)).toBeCloseTo(15);
  });
});

// ─── calculateMetalAmount ──────────────────────────────────
describe('calculateMetalAmount', () => {
  it('calculates metal amount = weight x rate', () => {
    expect(calculateMetalAmount(9.16, 67300)).toBeCloseTo(616468);
  });

  it('handles zero weight', () => {
    expect(calculateMetalAmount(0, 67300)).toBe(0);
  });

  it('handles zero rate', () => {
    expect(calculateMetalAmount(10, 0)).toBe(0);
  });
});

// ─── calculateLabourAmount ─────────────────────────────────
describe('calculateLabourAmount', () => {
  it('calculates labour = weight x rate', () => {
    expect(calculateLabourAmount(10, 500)).toBe(5000);
  });

  it('handles zero values', () => {
    expect(calculateLabourAmount(0, 500)).toBe(0);
    expect(calculateLabourAmount(10, 0)).toBe(0);
  });
});

// ─── getFinancialYear ──────────────────────────────────────
describe('getFinancialYear', () => {
  it('returns correct FY for date in April (start of FY)', () => {
    const fy = getFinancialYear(new Date('2024-04-01'));
    expect(fy).toBe('2024-2025');
  });

  it('returns correct FY for date in March (end of FY)', () => {
    const fy = getFinancialYear(new Date('2025-03-31'));
    expect(fy).toBe('2024-2025');
  });

  it('returns correct FY for January (belongs to previous year FY)', () => {
    const fy = getFinancialYear(new Date('2025-01-15'));
    expect(fy).toBe('2024-2025');
  });

  it('returns correct FY for December', () => {
    const fy = getFinancialYear(new Date('2024-12-25'));
    expect(fy).toBe('2024-2025');
  });

  it('defaults to current date when no arg provided', () => {
    const fy = getFinancialYear();
    expect(fy).toMatch(/^\d{4}-\d{4}$/);
  });
});

// ─── getDayName ────────────────────────────────────────────
describe('getDayName', () => {
  it('returns day name for a known date', () => {
    // 2024-12-25 is Wednesday
    expect(getDayName('2024-12-25')).toBe('Wednesday');
  });

  it('returns day name from Date object', () => {
    const d = new Date('2024-01-01'); // Monday
    expect(getDayName(d)).toBe('Monday');
  });

  it('returns Sunday correctly', () => {
    expect(getDayName('2024-12-29')).toBe('Sunday');
  });
});

// ─── debounce ──────────────────────────────────────────────
describe('debounce', () => {
  it('delays execution', async () => {
    let counter = 0;
    const debounced = debounce(() => counter++, 50);

    debounced();
    debounced();
    debounced();
    expect(counter).toBe(0);

    await new Promise((r) => setTimeout(r, 100));
    expect(counter).toBe(1);
  });

  it('only runs the last invocation', async () => {
    const calls: number[] = [];
    const debounced = debounce((n: number) => calls.push(n), 50);

    debounced(1);
    debounced(2);
    debounced(3);

    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toEqual([3]);
  });
});

// ─── numberToWords ─────────────────────────────────────────
describe('numberToWords', () => {
  it('returns "Zero Rupees Only" for 0', () => {
    expect(numberToWords(0)).toBe('Zero Rupees Only');
  });

  it('converts single-digit numbers', () => {
    expect(numberToWords(5)).toBe('Five Rupees Only');
    expect(numberToWords(1)).toBe('One Rupees Only');
    expect(numberToWords(9)).toBe('Nine Rupees Only');
  });

  it('converts teens correctly', () => {
    expect(numberToWords(11)).toBe('Eleven Rupees Only');
    expect(numberToWords(15)).toBe('Fifteen Rupees Only');
    expect(numberToWords(19)).toBe('Nineteen Rupees Only');
  });

  it('converts two-digit numbers', () => {
    expect(numberToWords(20)).toBe('Twenty Rupees Only');
    expect(numberToWords(42)).toBe('Forty Two Rupees Only');
    expect(numberToWords(99)).toBe('Ninety Nine Rupees Only');
  });

  it('converts hundreds', () => {
    expect(numberToWords(100)).toBe('One Hundred Rupees Only');
    expect(numberToWords(256)).toBe('Two Hundred Fifty Six Rupees Only');
    expect(numberToWords(999)).toBe('Nine Hundred Ninety Nine Rupees Only');
  });

  it('converts thousands (Indian numbering)', () => {
    expect(numberToWords(1000)).toBe('One Thousand Rupees Only');
    expect(numberToWords(18840)).toBe('Eighteen Thousand Eight Hundred Forty Rupees Only');
    expect(numberToWords(77722)).toBe('Seventy Seven Thousand Seven Hundred Twenty Two Rupees Only');
    expect(numberToWords(99999)).toBe('Ninety Nine Thousand Nine Hundred Ninety Nine Rupees Only');
  });

  it('converts lakhs', () => {
    expect(numberToWords(100000)).toBe('One Lakh Rupees Only');
    expect(numberToWords(250000)).toBe('Two Lakh Fifty Thousand Rupees Only');
    expect(numberToWords(1500000)).toBe('Fifteen Lakh Rupees Only');
  });

  it('converts crores', () => {
    expect(numberToWords(10000000)).toBe('One Crore Rupees Only');
    expect(numberToWords(52300000)).toBe('Five Crore Twenty Three Lakh Rupees Only');
  });

  it('handles decimal / paise', () => {
    expect(numberToWords(100.50)).toBe('One Hundred Rupees and Fifty Paise Only');
    expect(numberToWords(1234.75)).toBe('One Thousand Two Hundred Thirty Four Rupees and Seventy Five Paise Only');
  });

  it('handles negative numbers', () => {
    expect(numberToWords(-500)).toBe('Minus Five Hundred Rupees Only');
  });

  it('handles large combined amount', () => {
    // 1 crore 23 lakh 45 thousand 678
    expect(numberToWords(12345678)).toBe('One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees Only');
  });
});
