// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { getToday } from '../../src/lib/utils';

// ── Mock react-router-dom ──────────────────────────────────
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

// ── Mock api module ────────────────────────────────────────
const mockList = vi.fn();
const mockGet = vi.fn();
const mockCreate = vi.fn();
const mockCancel = vi.fn();
const mockBalanceHistory = vi.fn();
const mockAccountsList = vi.fn();
const mockAccountsGet = vi.fn();

vi.mock('../../src/lib/api', () => ({
  customerPaymentsAPI: {
    list: (...args: any[]) => mockList(...args),
    get: (...args: any[]) => mockGet(...args),
    create: (...args: any[]) => mockCreate(...args),
    cancel: (...args: any[]) => mockCancel(...args),
    balanceHistory: (...args: any[]) => mockBalanceHistory(...args),
  },
  accountsAPI: {
    list: (...args: any[]) => mockAccountsList(...args),
    get: (...args: any[]) => mockAccountsGet(...args),
    create: vi.fn(),
  },
  mastersAPI: {
    latestRates: vi.fn().mockResolvedValue({ data: [] }),
    salesmen: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

// ── Mock react-hot-toast ───────────────────────────────────
vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

// ── Mock AccountMasterModal ────────────────────────────────
vi.mock('../../src/components/AccountMasterModal', () => ({
  default: ({ onClose }: any) => (
    <div data-testid="account-master-modal">
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}));

// ── Helper to wrap component in QueryClientProvider ────────
function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

// ================================================================
// CustomerPaymentEntry
// ================================================================
import CustomerPaymentEntry from '../../src/pages/Payments/CustomerPaymentEntry';

describe('CustomerPaymentEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccountsList.mockResolvedValue({ data: { accounts: [] } });
    mockBalanceHistory.mockResolvedValue({ data: { account: null, history: [] } });
  });

  it('renders the payment entry form', () => {
    renderWithQuery(<CustomerPaymentEntry />);
    expect(screen.getByText('Customer Payment Entry')).toBeInTheDocument();
    expect(screen.getByText('Payment Summary')).toBeInTheDocument();
  });

  it('has date and payment type fields', () => {
    renderWithQuery(<CustomerPaymentEntry />);
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Payment Type')).toBeInTheDocument();
    // Verify actual inputs exist
    expect(screen.getByDisplayValue(getToday())).toBeInTheDocument();
  });

  it('shows Advance and Due Payment options', () => {
    renderWithQuery(<CustomerPaymentEntry />);
    const selects = screen.getAllByRole('combobox');
    const paymentSelect = selects.find((s) =>
      Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'Advance Payment')
    );
    expect(paymentSelect).toBeTruthy();

    const options = paymentSelect!.querySelectorAll('option');
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe('Advance Payment');
    expect(options[1].textContent).toBe('Due Payment');
  });

  it('has cash, bank, and card amount inputs', () => {
    renderWithQuery(<CustomerPaymentEntry />);
    expect(screen.getByText('Cash Amount')).toBeInTheDocument();
    expect(screen.getByText('Bank Amount')).toBeInTheDocument();
    expect(screen.getByText('Card Amount')).toBeInTheDocument();
  });

  it('has save and clear buttons', () => {
    renderWithQuery(<CustomerPaymentEntry />);
    expect(screen.getByText(/Save Payment/i)).toBeInTheDocument();
    expect(screen.getByText(/New \/ Clear/i)).toBeInTheDocument();
  });

  it('shows customer search dropdown when typing', async () => {
    const customers = [
      { id: 10, name: 'Raj Jewellers', mobile: '9876543210', closingBalance: 15000 },
    ];
    mockAccountsList.mockResolvedValue({ data: { accounts: customers } });

    renderWithQuery(<CustomerPaymentEntry />);

    const input = screen.getByPlaceholderText(/Search customer/i);
    await userEvent.type(input, 'Raj');

    await waitFor(() => {
      expect(screen.getByText('Raj Jewellers')).toBeInTheDocument();
    });
  });

  it('selects customer and shows balance info', async () => {
    const customers = [
      { id: 10, name: 'Raj Jewellers', mobile: '9876543210', closingBalance: 15000, balanceType: 'DR' },
    ];
    mockAccountsList.mockResolvedValue({ data: { accounts: customers } });
    mockAccountsGet.mockResolvedValue({
      data: { id: 10, name: 'Raj Jewellers', mobile: '9876543210', closingBalance: 15000, balanceType: 'DR' },
    });

    renderWithQuery(<CustomerPaymentEntry />);

    const input = screen.getByPlaceholderText(/Search customer/i);
    await userEvent.type(input, 'Raj');

    await waitFor(() => {
      expect(screen.getByText('Raj Jewellers')).toBeInTheDocument();
    });

    // Click on the customer in dropdown
    fireEvent.click(screen.getByText('Raj Jewellers'));

    await waitFor(() => {
      expect(screen.getByText(/Current Balance/i)).toBeInTheDocument();
    });
  });

  it('calculates total from multiple payment sources', async () => {
    renderWithQuery(<CustomerPaymentEntry />);

    // Find number inputs (cash, bank, card)
    const numberInputs = screen.getAllByRole('spinbutton');
    // Cash = first, Bank = second, Card = third
    await userEvent.type(numberInputs[0], '5000');
    await userEvent.type(numberInputs[1], '3000');
    await userEvent.type(numberInputs[2], '2000');

    await waitFor(() => {
      // Sum = 10000 → formatted as ₹10,000.00 in both main area and summary
      const totalEls = screen.getAllByText((content) => content.includes('10,000.00'));
      expect(totalEls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows bank details inputs when bank amount is entered', async () => {
    renderWithQuery(<CustomerPaymentEntry />);

    const numberInputs = screen.getAllByRole('spinbutton');
    // Bank = second number input
    await userEvent.type(numberInputs[1], '5000');

    await waitFor(() => {
      expect(screen.getByText('Bank Name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Cheque/i)).toBeInTheDocument();
    });
  });

  it('shows error when saving without customer', async () => {
    const toast = (await import('react-hot-toast')).default;
    renderWithQuery(<CustomerPaymentEntry />);

    // Save button should be disabled (no customer selected and no amount)
    const saveBtn = screen.getByText(/Save Payment/i);
    expect(saveBtn).toBeDisabled();
  });

  it('opens account master modal on F2', async () => {
    renderWithQuery(<CustomerPaymentEntry />);

    fireEvent.keyDown(window, { key: 'F2' });

    await waitFor(() => {
      expect(screen.getByTestId('account-master-modal')).toBeInTheDocument();
    });
  });

  it('clears form on New/Clear button', async () => {
    renderWithQuery(<CustomerPaymentEntry />);

    const numberInputs = screen.getAllByRole('spinbutton');
    const cashInput = numberInputs[0];
    await userEvent.type(cashInput, '5000');

    fireEvent.click(screen.getByText(/New \/ Clear/i));

    expect((cashInput as HTMLInputElement).value).toBe('');
  });

  it('displays keyboard shortcuts', () => {
    renderWithQuery(<CustomerPaymentEntry />);
    expect(screen.getByText('F2: Customer')).toBeInTheDocument();
    expect(screen.getByText('F9: Save')).toBeInTheDocument();
  });

  it('shows payment type in summary panel', () => {
    renderWithQuery(<CustomerPaymentEntry />);
    expect(screen.getByText('⬤ Advance')).toBeInTheDocument();
  });

  it('switches payment type to Due Payment', async () => {
    renderWithQuery(<CustomerPaymentEntry />);

    const selects = screen.getAllByRole('combobox');
    const paymentSelect = selects.find((s) =>
      Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'Advance Payment')
    )!;
    await userEvent.selectOptions(paymentSelect, 'DUE_PAYMENT');

    expect(screen.getByText('⬤ Due Payment')).toBeInTheDocument();
  });
});

// ================================================================
// CustomerPaymentList
// ================================================================
import CustomerPaymentList from '../../src/pages/Payments/CustomerPaymentList';

describe('CustomerPaymentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the payment list page', async () => {
    mockList.mockResolvedValue({ data: { payments: [], total: 0 } });

    renderWithQuery(<CustomerPaymentList />);
    expect(screen.getByText('Customer Payments')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockList.mockReturnValue(new Promise(() => {})); // never resolves

    renderWithQuery(<CustomerPaymentList />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    mockList.mockResolvedValue({ data: { payments: [], total: 0 } });

    renderWithQuery(<CustomerPaymentList />);

    await waitFor(() => {
      expect(screen.getByText('No payments found')).toBeInTheDocument();
    });
  });

  it('displays payment records', async () => {
    mockList.mockResolvedValue({
      data: {
        payments: [{
          id: 1,
          receiptNo: 'CPR/1',
          paymentDate: '2026-03-10',
          paymentType: 'DUE_PAYMENT',
          cashAmount: 10000,
          bankAmount: 0,
          cardAmount: 0,
          totalAmount: 10000,
          balanceBefore: 15000,
          balanceAfter: 5000,
          status: 'ACTIVE',
          account: { id: 10, name: 'Raj Jewellers', mobile: '9876543210' },
        }],
        total: 1,
      },
    });

    renderWithQuery(<CustomerPaymentList />);

    await waitFor(() => {
      expect(screen.getByText('CPR/1')).toBeInTheDocument();
      // Account name is inside a <span> within a <td> that also has mobile text
      const nameSpan = screen.getByText((content, element) =>
        element?.tagName === 'SPAN' && content === 'Raj Jewellers'
      );
      expect(nameSpan).toBeInTheDocument();
      // 'Due Payment' appears in both the filter <option> and the row badge — check at least 2
      const dueBadges = screen.getAllByText('Due Payment');
      expect(dueBadges.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('has filter controls', async () => {
    mockList.mockResolvedValue({ data: { payments: [], total: 0 } });

    renderWithQuery(<CustomerPaymentList />);

    expect(screen.getByPlaceholderText(/Receipt, name/i)).toBeInTheDocument();
    expect(screen.getByText('All Types')).toBeInTheDocument();
  });

  it('shows cancel button for active payments', async () => {
    mockList.mockResolvedValue({
      data: {
        payments: [{
          id: 1,
          receiptNo: 'CPR/1',
          paymentDate: '2026-03-10',
          paymentType: 'ADVANCE',
          cashAmount: 5000,
          bankAmount: 0,
          cardAmount: 0,
          totalAmount: 5000,
          balanceBefore: 0,
          balanceAfter: -5000,
          status: 'ACTIVE',
          account: { id: 11, name: 'Priya Sharma', mobile: '9988776655' },
        }],
        total: 1,
      },
    });

    renderWithQuery(<CustomerPaymentList />);

    await waitFor(() => {
      expect(screen.getByTitle('Cancel payment')).toBeInTheDocument();
    });
  });

  it('shows cancel confirmation dialog', async () => {
    mockList.mockResolvedValue({
      data: {
        payments: [{
          id: 1,
          receiptNo: 'CPR/1',
          paymentDate: '2026-03-10',
          paymentType: 'ADVANCE',
          cashAmount: 5000,
          bankAmount: 0,
          cardAmount: 0,
          totalAmount: 5000,
          balanceBefore: 0,
          balanceAfter: -5000,
          status: 'ACTIVE',
          account: { id: 11, name: 'Priya Sharma', mobile: '9988776655' },
        }],
        total: 1,
      },
    });

    renderWithQuery(<CustomerPaymentList />);

    await waitFor(() => {
      expect(screen.getByTitle('Cancel payment')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Cancel payment'));

    await waitFor(() => {
      expect(screen.getByText('Cancel Payment')).toBeInTheDocument();
      expect(screen.getByText('Yes, Cancel')).toBeInTheDocument();
      expect(screen.getByText('No, Keep')).toBeInTheDocument();
    });
  });

  it('does not show cancel button for cancelled payments', async () => {
    mockList.mockResolvedValue({
      data: {
        payments: [{
          id: 3,
          receiptNo: 'CPR/3',
          paymentDate: '2026-03-10',
          paymentType: 'DUE_PAYMENT',
          cashAmount: 5000,
          bankAmount: 0,
          cardAmount: 0,
          totalAmount: 5000,
          balanceBefore: 15000,
          balanceAfter: 10000,
          status: 'CANCELLED',
          account: { id: 10, name: 'Raj Jewellers', mobile: '9876543210' },
        }],
        total: 1,
      },
    });

    renderWithQuery(<CustomerPaymentList />);

    await waitFor(() => {
      expect(screen.getByText('CPR/3')).toBeInTheDocument();
      expect(screen.queryByTitle('Cancel payment')).not.toBeInTheDocument();
    });
  });

  it('applies cancelled row styling', async () => {
    mockList.mockResolvedValue({
      data: {
        payments: [{
          id: 3,
          receiptNo: 'CPR/3',
          paymentDate: '2026-03-10',
          paymentType: 'DUE_PAYMENT',
          cashAmount: 5000,
          bankAmount: 0,
          cardAmount: 0,
          totalAmount: 5000,
          balanceBefore: 15000,
          balanceAfter: 10000,
          status: 'CANCELLED',
          account: { id: 10, name: 'Raj Jewellers', mobile: '9876543210' },
        }],
        total: 1,
      },
    });

    renderWithQuery(<CustomerPaymentList />);

    await waitFor(() => {
      const row = screen.getByText('CPR/3').closest('tr');
      expect(row?.className).toContain('opacity-50');
    });
  });

  it('displays Advance badge correctly', async () => {
    mockList.mockResolvedValue({
      data: {
        payments: [{
          id: 2,
          receiptNo: 'CPR/2',
          paymentDate: '2026-03-12',
          paymentType: 'ADVANCE',
          cashAmount: 5000,
          bankAmount: 3000,
          cardAmount: 0,
          totalAmount: 8000,
          balanceBefore: -5000,
          balanceAfter: -13000,
          status: 'ACTIVE',
          account: { id: 11, name: 'Priya Sharma', mobile: '9988776655' },
        }],
        total: 1,
      },
    });

    renderWithQuery(<CustomerPaymentList />);

    await waitFor(() => {
      expect(screen.getByText('Advance')).toBeInTheDocument();
    });
  });

  it('shows record count', async () => {
    mockList.mockResolvedValue({
      data: {
        payments: [],
        total: 42,
      },
    });

    renderWithQuery(<CustomerPaymentList />);

    await waitFor(() => {
      expect(screen.getByText('42 records')).toBeInTheDocument();
    });
  });

  it('has a clear filters button', async () => {
    mockList.mockResolvedValue({ data: { payments: [], total: 0 } });

    renderWithQuery(<CustomerPaymentList />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });
});
