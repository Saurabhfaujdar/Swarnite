// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Tests for the "load layaway into Sales Entry" workflow.
 *
 * UX:
 *   1. Cashier types a layaway voucher number (e.g. "LY/5") into the
 *      Sales Entry bar-code field.
 *   2. App detects the layaway prefix, calls layawayAPI.byVoucherNo(),
 *      and prefills customer + items.
 *   3. A banner appears explaining the form is in conversion mode and
 *      the Save button is relabelled "Convert & Save".
 *   4. Pressing Save calls layawayAPI.convert() instead of
 *      salesAPI.create(), passing the cashier-entered final payment
 *      amount + mode.
 *   5. The returned saleVoucherId opens the post-save print dialog.
 *   6. Closing the dialog clears the form (covered by the existing
 *      reset regression test).
 */

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ state: null }),
}));

vi.mock('../../src/lib/api', () => ({
  salesAPI: { create: vi.fn() },
  inventoryAPI: { searchLabel: vi.fn() },
  accountsAPI: { list: vi.fn(), create: vi.fn(), gstSearch: vi.fn() },
  mastersAPI: { salesmen: vi.fn(), latestRates: vi.fn() },
  layawayAPI: { byVoucherNo: vi.fn(), convert: vi.fn() },
}));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

vi.mock('../../src/components/VoucherPrintDialog', () => ({
  default: ({ voucherId, onClose }: { voucherId: number; onClose: () => void }) => (
    <div data-testid="mock-voucher-print-dialog" data-voucher-id={voucherId}>
      <button onClick={onClose}>Mock Close Dialog</button>
    </div>
  ),
}));

vi.mock('../../src/components/AccountMasterModal', () => ({ default: () => null }));
vi.mock('../../src/components/OldGoldPurchaseModal', () => ({ default: () => null }));
vi.mock('../../src/components/CustomerCategoryBadge', () => ({ default: () => null }));
vi.mock('../../src/components/WhatsAppActions', () => ({ WhatsAppDropdown: () => null }));

import { salesAPI, inventoryAPI, mastersAPI, layawayAPI } from '../../src/lib/api';
import RetailSalesEntry from '../../src/pages/Sales/RetailSalesEntry';
import toast from 'react-hot-toast';

const mockByVoucherNo = layawayAPI.byVoucherNo as ReturnType<typeof vi.fn>;
const mockConvert = layawayAPI.convert as ReturnType<typeof vi.fn>;
const mockSearchLabel = inventoryAPI.searchLabel as ReturnType<typeof vi.fn>;
const mockSalesCreate = salesAPI.create as ReturnType<typeof vi.fn>;
const mockSalesmen = mastersAPI.salesmen as ReturnType<typeof vi.fn>;
const mockLatestRates = mastersAPI.latestRates as ReturnType<typeof vi.fn>;
const mockToastError = toast.error as ReturnType<typeof vi.fn>;

const LAYAWAY = {
  id: 5,
  voucherNo: 'LY/5',
  status: 'ACTIVE',
  voucherAmount: 1396916,
  paymentAmount: 0,
  account: {
    id: 42,
    name: 'Smt. Priya Jain',
    mobile: '9876543212',
    closingBalance: 0,
    balanceType: 'NONE',
    customerTag: null,
  },
  items: [
    {
      id: 11,
      labelId: 100,
      itemId: 1,
      labelNo: 'GN/77',
      itemName: 'Gold Necklace 22K',
      grossWeight: 22.5,
      netWeight: 21.0,
      fineWeight: 19.236,
      pcs: 1,
      metalRate: 6000,
      metalAmount: 115416,
      diamondWeight: 0,
      labourRate: 750,
      labourAmount: 15750,
      otherCharge: 0,
      discountAmt: 0,
      totalAmount: 131166,
      taxableAmount: 131166,
      label: { pcsCount: 1 },
    },
  ],
};

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <RetailSalesEntry />
    </QueryClientProvider>,
  );
}

async function loadLayawayInForm() {
  mockByVoucherNo.mockResolvedValueOnce({ data: LAYAWAY });

  const labelInput = screen.getByPlaceholderText('Scan label...');
  fireEvent.change(labelInput, { target: { value: 'LY/5' } });
  fireEvent.keyDown(labelInput, { key: 'Enter' });

  await waitFor(() => {
    expect(mockByVoucherNo).toHaveBeenCalledWith('LY/5');
  });
}

describe('RetailSalesEntry — layaway load & convert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSalesmen.mockResolvedValue({ data: [] });
    mockLatestRates.mockResolvedValue({ data: [] });
  });

  it('loads a layaway by voucher number and prefills customer + items', async () => {
    renderPage();
    await loadLayawayInForm();

    // Customer header reflects the layaway customer.
    expect(
      await screen.findByText(/Sales Transaction For - Smt\. Priya Jain/i),
    ).toBeInTheDocument();

    // Item row from the layaway is rendered.
    expect(screen.getByText('Gold Necklace 22K')).toBeInTheDocument();
    expect(screen.getByText('GN/77')).toBeInTheDocument();

    // Banner appears explaining the conversion mode.
    const banner = screen.getByTestId('layaway-banner');
    expect(banner).toHaveTextContent('Loaded from Layaway LY/5');

    // Save button is relabelled.
    expect(
      screen.getByRole('button', { name: /Convert & Save/i }),
    ).toBeInTheDocument();
  });

  it('shows an error and does not change form state for an unknown voucher', async () => {
    mockByVoucherNo.mockRejectedValueOnce({ response: { status: 404 } });
    renderPage();

    const labelInput = screen.getByPlaceholderText('Scan label...');
    fireEvent.change(labelInput, { target: { value: 'LY/999' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Layaway LY/999 not found');
    });
    expect(screen.queryByTestId('layaway-banner')).not.toBeInTheDocument();
  });

  it('refuses to convert layaways that are CANCELLED / CONVERTED / EXPIRED', async () => {
    mockByVoucherNo.mockResolvedValueOnce({
      data: { ...LAYAWAY, status: 'CANCELLED' },
    });
    renderPage();

    const labelInput = screen.getByPlaceholderText('Scan label...');
    fireEvent.change(labelInput, { target: { value: 'LY/5' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/CANCELLED.*cannot be converted/),
      );
    });
    expect(screen.queryByTestId('layaway-banner')).not.toBeInTheDocument();
  });

  it('blocks scanning new labels while a layaway is loaded', async () => {
    renderPage();
    await loadLayawayInForm();
    await screen.findByTestId('layaway-banner');

    const labelInput = screen.getByPlaceholderText('Scan label...');
    fireEvent.change(labelInput, { target: { value: 'GN/99' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Clear the loaded layaway before scanning new items',
      );
    });
    // Label search must not have been attempted while locked.
    expect(mockSearchLabel).not.toHaveBeenCalled();
  });

  it('Save calls layawayAPI.convert (not salesAPI.create) and opens the print dialog', async () => {
    mockConvert.mockResolvedValueOnce({
      data: { saleVoucherNo: 'LY/5', saleVoucherId: 555 },
    });

    renderPage();
    await loadLayawayInForm();
    await screen.findByTestId('layaway-banner');

    // Cashier records the final payment in cash via the F10 shortcut
    // (which dumps the full voucher amount into the cash bucket).
    fireEvent.keyDown(window, { key: 'F10' });

    fireEvent.click(screen.getByRole('button', { name: /Convert & Save/i }));

    await waitFor(() => {
      expect(mockConvert).toHaveBeenCalledTimes(1);
    });
    expect(mockSalesCreate).not.toHaveBeenCalled();

    const [calledId, calledData] = mockConvert.mock.calls[0];
    expect(calledId).toBe(5);
    expect(calledData.finalPaymentMode).toBe('Cash');
    expect(calledData.finalPaymentAmount).toBeGreaterThan(0);

    // Print dialog opens against the new sale voucher id.
    const dialog = await screen.findByTestId('mock-voucher-print-dialog');
    expect(dialog.getAttribute('data-voucher-id')).toBe('555');
  });

  it('Clear Layaway button removes the loaded booking', async () => {
    renderPage();
    await loadLayawayInForm();
    const banner = await screen.findByTestId('layaway-banner');

    fireEvent.click(within(banner).getByRole('button', { name: /Clear Layaway/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('layaway-banner')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Gold Necklace 22K')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Sales Transaction For - Smt\. Priya Jain/i),
    ).not.toBeInTheDocument();
  });
});
