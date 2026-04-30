// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Regression test for the post-save reset behaviour of RetailSalesEntry.
 *
 * Bug:
 *   After saving a sales voucher the VoucherPrintDialog opens (so the
 *   cashier can print or send the bill via WhatsApp). Closing that
 *   dialog used to leave the previous bill's customer and line items
 *   sitting in the form. The screen MUST be cleared so the next sale
 *   starts from a blank slate.
 */

// ── Router mock (RetailSalesEntry uses useLocation only) ──
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ state: null }),
}));

// ── API mocks ─────────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  salesAPI: {
    create: vi.fn(),
  },
  inventoryAPI: {
    searchLabel: vi.fn(),
  },
  accountsAPI: {
    list: vi.fn(),
    create: vi.fn(),
    gstSearch: vi.fn(),
  },
  mastersAPI: {
    salesmen: vi.fn(),
    latestRates: vi.fn(),
  },
}));

// ── react-hot-toast mock ──────────────────────────────────
vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

// ── Child component mocks ─────────────────────────────────
// Render VoucherPrintDialog as a tiny stub that exposes a Close button
// so the test can simulate the user dismissing the post-save window.
vi.mock('../../src/components/VoucherPrintDialog', () => ({
  default: ({ onClose }: { voucherId: number; onClose: () => void }) => (
    <div data-testid="mock-voucher-print-dialog">
      <button onClick={onClose}>Mock Close Dialog</button>
    </div>
  ),
}));

vi.mock('../../src/components/AccountMasterModal', () => ({
  default: () => null,
}));

vi.mock('../../src/components/OldGoldPurchaseModal', () => ({
  default: () => null,
}));

vi.mock('../../src/components/CustomerCategoryBadge', () => ({
  default: () => null,
}));

vi.mock('../../src/components/WhatsAppActions', () => ({
  WhatsAppDropdown: () => null,
}));

import { salesAPI, inventoryAPI, accountsAPI, mastersAPI } from '../../src/lib/api';
import RetailSalesEntry from '../../src/pages/Sales/RetailSalesEntry';

const mockCreate = salesAPI.create as ReturnType<typeof vi.fn>;
const mockSearchLabel = inventoryAPI.searchLabel as ReturnType<typeof vi.fn>;
const mockAccountsList = accountsAPI.list as ReturnType<typeof vi.fn>;
const mockSalesmen = mastersAPI.salesmen as ReturnType<typeof vi.fn>;
const mockLatestRates = mastersAPI.latestRates as ReturnType<typeof vi.fn>;

const CUSTOMER = {
  id: 42,
  name: 'Test Customer',
  mobile: '9876543210',
  closingBalance: 0,
  balanceType: 'NONE',
  customerTag: null,
};

const LABEL = {
  id: 1,
  labelNo: 'L-1',
  status: 'IN_STOCK',
  pcsCount: 1,
  grossWeight: 10,
  netWeight: 9,
  itemId: 1,
  item: {
    name: 'Test Ring',
    metalType: { name: 'GOLD' },
    purity: { code: '22K', percentage: 91.6 },
  },
};

const RATES = [
  { metalType: { name: 'GOLD' }, purityCode: '22K', rate: 6000 },
];

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

describe('RetailSalesEntry — post-save form reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSalesmen.mockResolvedValue({ data: [] });
    mockLatestRates.mockResolvedValue({ data: RATES });
    mockAccountsList.mockResolvedValue({ data: { accounts: [CUSTOMER] } });
    mockSearchLabel.mockResolvedValue({ data: LABEL });
    mockCreate.mockResolvedValue({ data: { id: 99, voucherNo: 'JGI/99' } });
  });

  it('clears customer and items when the post-save print/share window is closed', async () => {
    renderPage();

    // 1. Open the customer selection modal (F2 keyboard shortcut).
    fireEvent.keyDown(window, { key: 'F2' });

    // 2. Pick the test customer from the list.
    const customerRow = await screen.findByText('Test Customer');
    fireEvent.click(customerRow);

    // Customer is now bound to the voucher header.
    await waitFor(() => {
      expect(
        screen.getByText(/Sales Transaction For - Test Customer/i),
      ).toBeInTheDocument();
    });

    // 3. Scan a label to add a line item.
    const labelInput = screen.getByPlaceholderText('Scan label...');
    fireEvent.change(labelInput, { target: { value: 'L-1' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });

    // Wait until the item row appears in the items table.
    await waitFor(() => {
      expect(screen.getByText('Test Ring')).toBeInTheDocument();
    });

    // 4. Click Save.
    const saveBtn = screen.getByRole('button', { name: /Save/i });
    fireEvent.click(saveBtn);

    // 5. The print/share dialog auto-opens after a successful save.
    const dialog = await screen.findByTestId('mock-voucher-print-dialog');

    // 6. User closes the dialog (e.g. ✕ or Esc).
    fireEvent.click(within(dialog).getByText('Mock Close Dialog'));

    // 7. Form must be reset for the next entry.
    await waitFor(() => {
      // Customer name should no longer appear in the header.
      expect(
        screen.queryByText(/Sales Transaction For - Test Customer/i),
      ).not.toBeInTheDocument();

      // Item row should be gone — empty-state placeholder is shown again.
      expect(screen.queryByText('Test Ring')).not.toBeInTheDocument();
      expect(
        screen.getByText(/Scan a label or barcode to add items/i),
      ).toBeInTheDocument();

      // The print dialog itself should be unmounted.
      expect(
        screen.queryByTestId('mock-voucher-print-dialog'),
      ).not.toBeInTheDocument();
    });
  });
});
