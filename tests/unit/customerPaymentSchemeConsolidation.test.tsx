// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * CustomerPaymentList — consolidated scheme rows (REDEEMED / CANCELLED).
 *
 * The backend now collapses installments belonging to a closed-out
 * scheme into one summary row with a `children` array. This test pins
 * down the table behaviour:
 *   - Children are HIDDEN by default.
 *   - Clicking the consolidated row expands its children.
 *   - Clicking again collapses them.
 *   - Non-consolidated rows render normally and are not expandable.
 */

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const mockList = vi.fn();
const mockAccountsList = vi.fn().mockResolvedValue({ data: { accounts: [] } });
vi.mock('../../src/lib/api', () => ({
  customerPaymentsAPI: {
    list: (...args: any[]) => mockList(...args),
    get: vi.fn(),
    create: vi.fn(),
    cancel: vi.fn(),
    balanceHistory: vi.fn(),
  },
  accountsAPI: {
    list: (...args: any[]) => mockAccountsList(...args),
  },
}));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

// AccountMasterModal pulls in many submodules — stub it out for this test.
vi.mock('../../src/components/AccountMasterModal', () => ({
  default: () => null,
}));

import CustomerPaymentList from '../../src/pages/Payments/CustomerPaymentList';

const ACCT = { id: 10, name: 'Asha Kumari', mobile: '9876543210', closingBalance: 0, balanceType: 'NONE' };

const consolidatedRedeemed = {
  id: 'scheme-7',
  receiptNo: 'SS/7',
  paymentDate: '2026-03-05',
  source: 'SCHEME',
  paymentType: 'SCHEME',
  account: ACCT,
  cashAmount: 2000, bankAmount: 0, cardAmount: 0, upiAmount: 1000,
  totalAmount: 3000, balanceBefore: 0, balanceAfter: 0,
  status: 'ACTIVE',
  narration: 'Scheme SS/7 redeemed — 3 installments',
  isConsolidated: true, schemeId: 7, schemeStatus: 'REDEEMED', installmentCount: 3,
  children: [
    { id: 101, installmentNo: 1, paymentDate: '2026-01-05', cashAmount: 1000, bankAmount: 0, cardAmount: 0, upiAmount: 0, totalAmount: 1000, narration: 'Installment 1' },
    { id: 102, installmentNo: 2, paymentDate: '2026-02-05', cashAmount: 1000, bankAmount: 0, cardAmount: 0, upiAmount: 0, totalAmount: 1000, narration: 'Installment 2' },
    { id: 103, installmentNo: 3, paymentDate: '2026-03-05', cashAmount: 0, bankAmount: 0, cardAmount: 0, upiAmount: 1000, totalAmount: 1000, narration: 'Installment 3' },
  ],
};

const individualSchemeRow = {
  id: 200, receiptNo: 'SS/9', paymentDate: '2026-04-05',
  source: 'SCHEME', paymentType: 'SCHEME', account: ACCT,
  cashAmount: 1000, bankAmount: 0, cardAmount: 0, upiAmount: 0,
  totalAmount: 1000, balanceBefore: 0, balanceAfter: 0,
  status: 'ACTIVE', narration: 'Active scheme installment',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CustomerPaymentList />
    </QueryClientProvider>,
  );
}

describe('CustomerPaymentList — consolidated scheme rows', () => {
  beforeEach(() => {
    mockList.mockReset();
  });

  it('hides installment children of a consolidated scheme row by default', async () => {
    mockList.mockResolvedValue({
      data: { payments: [consolidatedRedeemed], total: 1, page: 1, limit: 50 },
    });

    renderPage();

    // The consolidated row itself shows the scheme number and REDEEMED badge.
    await waitFor(() => {
      expect(screen.getByTestId('scheme-consolidated-7')).toBeInTheDocument();
    });
    expect(screen.getByText('REDEEMED')).toBeInTheDocument();
    expect(screen.getByText('(3 inst.)')).toBeInTheDocument();

    // None of the children rows are visible yet.
    expect(screen.queryByTestId('scheme-child-7-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scheme-child-7-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scheme-child-7-3')).not.toBeInTheDocument();
  });

  it('expands children when the consolidated row is clicked, and collapses on second click', async () => {
    mockList.mockResolvedValue({
      data: { payments: [consolidatedRedeemed], total: 1, page: 1, limit: 50 },
    });

    renderPage();

    const headerRow = await screen.findByTestId('scheme-consolidated-7');

    fireEvent.click(headerRow);
    expect(screen.getByTestId('scheme-child-7-1')).toBeInTheDocument();
    expect(screen.getByTestId('scheme-child-7-2')).toBeInTheDocument();
    expect(screen.getByTestId('scheme-child-7-3')).toBeInTheDocument();

    fireEvent.click(headerRow);
    expect(screen.queryByTestId('scheme-child-7-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scheme-child-7-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scheme-child-7-3')).not.toBeInTheDocument();
  });

  it('renders CANCELLED schemes with a red badge', async () => {
    const cancelled = {
      ...consolidatedRedeemed,
      id: 'scheme-9',
      schemeId: 9,
      receiptNo: 'SS/9',
      schemeStatus: 'CANCELLED',
      narration: 'Scheme SS/9 cancelled — 2 installments',
      installmentCount: 2,
      children: consolidatedRedeemed.children.slice(0, 2),
    };
    mockList.mockResolvedValue({
      data: { payments: [cancelled], total: 1, page: 1, limit: 50 },
    });

    renderPage();

    await waitFor(() => expect(screen.getByTestId('scheme-consolidated-9')).toBeInTheDocument());
    expect(screen.getByText('CANCELLED')).toBeInTheDocument();
  });

  it('does NOT make non-consolidated rows expandable', async () => {
    mockList.mockResolvedValue({
      data: { payments: [individualSchemeRow], total: 1, page: 1, limit: 50 },
    });

    renderPage();

    // Wait for the row's content to render.
    await waitFor(() => expect(screen.getByText('SS/9')).toBeInTheDocument());

    // No consolidated marker exists.
    expect(screen.queryByTestId('scheme-consolidated-9')).not.toBeInTheDocument();
    // No child rows either.
    expect(screen.queryByTestId(/^scheme-child-/)).not.toBeInTheDocument();
  });
});
