// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mock api module ────────────────────────────────────────
const mockHistory = vi.fn();
const mockAccountsList = vi.fn();
vi.mock('../../src/lib/api', () => ({
  accountsAPI: {
    history: (id: number) => mockHistory(id),
    list: (params?: any) => mockAccountsList(params),
    get: vi.fn(),
    ledger: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    outstanding: vi.fn(),
    gstSearch: vi.fn(),
  },
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import AccountMasterModal from '../../src/components/AccountMasterModal';

const MOCK_HISTORY = {
  sales: [
    {
      id: 1, voucherNo: 'JGI/1001', voucherDate: '2025-01-15T00:00:00Z',
      totalGrossWeight: '25.500', totalNetWeight: '24.000', totalPcs: 3,
      metalAmount: '150000', labourAmount: '5000', voucherAmount: '165000',
      paymentAmount: '100000', dueAmount: '65000', oldGoldAmount: '20000',
      cashAmount: '50000', bankAmount: '50000', cardAmount: '0', upiAmount: '0',
      status: 'ACTIVE',
      salesman: { name: 'Ramesh' },
      items: [
        { id: 1, labelNo: 'LBL001', itemName: 'Gold Necklace', grossWeight: '15.000', netWeight: '14.500', pcs: 1, metalRate: '6950', metalAmount: '100750', labourAmount: '3000', totalAmount: '103750' },
        { id: 2, labelNo: 'LBL002', itemName: 'Gold Ring', grossWeight: '5.500', netWeight: '5.000', pcs: 1, metalRate: '6950', metalAmount: '34750', labourAmount: '1000', totalAmount: '35750' },
        { id: 3, labelNo: 'LBL003', itemName: 'Gold Earrings', grossWeight: '5.000', netWeight: '4.500', pcs: 1, metalRate: '6950', metalAmount: '31275', labourAmount: '1000', totalAmount: '32275' },
      ],
    },
    {
      id: 2, voucherNo: 'JGI/1002', voucherDate: '2025-02-10T00:00:00Z',
      totalGrossWeight: '10.000', totalNetWeight: '9.500', totalPcs: 1,
      metalAmount: '66025', labourAmount: '2000', voucherAmount: '72000',
      paymentAmount: '72000', dueAmount: '0', oldGoldAmount: '0',
      cashAmount: '72000', bankAmount: '0', cardAmount: '0', upiAmount: '0',
      status: 'ACTIVE',
      salesman: null,
      items: [
        { id: 4, labelNo: 'LBL004', itemName: 'Gold Bangle', grossWeight: '10.000', netWeight: '9.500', pcs: 1, metalRate: '6950', metalAmount: '66025', labourAmount: '2000', totalAmount: '72000' },
      ],
    },
  ],
  oldGoldPurchases: [
    {
      id: 10, voucherNo: 'OG/501', voucherDate: '2025-01-15T00:00:00Z',
      totalGrossWeight: '8.000', totalNetWeight: '7.500', totalFineWeight: '6.870',
      totalPcs: 2, metalRate: '6800', metalAmount: '46716',
      totalAmount: '46716', finalAmount: '46716',
      items: [
        { id: 20, styleName: 'Old Chain', weight: '5.000', pcs: 1, rate: '6800', amount: '30940' },
        { id: 21, styleName: 'Old Ring', weight: '3.000', pcs: 1, rate: '6800', amount: '15776' },
      ],
    },
  ],
  layaways: [
    {
      id: 100, voucherNo: 'LY/201', voucherDate: '2025-03-01T00:00:00Z',
      totalGrossWeight: '12.000', totalNetWeight: '11.500', totalPcs: 2,
      metalAmount: '79925', labourAmount: '3000', voucherAmount: '88000',
      paymentAmount: '30000', dueAmount: '58000', status: 'ACTIVE',
    },
  ],
  summary: {
    totalSalesCount: 2,
    totalSalesAmount: 237000,
    totalOldGoldInSales: 20000,
    totalOGPurchaseCount: 1,
    totalOGPurchaseAmount: 46716,
    totalLayawayCount: 1,
  },
};

function renderModal(editData?: any) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return {
    ...render(
      <QueryClientProvider client={qc}>
        <AccountMasterModal
          open={true}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          editData={editData}
        />
      </QueryClientProvider>,
    ),
    qc,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAccountsList.mockResolvedValue({ data: [] });
});

describe('AccountMasterModal – Sales & OG History Tab', () => {
  it('does not show History tab when creating new account (no editData)', () => {
    renderModal();
    expect(screen.queryByText('Sales & OG History')).not.toBeInTheDocument();
  });

  it('shows History tab when editing existing account', () => {
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });
    expect(screen.getByText('Sales & OG History')).toBeInTheDocument();
  });

  it('shows loading state when history tab is clicked', async () => {
    mockHistory.mockReturnValue(new Promise(() => {})); // never resolves
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));
    await waitFor(() => {
      expect(screen.getByText('Loading history...')).toBeInTheDocument();
    });
  });

  it('fetches history for the correct account id', async () => {
    mockHistory.mockResolvedValue({ data: MOCK_HISTORY });
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));
    await waitFor(() => {
      expect(mockHistory).toHaveBeenCalledWith(42);
    });
  });

  it('renders summary cards with correct counts and amounts', async () => {
    mockHistory.mockResolvedValue({ data: MOCK_HISTORY });
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));

    await waitFor(() => {
      expect(screen.getByText('Total Sales')).toBeInTheDocument();
    });
    // Check the summary card labels are rendered
    expect(screen.getAllByText('Old Gold Purchases').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Layaways').length).toBeGreaterThanOrEqual(1);
    // Check the summary cards parent container has the data
    const salesLabel = screen.getByText('Total Sales');
    // Navigate up to the card container (bg-blue-50)
    const salesCard = salesLabel.parentElement!;
    expect(salesCard.textContent).toContain('Total Sales');
    // Verify the sales count appears in the card
    expect(salesCard.querySelector('.text-lg')!.textContent).toBe('2');
    const ogCards = screen.getAllByText('Old Gold Purchases');
    const ogSummaryLabel = ogCards.find(el => el.className.includes('text-xs'))!;
    const ogCard = ogSummaryLabel.parentElement!;
    expect(ogCard.querySelector('.text-lg')!.textContent).toBe('1');
  });

  it('renders sales voucher rows', async () => {
    mockHistory.mockResolvedValue({ data: MOCK_HISTORY });
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));

    await waitFor(() => {
      expect(screen.getByText('JGI/1001')).toBeInTheDocument();
    });
    expect(screen.getByText('JGI/1002')).toBeInTheDocument();
    expect(screen.getByText('Sales Vouchers')).toBeInTheDocument();
  });

  it('shows old gold amount in sales rows when > 0', async () => {
    mockHistory.mockResolvedValue({ data: MOCK_HISTORY });
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));

    await waitFor(() => {
      expect(screen.getByText('JGI/1001')).toBeInTheDocument();
    });
    // Find the row for JGI/1001 and check it has old gold amount
    const row = screen.getByText('JGI/1001').closest('tr');
    expect(row).toBeTruthy();
    // Old gold column should show ₹20,000 for the first row
    expect(row!.textContent).toContain('20,000');
  });

  it('shows dash for old gold when amount is 0', async () => {
    mockHistory.mockResolvedValue({ data: MOCK_HISTORY });
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));

    await waitFor(() => {
      expect(screen.getByText('JGI/1002')).toBeInTheDocument();
    });
    const row = screen.getByText('JGI/1002').closest('tr');
    // The old gold cell in the second row should show '-'
    const cells = row!.querySelectorAll('td');
    // Old gold column is the 5th (index 4)
    expect(cells[4].textContent).toBe('-');
  });

  it('renders old gold purchase rows', async () => {
    mockHistory.mockResolvedValue({ data: MOCK_HISTORY });
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));

    await waitFor(() => {
      expect(screen.getByText('OG/501')).toBeInTheDocument();
    });
    expect(screen.getByText('Old Gold Purchases', { selector: 'h4' })).toBeInTheDocument();
  });

  it('renders layaway rows with status badge', async () => {
    mockHistory.mockResolvedValue({ data: MOCK_HISTORY });
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));

    await waitFor(() => {
      expect(screen.getByText('LY/201')).toBeInTheDocument();
    });
    expect(screen.getByText('Layaways', { selector: 'h4' })).toBeInTheDocument();
    // Status badge
    const badge = screen.getByText('ACTIVE');
    expect(badge.className).toContain('bg-blue-100');
  });

  it('shows "No transaction history found" when all arrays are empty', async () => {
    mockHistory.mockResolvedValue({
      data: {
        sales: [],
        oldGoldPurchases: [],
        layaways: [],
        summary: {
          totalSalesCount: 0,
          totalSalesAmount: 0,
          totalOldGoldInSales: 0,
          totalOGPurchaseCount: 0,
          totalOGPurchaseAmount: 0,
          totalLayawayCount: 0,
        },
      },
    });
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));

    await waitFor(() => {
      expect(screen.getByText('No transaction history found')).toBeInTheDocument();
    });
  });

  it('shows error state when API fails', async () => {
    mockHistory.mockRejectedValue(new Error('Network error'));
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));

    await waitFor(() => {
      expect(screen.getByText('Failed to load history')).toBeInTheDocument();
    });
  });

  it('does not fetch history until tab is clicked', () => {
    mockHistory.mockResolvedValue({ data: MOCK_HISTORY });
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    // History tab exists but not clicked yet
    expect(screen.getByText('Sales & OG History')).toBeInTheDocument();
    expect(mockHistory).not.toHaveBeenCalled();
  });

  it('renders due amount in red when > 0', async () => {
    mockHistory.mockResolvedValue({ data: MOCK_HISTORY });
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));

    await waitFor(() => {
      expect(screen.getByText('JGI/1001')).toBeInTheDocument();
    });
    const row = screen.getByText('JGI/1001').closest('tr');
    const cells = row!.querySelectorAll('td');
    // Due column is 7th (index 6)
    expect(cells[6].className).toContain('text-red-600');
    expect(cells[6].textContent).toContain('65,000');
  });

  it('shows dash for due amount when 0', async () => {
    mockHistory.mockResolvedValue({ data: MOCK_HISTORY });
    renderModal({ id: 42, name: 'Test Customer', type: 'CUSTOMER' });

    await userEvent.click(screen.getByText('Sales & OG History'));

    await waitFor(() => {
      expect(screen.getByText('JGI/1002')).toBeInTheDocument();
    });
    const row = screen.getByText('JGI/1002').closest('tr');
    const cells = row!.querySelectorAll('td');
    expect(cells[6].textContent).toBe('-');
  });
});
