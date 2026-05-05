// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * NEW behaviour for Sales Entry:
 *   When a cashier scans a label whose underlying piece is currently
 *   held by an active layaway, instead of erroring out with
 *   "Label X is not in stock (LAYAWAY)", the page should fetch that
 *   layaway and load it into the form so the sale can be finalised
 *   as a layaway conversion in the usual way.
 *
 *   The label-search API surfaces the active booking via an
 *   `activeLayaway: { id, voucherNo, status }` field — see
 *   server/routes/inventory.ts.
 */

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ state: null }),
}));

vi.mock('../../src/lib/api', () => ({
  salesAPI: { create: vi.fn() },
  inventoryAPI: { searchLabel: vi.fn() },
  accountsAPI: { list: vi.fn(), create: vi.fn(), gstSearch: vi.fn() },
  mastersAPI: { salesmen: vi.fn(), latestRates: vi.fn() },
  layawayAPI: { byVoucherNo: vi.fn(), get: vi.fn(), convert: vi.fn() },
}));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

vi.mock('../../src/components/VoucherPrintDialog', () => ({
  default: () => null,
}));
vi.mock('../../src/components/AccountMasterModal', () => ({ default: () => null }));
vi.mock('../../src/components/OldGoldPurchaseModal', () => ({ default: () => null }));
vi.mock('../../src/components/CustomerCategoryBadge', () => ({ default: () => null }));
vi.mock('../../src/components/WhatsAppActions', () => ({ WhatsAppDropdown: () => null }));

import { inventoryAPI, mastersAPI, layawayAPI } from '../../src/lib/api';
import RetailSalesEntry from '../../src/pages/Sales/RetailSalesEntry';
import toast from 'react-hot-toast';

const mockSearchLabel = inventoryAPI.searchLabel as ReturnType<typeof vi.fn>;
const mockGetLayaway = layawayAPI.get as ReturnType<typeof vi.fn>;
const mockByVoucherNo = layawayAPI.byVoucherNo as ReturnType<typeof vi.fn>;
const mockSalesmen = mastersAPI.salesmen as ReturnType<typeof vi.fn>;
const mockLatestRates = mastersAPI.latestRates as ReturnType<typeof vi.fn>;
const mockToastError = toast.error as ReturnType<typeof vi.fn>;
const mockToastSuccess = toast.success as ReturnType<typeof vi.fn>;

const LABEL_ON_LAYAWAY = {
  id: 100,
  labelNo: 'GN/77',
  status: 'LAYAWAY',
  pcsCount: 1,
  grossWeight: 22.5,
  netWeight: 21.0,
  itemId: 1,
  item: { name: 'Gold Necklace 22K', purity: { code: '916', percentage: 91.6 }, metalType: { name: 'Gold' } },
  activeLayaway: { id: 5, voucherNo: 'LY/5', status: 'ACTIVE' },
};

const LAYAWAY_PAYLOAD = {
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

describe('RetailSalesEntry — scanning a label held by an active layaway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSalesmen.mockResolvedValue({ data: [] });
    mockLatestRates.mockResolvedValue({ data: [] });
  });

  it('auto-loads the active layaway instead of erroring "not in stock"', async () => {
    mockSearchLabel.mockResolvedValueOnce({ data: LABEL_ON_LAYAWAY });
    mockGetLayaway.mockResolvedValueOnce({ data: LAYAWAY_PAYLOAD });

    renderPage();

    const labelInput = screen.getByPlaceholderText('Scan label...');
    fireEvent.change(labelInput, { target: { value: 'GN/77' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockGetLayaway).toHaveBeenCalledWith(5);
    });

    // Banner / customer / item should now reflect the loaded layaway.
    expect(
      await screen.findByText(/Sales Transaction For - Smt\. Priya Jain/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Gold Necklace 22K')).toBeInTheDocument();
    expect(screen.getByTestId('layaway-banner')).toHaveTextContent('Loaded from Layaway LY/5');
    expect(screen.getByRole('button', { name: /Convert & Save/i })).toBeInTheDocument();

    // The old "not in stock" error must NOT have been shown.
    expect(mockToastError).not.toHaveBeenCalledWith(
      expect.stringMatching(/not in stock/i),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/LY\/5.*GN\/77|GN\/77.*LY\/5/),
    );

    // We did not fall back to the voucher-prefix path - the label
    // search itself returned the activeLayaway link.
    expect(mockByVoucherNo).not.toHaveBeenCalled();
  });

  it('shows an error toast when the active layaway lookup fails', async () => {
    mockSearchLabel.mockResolvedValueOnce({ data: LABEL_ON_LAYAWAY });
    mockGetLayaway.mockRejectedValueOnce({ response: { status: 500 } });

    renderPage();

    const labelInput = screen.getByPlaceholderText('Scan label...');
    fireEvent.change(labelInput, { target: { value: 'GN/77' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/Could not load layaway LY\/5/),
      );
    });
    expect(screen.queryByTestId('layaway-banner')).not.toBeInTheDocument();
  });

  it('still rejects labels in non-IN_STOCK states that are not on layaway (e.g. SOLD)', async () => {
    mockSearchLabel.mockResolvedValueOnce({
      data: { ...LABEL_ON_LAYAWAY, status: 'SOLD', activeLayaway: null },
    });

    renderPage();

    const labelInput = screen.getByPlaceholderText('Scan label...');
    fireEvent.change(labelInput, { target: { value: 'GN/77' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/not in stock \(SOLD\)/),
      );
    });
    expect(mockGetLayaway).not.toHaveBeenCalled();
  });
});
