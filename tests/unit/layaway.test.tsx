// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mock react-router-dom ──────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

// ── Mock api module ────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  layawayAPI: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    addPayment: vi.fn(),
    cancel: vi.fn(),
  },
  inventoryAPI: {
    searchLabel: vi.fn(),
  },
  accountsAPI: {
    list: vi.fn(),
    create: vi.fn(),
  },
  mastersAPI: {
    latestRates: vi.fn(),
    salesmen: vi.fn(),
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

import { layawayAPI, inventoryAPI, accountsAPI, mastersAPI } from '../../src/lib/api';
import toast from 'react-hot-toast';

const mockCreate = layawayAPI.create as ReturnType<typeof vi.fn>;
const mockSearchLabel = inventoryAPI.searchLabel as ReturnType<typeof vi.fn>;
const mockListAccounts = accountsAPI.list as ReturnType<typeof vi.fn>;
const mockLatestRates = mastersAPI.latestRates as ReturnType<typeof vi.fn>;
const mockSalesmen = mastersAPI.salesmen as ReturnType<typeof vi.fn>;
const mockToast = toast as unknown as ReturnType<typeof vi.fn> & {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

// ── Import components after mocks ──────────────────────────
import LayawayEntry from '../../src/pages/Layaway/LayawayEntry';
import LayawayList from '../../src/pages/Layaway/LayawayList';

// ── Helpers ────────────────────────────────────────────────
function renderLayawayEntry() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // Setup default mock responses
  mockSalesmen.mockResolvedValue({ data: [{ id: 1, name: 'Amit' }, { id: 2, name: 'Rahul' }] });
  mockLatestRates.mockResolvedValue({ data: [] });

  return render(
    <QueryClientProvider client={qc}>
      <LayawayEntry />
    </QueryClientProvider>,
  );
}

function renderLayawayList() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const mockList = layawayAPI.list as ReturnType<typeof vi.fn>;
  mockList.mockResolvedValue({ data: { entries: [], totalAmount: 0 } });
  mockSalesmen.mockResolvedValue({ data: [] });

  return render(
    <QueryClientProvider client={qc}>
      <LayawayList />
    </QueryClientProvider>,
  );
}

const MOCK_LABEL = {
  id: 100,
  labelNo: 'BCD/2',
  status: 'IN_STOCK',
  itemId: 1,
  grossWeight: 3.08,
  netWeight: 2.342,
  pcsCount: 1,
  item: {
    id: 1,
    name: 'Bracelet Diamond',
    purity: { id: 1, code: '22KT', percentage: 91.6 },
    metalType: { id: 1, name: 'Gold' },
    itemGroup: { id: 4, name: 'Bracelet' },
    labourRate: 650,
  },
};

const MOCK_RATES = [
  { metalType: { name: 'Gold' }, purityCode: '22KT', rate: 6920 },
];

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// LayawayEntry Tests
// ════════════════════════════════════════════════════════════
describe('LayawayEntry', () => {
  describe('rendering', () => {
    it('renders the LayAway Entry header', () => {
      renderLayawayEntry();
      expect(screen.getByText(/LayAway Entry \[LY\]/)).toBeDefined();
    });

    it('renders the label scan input with placeholder', () => {
      renderLayawayEntry();
      expect(screen.getByPlaceholderText('Scan label...')).toBeDefined();
    });

    it('renders the Add button', () => {
      renderLayawayEntry();
      expect(screen.getByText('Add')).toBeDefined();
    });

    it('renders voucher date input', () => {
      renderLayawayEntry();
      const dateInput = screen.getByDisplayValue(new Date().toISOString().split('T')[0]);
      expect(dateInput).toBeDefined();
    });

    it('renders the items table headers', () => {
      renderLayawayEntry();
      expect(screen.getByText('Label No.')).toBeDefined();
      expect(screen.getByText('Item Name')).toBeDefined();
      expect(screen.getByText('Gross Wt')).toBeDefined();
      expect(screen.getByText('Net Wt')).toBeDefined();
      expect(screen.getByText('Fine Wt')).toBeDefined();
      expect(screen.getByText('Metal Rate')).toBeDefined();
      expect(screen.getAllByText('Metal Amt').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Di.Wt.')).toBeDefined();
      expect(screen.getByText('Lab. Rate')).toBeDefined();
      expect(screen.getByText('Taxable Amt')).toBeDefined();
      expect(screen.getByText('Final Amt.')).toBeDefined();
      expect(screen.getAllByText('SGST').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('CGST').length).toBeGreaterThanOrEqual(1);
    });

    it('shows empty state message when no items', () => {
      renderLayawayEntry();
      expect(screen.getByText('Scan a label or barcode to add items for layaway')).toBeDefined();
    });

    it('renders the narration textarea', () => {
      renderLayawayEntry();
      expect(screen.getByPlaceholderText('Enter narration here...')).toBeDefined();
    });

    it('renders salesman dropdown', () => {
      renderLayawayEntry();
      expect(screen.getByText('Salesman Detail')).toBeDefined();
    });

    it('renders voucher details sidebar', () => {
      renderLayawayEntry();
      expect(screen.getByText('Voucher Details')).toBeDefined();
      expect(screen.getAllByText('Metal Amt').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Labour Amt')).toBeDefined();
      expect(screen.getByText('Oth. Charge')).toBeDefined();
    });

    it('renders credit details section', () => {
      renderLayawayEntry();
      expect(screen.getByText('Credit Details')).toBeDefined();
      expect(screen.getByText('Cash Amt')).toBeDefined();
      expect(screen.getByText('Bank Amt')).toBeDefined();
      expect(screen.getByText('Card Amt')).toBeDefined();
      expect(screen.getByText('OG Purchase')).toBeDefined();
    });

    it('renders O/S details section', () => {
      renderLayawayEntry();
      expect(screen.getByText('O/s. Details')).toBeDefined();
      expect(screen.getByText('Voucher Amt')).toBeDefined();
      expect(screen.getByText('Payment Amt')).toBeDefined();
      expect(screen.getByText('Due Amt')).toBeDefined();
      expect(screen.getByText('Previous O/S')).toBeDefined();
      expect(screen.getByText('Final Due.')).toBeDefined();
    });

    it('renders function key bar', () => {
      renderLayawayEntry();
      expect(screen.getAllByText('Customer').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Save').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Print').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Close').length).toBeGreaterThanOrEqual(1);
    });

    it('renders Save, Print, Close buttons in sidebar', () => {
      renderLayawayEntry();
      const saveButtons = screen.getAllByText('Save');
      const printButtons = screen.getAllByText('Print');
      const closeButtons = screen.getAllByText('Close');
      expect(saveButtons.length).toBeGreaterThanOrEqual(1);
      expect(printButtons.length).toBeGreaterThanOrEqual(1);
      expect(closeButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('defaults to General Customer when no customer selected', () => {
      renderLayawayEntry();
      expect(screen.getByText(/General Customer/)).toBeDefined();
    });

    it('renders Debit section with 0 initial amount', () => {
      renderLayawayEntry();
      expect(screen.getByText('Debit')).toBeDefined();
    });
  });

  describe('label scanning', () => {
    it('scans a label and adds item to table', async () => {
      renderLayawayEntry();

      mockSearchLabel.mockResolvedValueOnce({ data: MOCK_LABEL });
      mockLatestRates.mockResolvedValueOnce({ data: MOCK_RATES });

      const input = screen.getByPlaceholderText('Scan label...');
      await userEvent.type(input, 'BCD/2{Enter}');

      await waitFor(() => {
        expect(screen.getByText('BCD/2')).toBeDefined();
        expect(screen.getByText('Bracelet Diamond')).toBeDefined();
      });
    });

    it('shows error when label is not IN_STOCK', async () => {
      renderLayawayEntry();

      mockSearchLabel.mockResolvedValueOnce({
        data: { ...MOCK_LABEL, status: 'SOLD' },
      });

      const input = screen.getByPlaceholderText('Scan label...');
      await userEvent.type(input, 'BCD/2{Enter}');

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          expect.stringContaining('not in stock'),
        );
      });
    });

    it('shows error when label is already on LAYAWAY', async () => {
      renderLayawayEntry();

      mockSearchLabel.mockResolvedValueOnce({
        data: { ...MOCK_LABEL, status: 'LAYAWAY' },
      });

      const input = screen.getByPlaceholderText('Scan label...');
      await userEvent.type(input, 'BCD/2{Enter}');

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          expect.stringContaining('not in stock'),
        );
      });
    });

    it('prevents duplicate label addition', async () => {
      renderLayawayEntry();

      mockSearchLabel.mockResolvedValue({ data: MOCK_LABEL });
      mockLatestRates.mockResolvedValue({ data: MOCK_RATES });

      const input = screen.getByPlaceholderText('Scan label...');

      // First scan
      await userEvent.type(input, 'BCD/2{Enter}');
      await waitFor(() => expect(screen.getByText('BCD/2')).toBeDefined());

      // Second scan of same label
      await userEvent.type(input, 'BCD/2{Enter}');
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Item already added');
      });
    });

    it('shows error when label not found', async () => {
      renderLayawayEntry();

      mockSearchLabel.mockRejectedValueOnce(new Error('Not found'));

      const input = screen.getByPlaceholderText('Scan label...');
      await userEvent.type(input, 'INVALID{Enter}');

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Label INVALID not found');
      });
    });

    it('does not scan empty label', async () => {
      renderLayawayEntry();

      const input = screen.getByPlaceholderText('Scan label...');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockSearchLabel).not.toHaveBeenCalled();
    });

    it('clears input after successful scan', async () => {
      renderLayawayEntry();

      mockSearchLabel.mockResolvedValueOnce({ data: MOCK_LABEL });
      mockLatestRates.mockResolvedValueOnce({ data: MOCK_RATES });

      const input = screen.getByPlaceholderText('Scan label...') as HTMLInputElement;
      await userEvent.type(input, 'BCD/2{Enter}');

      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });
  });

  describe('item removal', () => {
    it('removes item when X button is clicked', async () => {
      renderLayawayEntry();

      mockSearchLabel.mockResolvedValueOnce({ data: MOCK_LABEL });
      mockLatestRates.mockResolvedValueOnce({ data: MOCK_RATES });

      const input = screen.getByPlaceholderText('Scan label...');
      await userEvent.type(input, 'BCD/2{Enter}');

      await waitFor(() => expect(screen.getByText('BCD/2')).toBeDefined());

      const removeBtn = screen.getByTitle('Remove item');
      await userEvent.click(removeBtn);

      expect(screen.queryByText('BCD/2')).toBeNull();
    });
  });

  describe('narration', () => {
    it('allows typing into narration field', async () => {
      renderLayawayEntry();

      const narrationInput = screen.getByTestId('narration-input') as HTMLTextAreaElement;
      await userEvent.type(narrationInput, '1 DAY');

      expect(narrationInput.value).toBe('1 DAY');
    });

    it('opens narration modal when Narration function key is clicked', async () => {
      renderLayawayEntry();

      const narrationElements = screen.getAllByText('Narration');
      const narrationFnKey = narrationElements.find(el => el.closest('.fn-key'))!;
      await userEvent.click(narrationFnKey);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter narration...')).toBeDefined();
      });
    });
  });

  describe('customer selection', () => {
    it('opens customer modal when Customer function key is clicked', async () => {
      renderLayawayEntry();

      const customerBtn = screen.getByText('Customer');
      await userEvent.click(customerBtn);

      await waitFor(() => {
        expect(screen.getByText('Select Customer')).toBeDefined();
      });
    });

    it('opens customer modal on F2 key', async () => {
      renderLayawayEntry();

      fireEvent.keyDown(window, { key: 'F2' });

      await waitFor(() => {
        expect(screen.getByText('Select Customer')).toBeDefined();
      });
    });
  });

  describe('save validation', () => {
    it('shows error when saving without customer', async () => {
      renderLayawayEntry();

      // Add an item first
      mockSearchLabel.mockResolvedValueOnce({ data: MOCK_LABEL });
      mockLatestRates.mockResolvedValueOnce({ data: MOCK_RATES });
      const input = screen.getByPlaceholderText('Scan label...');
      await userEvent.type(input, 'BCD/2{Enter}');
      await waitFor(() => expect(screen.getByText('BCD/2')).toBeDefined());

      // Click save in sidebar
      const saveButtons = screen.getAllByText('Save');
      await userEvent.click(saveButtons[saveButtons.length - 1]);

      expect(mockToast.error).toHaveBeenCalledWith('Please select a customer (F2)');
    });

    it('shows error when saving without items', async () => {
      renderLayawayEntry();

      const saveButtons = screen.getAllByText('Save');
      await userEvent.click(saveButtons[saveButtons.length - 1]);

      // Should error for no customer first
      expect(mockToast.error).toHaveBeenCalled();
    });
  });

  describe('payment entry', () => {
    it('allows entering cash amount', async () => {
      renderLayawayEntry();

      const cashInputs = screen.getAllByRole('spinbutton');
      const cashInput = cashInputs.find(
        (input) => input.closest('.voucher-detail-row')?.textContent?.includes('Cash Amt')
      );
      expect(cashInput).toBeDefined();
    });

    it('allows entering bank amount', async () => {
      renderLayawayEntry();

      const bankInputs = screen.getAllByRole('spinbutton');
      const bankInput = bankInputs.find(
        (input) => input.closest('.voucher-detail-row')?.textContent?.includes('Bank Amt')
      );
      expect(bankInput).toBeDefined();
    });
  });

  describe('calculations', () => {
    it('shows correct initial amounts as 0', () => {
      renderLayawayEntry();

      // All voucher detail values should show 0.00
      const zeroValues = screen.getAllByText('0.00');
      expect(zeroValues.length).toBeGreaterThan(0);
    });
  });
});

// ════════════════════════════════════════════════════════════
// LayawayList Tests
// ════════════════════════════════════════════════════════════
describe('LayawayList', () => {
  describe('rendering', () => {
    it('renders LayAway Entry List header', async () => {
      renderLayawayList();

      await waitFor(() => {
        expect(screen.getByText('LayAway Entry List')).toBeDefined();
      });
    });

    it('renders filter controls', async () => {
      renderLayawayList();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('All')).toBeDefined(); // Customer filter
        expect(screen.getByText('Salesman')).toBeDefined();
        expect(screen.getByText('Date From')).toBeDefined();
        expect(screen.getByText('Date To')).toBeDefined();
        expect(screen.getAllByText('Status').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders action buttons', async () => {
      renderLayawayList();

      await waitFor(() => {
        expect(screen.getByText('+ Add')).toBeDefined();
        expect(screen.getByText('Delete Layaway Item')).toBeDefined();
        expect(screen.getByText('Search')).toBeDefined();
      });
    });

    it('renders table column headers', async () => {
      renderLayawayList();

      await waitFor(() => {
        expect(screen.getByText('Voucher No')).toBeDefined();
        expect(screen.getByText('Voucher Date')).toBeDefined();
        expect(screen.getByText('Account Name')).toBeDefined();
        expect(screen.getByText('Total Voucher Amt.')).toBeDefined();
        expect(screen.getByText('Sales-Man Name')).toBeDefined();
        expect(screen.getByText('Reference')).toBeDefined();
        expect(screen.getByText('DueDate')).toBeDefined();
        expect(screen.getByText('Book Name')).toBeDefined();
      });
    });

    it('shows empty state when no entries', async () => {
      renderLayawayList();

      await waitFor(() => {
        expect(screen.getByText('No layaway entries found')).toBeDefined();
      });
    });

    it('shows total entries count', async () => {
      renderLayawayList();

      await waitFor(() => {
        expect(screen.getByText(/Total Entries:/)).toBeDefined();
      });
    });
  });

  describe('list with data', () => {
    it('displays layaway entries in table', async () => {
      const mockList = layawayAPI.list as ReturnType<typeof vi.fn>;
      mockList.mockResolvedValue({
        data: {
          entries: [
            {
              id: 1,
              voucherNo: 'LY/1',
              voucherDate: '2025-03-05T00:00:00.000Z',
              account: { id: 10, name: 'Saurabh Faudar' },
              voucherAmount: 11796,
              salesmanName: 'Amit',
              reference: null,
              dueDate: null,
              bookName: null,
              status: 'ACTIVE',
              items: [],
              payments: [],
            },
          ],
          totalAmount: 11796,
        },
      });
      mockSalesmen.mockResolvedValue({ data: [] });

      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryClientProvider client={qc}>
          <LayawayList />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('LY/1')).toBeDefined();
        expect(screen.getByText('Saurabh Faudar')).toBeDefined();
        expect(screen.getByText('ACTIVE')).toBeDefined();
      });
    });
  });

  describe('actions', () => {
    it('navigates to layaway entry on Add button click', async () => {
      renderLayawayList();

      await waitFor(() => {
        expect(screen.getByText('+ Add')).toBeDefined();
      });

      await userEvent.click(screen.getByText('+ Add'));
      expect(mockNavigate).toHaveBeenCalledWith('/layaway');
    });

    it('disables Delete button when no entry is selected', async () => {
      renderLayawayList();

      await waitFor(() => {
        const deleteBtn = screen.getByText('Delete Layaway Item');
        expect(deleteBtn).toBeDefined();
        expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);
      });
    });

    it('shows status filter options', async () => {
      renderLayawayList();

      // Find the status select (the one with ALL/ACTIVE/COMPLETED/CANCELLED options)
      const selects = screen.getAllByRole('combobox');
      const statusSelect = selects.find(s => {
        const opts = s.querySelectorAll('option');
        return Array.from(opts).some(o => o.getAttribute('value') === 'ACTIVE');
      })!;
      expect(statusSelect).toBeDefined();

      // Contains options
      const options = statusSelect.querySelectorAll('option');
      const values = Array.from(options).map(o => o.getAttribute('value'));
      expect(values).toContain('ALL');
      expect(values).toContain('ACTIVE');
      expect(values).toContain('COMPLETED');
      expect(values).toContain('CANCELLED');
    });
  });
});
