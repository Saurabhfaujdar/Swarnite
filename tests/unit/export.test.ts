import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOM APIs needed by export.ts download helpers
const mockClick = vi.fn();
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // Mock createElement to return a controllable anchor
  vi.spyOn(document, 'createElement').mockReturnValue({
    href: '',
    download: '',
    click: mockClick,
  } as unknown as HTMLElement);

  // Mock URL APIs
  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;
});

// We can't easily test xlsx/jsPDF write operations in jsdom,
// so we focus on the data-flow helpers: CSV, HTML, Text export
// by importing the main dispatcher and verifying side-effects.

import { exportData } from '../../src/lib/export';

describe('exportData – CSV', () => {
  it('creates a CSV blob and triggers download', () => {
    exportData({
      filename: 'test-report',
      headers: ['Name', 'Amount'],
      data: [['Gold Ring', '45000'], ['Silver Chain', '12000']],
      format: 'csv',
    });

    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
    expect(mockClick).toHaveBeenCalledOnce();
    expect(mockRevokeObjectURL).toHaveBeenCalledOnce();
  });
});

describe('exportData – HTML', () => {
  it('creates an HTML blob and triggers download', () => {
    exportData({
      filename: 'test-html',
      title: 'Sales Report',
      headers: ['Item', 'Qty', 'Price'],
      data: [['Ring', '1', '50000']],
      format: 'html',
    });

    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
    expect(mockClick).toHaveBeenCalledOnce();
  });
});

describe('exportData – TXT', () => {
  it('creates a tab-delimited text file and triggers download', () => {
    exportData({
      filename: 'test-txt',
      headers: ['Col1', 'Col2'],
      data: [['A', 'B'], ['C', 'D']],
      format: 'txt',
    });

    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
    expect(mockClick).toHaveBeenCalledOnce();
  });
});
