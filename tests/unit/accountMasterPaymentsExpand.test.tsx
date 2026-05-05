// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Tests for the Payments tab inside AccountMasterModal.
 *
 * Background: the standalone Customer Payments page consolidates
 * scheme installments into a single expandable parent row. The Payments
 * tab inside the customer modal must offer the same UX — clicking the
 * consolidated row toggles the per-installment children.
 */

vi.mock('../../src/lib/api', () => ({
  accountsAPI: {
    create: vi.fn(),
    update: vi.fn(),
    gstSearch: vi.fn(),
    history: vi.fn(),
  },
  customerPaymentsAPI: {
    list: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

vi.mock('../../src/components/CustomerCategoryBadge', () => ({ default: () => null }));
vi.mock('../../src/components/WhatsAppActions', () => ({ WhatsAppPanel: () => null }));

import { customerPaymentsAPI } from '../../src/lib/api';
import AccountMasterModal from '../../src/components/AccountMasterModal';

const mockListPayments = customerPaymentsAPI.list as ReturnType<typeof vi.fn>;

const ACCOUNT = {
  id: 42,
  name: 'Smt. Kamala Devi',
  type: 'CUSTOMER',
  groupHead: 'Sundry Debtors',
  customerCategory: 'Normal',
  closingBalance: 0,
  balanceType: 'NONE',
};

const SCHEME_CONSOLIDATED = {
  id: 'scheme-7',
  source: 'SCHEME',
  receiptNo: 'SS/5',
  paymentDate: '2026-05-02T00:00:00.000Z',
  paymentType: 'ADVANCE',
  cashAmount: 24000,
  bankAmount: 0,
  cardAmount: 0,
  upiAmount: 0,
  totalAmount: 24000,
  balanceBefore: 0,
  balanceAfter: 0,
  status: 'ACTIVE',
  account: ACCOUNT,
  isConsolidated: true,
  schemeId: 7,
  schemeStatus: 'CANCELLED',
  installmentCount: 2,
  children: [
    {
      id: 101,
      installmentNo: 1,
      paymentDate: '2026-05-02T00:00:00.000Z',
      narration: 'Scheme SS/5 installment #1',
      cashAmount: 12000,
      bankAmount: 0,
      cardAmount: 0,
      upiAmount: 0,
      totalAmount: 12000,
    },
    {
      id: 102,
      installmentNo: 2,
      paymentDate: '2026-05-02T00:00:00.000Z',
      narration: 'Scheme SS/5 installment #2',
      cashAmount: 12000,
      bankAmount: 0,
      cardAmount: 0,
      upiAmount: 0,
      totalAmount: 12000,
    },
  ],
};

const PLAIN_PAYMENT = {
  id: 200,
  source: 'PAYMENT',
  receiptNo: 'PAY/9',
  paymentDate: '2026-05-02T00:00:00.000Z',
  paymentType: 'ADVANCE',
  cashAmount: 5000,
  bankAmount: 0,
  cardAmount: 0,
  upiAmount: 0,
  totalAmount: 5000,
  balanceBefore: 0,
  balanceAfter: -5000,
  status: 'ACTIVE',
  account: ACCOUNT,
};

function renderModal() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AccountMasterModal open={true} onClose={vi.fn()} editData={ACCOUNT} />
    </QueryClientProvider>,
  );
}

describe('AccountMasterModal — Payments tab consolidated scheme rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPayments.mockResolvedValue({
      data: { payments: [SCHEME_CONSOLIDATED, PLAIN_PAYMENT] },
    });
  });

  it('renders a consolidated scheme row for SS/5 with the (n inst.) badge', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Payments'));

    const row = await screen.findByTestId('modal-scheme-consolidated-7');
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent('SS/5');
    expect(row).toHaveTextContent(/2\s*inst\./);
    expect(row).toHaveTextContent('CANCELLED');
  });

  it('does NOT show installment children rows by default (collapsed state)', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Payments'));
    await screen.findByTestId('modal-scheme-consolidated-7');

    expect(screen.queryByTestId('modal-scheme-child-7-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('modal-scheme-child-7-2')).not.toBeInTheDocument();
  });

  it('expands installment rows when the consolidated row is clicked', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Payments'));

    const row = await screen.findByTestId('modal-scheme-consolidated-7');
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId('modal-scheme-child-7-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('modal-scheme-child-7-2')).toBeInTheDocument();
  });

  it('collapses installment rows when the consolidated row is clicked a second time', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Payments'));

    const row = await screen.findByTestId('modal-scheme-consolidated-7');
    fireEvent.click(row); // expand
    await screen.findByTestId('modal-scheme-child-7-1');

    fireEvent.click(row); // collapse
    await waitFor(() => {
      expect(screen.queryByTestId('modal-scheme-child-7-1')).not.toBeInTheDocument();
    });
  });

  it('exposes an aria-label on the chevron that toggles between Expand / Collapse', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Payments'));

    const row = await screen.findByTestId('modal-scheme-consolidated-7');
    expect(
      row.querySelector('[aria-label="Expand installments"]'),
    ).not.toBeNull();

    fireEvent.click(row);
    await waitFor(() => {
      expect(
        row.querySelector('[aria-label="Collapse installments"]'),
      ).not.toBeNull();
    });
  });

  it('does not make a non-consolidated payment row clickable / expandable', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Payments'));

    await screen.findByTestId('modal-scheme-consolidated-7');
    // The plain receipt should be present...
    expect(screen.getByText('PAY/9')).toBeInTheDocument();
    // ...but it must not have a consolidated test id, and there should
    // be no child rows associated with it.
    expect(screen.queryByTestId('modal-scheme-consolidated-200')).not.toBeInTheDocument();
  });
});
