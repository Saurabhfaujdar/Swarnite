// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * LayawayList — print button parity with sales voucher list.
 *
 * Each row should expose a 🖨️ print button. Clicking it must mount
 * VoucherPrintDialog in `mode="layaway"`, which loads the entry via
 * `layawayAPI.get` (NOT `salesAPI.get`).
 */

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// vi.mock is hoisted above any const declarations, so use vi.hoisted
// to share these stubs with the mock factory.
const { mockList, mockGet, mockSalesGet } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockGet: vi.fn(),
  mockSalesGet: vi.fn(),
}));

vi.mock('../../src/lib/api', () => ({
  layawayAPI: {
    list: (...a: any[]) => mockList(...a),
    get: (...a: any[]) => mockGet(...a),
    cancel: vi.fn(),
  },
  salesAPI: {
    get: (...a: any[]) => mockSalesGet(...a),
  },
  mastersAPI: {
    salesmen: vi.fn().mockResolvedValue({ data: [] }),
  },
  filesAPI: { list: vi.fn().mockResolvedValue({ data: [] }) },
}));

vi.mock('react-hot-toast', () => {
  const t = vi.fn() as any;
  t.success = vi.fn();
  t.error = vi.fn();
  return { default: t };
});

// FileAttachments pulls in upload machinery — stub it.
vi.mock('../../src/components/FileAttachments', () => ({
  default: () => <div data-testid="file-attachments-stub" />,
}));

import LayawayList from '../../src/pages/Layaway/LayawayList';

const ENTRY = {
  id: 42,
  voucherNo: 'LY/42',
  voucherDate: '2026-04-20',
  voucherAmount: 25000,
  paymentAmount: 5000,
  status: 'ACTIVE',
  pricingModel: 'FLOATING',
  account: { id: 1, name: 'Asha Kumari', mobile: '9876543210' },
};

const FULL_ENTRY = {
  ...ENTRY,
  taxableAmount: 24000,
  cgstAmount: 360,
  sgstAmount: 360,
  cashAmount: 5000, bankAmount: 0, cardAmount: 0, upiAmount: 0,
  oldGoldAmount: 0, dueAmount: 20000, discountAmount: 0,
  items: [{
    id: 1, itemName: 'Gold Ring', pcs: 1,
    grossWeight: 5, netWeight: 5, metalRate: 5000, totalAmount: 25000,
    item: { hsnCode: '711311', purity: { name: '22K' } },
  }],
};

function renderList() {
  mockList.mockResolvedValue({ data: { entries: [ENTRY], totalAmount: 25000 } });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LayawayList />
    </QueryClientProvider>,
  );
}

describe('LayawayList — print button + dialog', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockGet.mockReset();
    mockSalesGet.mockReset();
  });

  it('renders a print button per row', async () => {
    renderList();
    expect(await screen.findByTestId('print-layaway-42')).toBeInTheDocument();
  });

  it('does not mount the print dialog until the print button is clicked', async () => {
    renderList();
    await screen.findByTestId('print-layaway-42');
    // Dialog title is unique to the print modal.
    expect(screen.queryByText(/Layaway Print/i)).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('opens the print dialog and fetches the layaway (not the sales voucher) when clicked', async () => {
    mockGet.mockResolvedValue({ data: FULL_ENTRY });
    renderList();

    const btn = await screen.findByTestId('print-layaway-42');
    fireEvent.click(btn);

    // Dialog shown
    await waitFor(() => expect(screen.getByText(/Layaway Print/i)).toBeInTheDocument());
    // Loaded via layawayAPI.get with the row id
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(42));
    // And NOT via salesAPI.get
    expect(mockSalesGet).not.toHaveBeenCalled();

    // Banner inside the dialog shows the LY/42 number once the
    // query resolves. The list table behind the modal already
    // contains LY/42 too, so we assert at least one match exists
    // (a stricter `findByText` would throw on duplicates).
    await waitFor(
      () => expect(screen.getAllByText('LY/42').length).toBeGreaterThanOrEqual(2),
      { timeout: 3000 },
    );
  });

  it('does not navigate to the detail page when the print button is clicked (stopPropagation)', async () => {
    mockGet.mockResolvedValue({ data: FULL_ENTRY });
    renderList();

    const btn = await screen.findByTestId('print-layaway-42');
    fireEvent.click(btn);

    // The row's onClick selects the row; stopPropagation should prevent that.
    // The cancel button stays disabled because no row was selected.
    const cancelBtn = screen.getByRole('button', { name: /Cancel Layaway/i });
    expect(cancelBtn).toBeDisabled();
  });
});
