// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── Mock api module ────────────────────────────────────────
const mockPurchaseList = vi.fn();
const mockPurchaseCreate = vi.fn();
const mockPurchaseCancel = vi.fn();
const mockAccountsList = vi.fn();
const mockPurities = vi.fn();

vi.mock('../../src/lib/api', () => ({
  purchaseAPI: {
    list: (params: any) => mockPurchaseList(params),
    create: (data: any) => mockPurchaseCreate(data),
    cancel: (id: number) => mockPurchaseCancel(id),
  },
  accountsAPI: {
    list: (params: any) => mockAccountsList(params),
  },
  mastersAPI: {
    purities: () => mockPurities(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import PurchaseURD from '../../src/pages/Purchase/PurchaseURD';

const DUMMY_VOUCHERS = [
  {
    id: 1, voucherNo: 'URD-2024-001', voucherDate: '2024-12-20',
    purchaseType: 'URD', description: null, group: null,
    totalGrossWeight: 10.5, totalNetWeight: 10.0, totalFineWeight: 9.16,
    metalAmount: 63960, totalAmount: 63960, finalAmount: 65877,
    status: 'ACTIVE', account: { id: 1, name: 'Gold Suppliers Inc' }, items: [],
  },
  {
    id: 2, voucherNo: 'URD-2024-002', voucherDate: '2024-12-21',
    purchaseType: 'URD', description: 'OLD GOLD', group: 'OGN',
    totalGrossWeight: 5.0, totalNetWeight: 4.8, totalFineWeight: 4.4,
    metalAmount: 30560, totalAmount: 30560, finalAmount: 31477,
    status: 'ACTIVE', account: { id: 2, name: 'Rajesh Kumar' }, items: [],
  },
  {
    id: 3, voucherNo: 'URD-2024-003', voucherDate: '2024-12-22',
    purchaseType: 'URD', description: null, group: null,
    totalGrossWeight: 20.0, totalNetWeight: 19.5, totalFineWeight: 17.86,
    metalAmount: 124070, totalAmount: 124070, finalAmount: 127792,
    status: 'CANCELLED', account: { id: 3, name: 'Silver Traders' }, items: [],
  },
];

function renderComponent() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  mockPurchaseList.mockResolvedValue({ data: { vouchers: DUMMY_VOUCHERS, total: 3 } });
  mockPurities.mockResolvedValue({ data: [{ id: 1, code: '22KT', percentage: 91.6 }] });
  mockAccountsList.mockResolvedValue({ data: { accounts: [] } });

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PurchaseURD />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PurchaseURD', () => {
  describe('List View (default)', () => {
    it('renders list view by default with header', async () => {
      renderComponent();
      expect(screen.getByText('Purchase Vouchers')).toBeDefined();
    });

    it('shows New URD Purchase and New Old Gold Purchase buttons', () => {
      renderComponent();
      expect(screen.getByText('+ New URD Purchase')).toBeDefined();
      expect(screen.getByText('+ New Old Gold Purchase')).toBeDefined();
    });

    it('shows date filter inputs', () => {
      renderComponent();
      const labels = screen.getAllByText('From Date');
      expect(labels.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('To Date')).toBeDefined();
    });

    it('shows type filter dropdown', () => {
      renderComponent();
      const labels = screen.getAllByText('Type');
      expect(labels.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByDisplayValue('All')).toBeDefined();
    });

    it('renders purchase list table with correct columns', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Voucher No')).toBeDefined();
        expect(screen.getByText('Supplier/Customer')).toBeDefined();
      });
    });

    it('displays voucher data in the table', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('URD-2024-001')).toBeDefined();
        expect(screen.getByText('Gold Suppliers Inc')).toBeDefined();
      });
    });

    it('shows Old Gold badge for vouchers with description OLD GOLD', async () => {
      renderComponent();
      await waitFor(() => {
        const badges = screen.getAllByText('Old Gold');
        expect(badges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows URD badge for regular URD vouchers', async () => {
      renderComponent();
      await waitFor(() => {
        const badges = screen.getAllByText('URD');
        expect(badges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('calls purchaseAPI.list with date params', async () => {
      renderComponent();
      await waitFor(() => {
        expect(mockPurchaseList).toHaveBeenCalledWith(
          expect.objectContaining({ dateFrom: expect.any(String), dateTo: expect.any(String) }),
        );
      });
    });
  });

  describe('Navigation to Form', () => {
    it('switches to form view when New URD Purchase is clicked', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.click(screen.getByText('+ New URD Purchase'));
      await waitFor(() => {
        expect(screen.getByText('Purchase (URD)')).toBeDefined();
      });
    });

    it('switches to form view with Old Gold type when New Old Gold Purchase is clicked', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.click(screen.getByText('+ New Old Gold Purchase'));
      await waitFor(() => {
        expect(screen.getByText('Purchase (Old Gold)')).toBeDefined();
      });
    });

    it('shows Back to List button in form view', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.click(screen.getByText('+ New URD Purchase'));
      await waitFor(() => {
        expect(screen.getByText('← Back to List')).toBeDefined();
      });
    });

    it('returns to list view when Back to List is clicked', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.click(screen.getByText('+ New URD Purchase'));
      await waitFor(() => {
        expect(screen.getByText('← Back to List')).toBeDefined();
      });
      await user.click(screen.getByText('← Back to List'));
      await waitFor(() => {
        expect(screen.getByText('Purchase Vouchers')).toBeDefined();
      });
    });
  });

  describe('Form View', () => {
    it('shows purchase type toggle buttons', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.click(screen.getByText('+ New URD Purchase'));
      await waitFor(() => {
        expect(screen.getByText('URD Purchase')).toBeDefined();
        expect(screen.getByText('Old Gold Purchase')).toBeDefined();
      });
    });

    it('shows Save and Clear buttons', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.click(screen.getByText('+ New URD Purchase'));
      await waitFor(() => {
        expect(screen.getByText(/Save/)).toBeDefined();
        expect(screen.getByText('Clear')).toBeDefined();
      });
    });

    it('shows payment fields (Sub Total, Voucher Amt, Cash Paid, Bank Paid)', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.click(screen.getByText('+ New URD Purchase'));
      await waitFor(() => {
        expect(screen.getByText('Sub Total')).toBeDefined();
        expect(screen.getByText('Voucher Amt')).toBeDefined();
        expect(screen.getByText('Cash Paid')).toBeDefined();
        expect(screen.getByText('Bank Paid')).toBeDefined();
      });
    });
  });

  describe('Cancel Voucher', () => {
    it('shows cancel button for active vouchers', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('URD-2024-001')).toBeDefined();
      });
      // Active vouchers should have cancel buttons
      const cancelButtons = screen.getAllByTitle('Cancel voucher');
      expect(cancelButtons.length).toBeGreaterThanOrEqual(1);
    });
  });
});
