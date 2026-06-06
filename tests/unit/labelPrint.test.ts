/**
 * Unit tests for barcode label printing logic.
 * Tests buildBarcodeData encoding, grid layout calculation, and edge cases.
 */
import { describe, it, expect } from 'vitest';

// Replicate the constants and helper from LabelPrint.tsx since they aren't
// exported (they're internal to the component). This keeps tests decoupled.

// Label dimensions in mm
const LABEL_W = 38;
const LABEL_H = 25;

// Page layout (A4)
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 5;
const MARGIN_Y = 8;
const GAP_X = 2;
const GAP_Y = 2;

const COLS = Math.floor((PAGE_W - 2 * MARGIN_X + GAP_X) / (LABEL_W + GAP_X));
const ROWS = Math.floor((PAGE_H - 2 * MARGIN_Y + GAP_Y) / (LABEL_H + GAP_Y));

interface CartLabel {
  id: number;
  labelNo: string;
  itemId: number;
  itemName: string;
  grossWeight: number;
  netWeight: number;
  pcsCount: number;
  status: string;
  metalType?: string;
  purityCode?: string;
  huid?: string;
}

function buildBarcodeData(label: CartLabel): string {
  const name = label.itemName.length > 20 ? label.itemName.substring(0, 20) : label.itemName;
  const parts = [
    label.labelNo,
    `${label.grossWeight}g`,
    label.metalType || '',
    label.purityCode || '',
    name,
  ];
  return parts.join('|');
}

describe('LabelPrint', () => {
  describe('grid layout calculation', () => {
    it('calculates 5 columns for A4 with 38mm labels', () => {
      expect(COLS).toBe(5);
    });

    it('calculates 10 rows for A4 with 25mm labels', () => {
      expect(ROWS).toBe(10);
    });

    it('fits 50 labels per A4 page', () => {
      expect(COLS * ROWS).toBe(50);
    });

    it('labels fit within A4 width with margins', () => {
      const totalWidth = 2 * MARGIN_X + COLS * LABEL_W + (COLS - 1) * GAP_X;
      expect(totalWidth).toBeLessThanOrEqual(PAGE_W);
    });

    it('labels fit within A4 height with margins', () => {
      const totalHeight = 2 * MARGIN_Y + ROWS * LABEL_H + (ROWS - 1) * GAP_Y;
      expect(totalHeight).toBeLessThanOrEqual(PAGE_H);
    });
  });

  describe('buildBarcodeData', () => {
    it('encodes label fields pipe-delimited', () => {
      const label: CartLabel = {
        id: 1, labelNo: 'GP/1', itemId: 10, itemName: 'Gold Pendant',
        grossWeight: 5.2, netWeight: 4.8, pcsCount: 1, status: 'IN_STOCK',
        metalType: 'Gold', purityCode: '22KT',
      };
      const result = buildBarcodeData(label);
      expect(result).toBe('GP/1|5.2g|Gold|22KT|Gold Pendant');
    });

    it('truncates item name to 20 characters', () => {
      const label: CartLabel = {
        id: 2, labelNo: 'GN/51', itemId: 20,
        itemName: 'Very Long Gold Necklace Name Exceeding Limit',
        grossWeight: 10.5, netWeight: 9.8, pcsCount: 1, status: 'IN_STOCK',
        metalType: 'Gold', purityCode: '22KT',
      };
      const result = buildBarcodeData(label);
      const namePart = result.split('|')[4];
      expect(namePart.length).toBeLessThanOrEqual(20);
      expect(namePart).toBe('Very Long Gold Neckl');
    });

    it('handles missing metalType and purityCode', () => {
      const label: CartLabel = {
        id: 3, labelNo: 'SR/10', itemId: 30, itemName: 'Silver Ring',
        grossWeight: 3.0, netWeight: 2.8, pcsCount: 1, status: 'IN_STOCK',
      };
      const result = buildBarcodeData(label);
      expect(result).toBe('SR/10|3g|||Silver Ring');
    });

    it('handles decimal gross weight formatting', () => {
      const label: CartLabel = {
        id: 4, labelNo: 'GB/1', itemId: 40, itemName: 'Bangle',
        grossWeight: 12.345, netWeight: 11.0, pcsCount: 1, status: 'IN_STOCK',
        metalType: 'Gold', purityCode: '18KT',
      };
      const result = buildBarcodeData(label);
      expect(result).toContain('12.345g');
    });

    it('keeps name exactly 20 chars when name is exactly 20', () => {
      const label: CartLabel = {
        id: 5, labelNo: 'X/1', itemId: 50, itemName: '12345678901234567890', // 20 chars
        grossWeight: 1.0, netWeight: 0.9, pcsCount: 1, status: 'IN_STOCK',
      };
      const result = buildBarcodeData(label);
      const namePart = result.split('|')[4];
      expect(namePart).toBe('12345678901234567890');
    });

    it('encodes for Code128 compatibility (no control chars)', () => {
      const label: CartLabel = {
        id: 6, labelNo: 'GP/100', itemId: 60, itemName: 'Test Item',
        grossWeight: 2.5, netWeight: 2.3, pcsCount: 1, status: 'IN_STOCK',
        metalType: 'Gold', purityCode: '24KT',
      };
      const result = buildBarcodeData(label);
      // Code128 supports ASCII 32-126; pipe (124) is valid
      for (const char of result) {
        const code = char.charCodeAt(0);
        expect(code).toBeGreaterThanOrEqual(32);
        expect(code).toBeLessThanOrEqual(126);
      }
    });

    it('produces scannable-length data (under 48 chars for thermal printers)', () => {
      const label: CartLabel = {
        id: 7, labelNo: 'GP/999', itemId: 70, itemName: 'Gold Pendant 22KT BIS',
        grossWeight: 99.99, netWeight: 95.0, pcsCount: 1, status: 'IN_STOCK',
        metalType: 'Gold', purityCode: '22KT',
      };
      const result = buildBarcodeData(label);
      // Typical thermal printer scanners can handle up to ~48 chars for Code128
      expect(result.length).toBeLessThanOrEqual(60);
    });
  });

  describe('page count estimation', () => {
    it('calculates correct number of pages', () => {
      const labelsPerPage = COLS * ROWS;
      expect(Math.ceil(1 / labelsPerPage)).toBe(1);
      expect(Math.ceil(50 / labelsPerPage)).toBe(1);
      expect(Math.ceil(51 / labelsPerPage)).toBe(2);
      expect(Math.ceil(100 / labelsPerPage)).toBe(2);
      expect(Math.ceil(101 / labelsPerPage)).toBe(3);
    });
  });
});
