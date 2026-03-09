// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mock react-router-dom ──────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ── Mock api module ────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  salesAPI: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
  mastersAPI: {
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

import { salesAPI, mastersAPI } from '../../src/lib/api';
import SalesEntryList from '../../src/pages/Sales/SalesEntryList';

const mockList = salesAPI.list as ReturnType<typeof vi.fn>;
const mockSalesmen = mastersAPI.salesmen as ReturnType<typeof vi.fn>;

// ── Sample vouchers ────────────────────────────────────────
const VOUCHER_1 = {
  id: 1,
  voucherNo: 'JGI/1',
  voucherDate: '2026-03-05',
  account: { id: 10, name: 'Saurabh Faudar' },
  salesman: { id: 1, name: 'Amit' },
  items: [{ id: 1, labelNo: 'GN/51', itemName: 'Gold Necklace' }],
  totalGrossWeight: 10.5,
  totalNetWeight: 9.8,
  metalAmount: 68110,
  labourAmount: 7350,
  cgstAmount: 1132,
  sgstAmount: 1132,
  voucherAmount: 77722,
  cashAmount: 50000,
  bankAmount: 20000,
  cardAmount: 0,
  oldGoldAmount: 0,
  dueAmount: 7722,
  status: 'ACTIVE',
};

const VOUCHER_2 = {
  ...VOUCHER_1,
  id: 2,
  voucherNo: 'JGI/2',
  voucherDate: '2026-03-06',
  account: { id: 11, name: 'Rahul Sharma' },
  salesman: { id: 2, name: 'Rahul' },
  totalGrossWeight: 5.2,
  totalNetWeight: 4.8,
  voucherAmount: 36885,
  cashAmount: 36885,
  bankAmount: 0,
  dueAmount: 0,
  status: 'CANCELLED',
};

const SALESMEN = [
  { id: 1, name: 'Amit' },
  { id: 2, name: 'Rahul' },
];

// ── Helper ──────────────────────────────────────────────────
function renderList(vouchers = [VOUCHER_1, VOUCHER_2], total = vouchers.length) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  mockList.mockResolvedValue({
    data: { vouchers, total, page: 1, limit: 50 },
  });
  mockSalesmen.mockResolvedValue({ data: SALESMEN });

  return render(
    <QueryClientProvider client={qc}>
      <SalesEntryList />
    </QueryClientProvider>,
  );
}

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// Rendering
// ════════════════════════════════════════════════════════════
describe('SalesEntryList rendering', () => {
  it('renders the Sales Voucher List header', async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getByText('Sales Voucher List')).toBeDefined(),
    );
  });

  it('renders voucher rows after loading', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeDefined();
      expect(screen.getByText('JGI/2')).toBeDefined();
    });
  });

  it('shows No sales vouchers found when list is empty', async () => {
    renderList([], 0);
    await waitFor(() =>
      expect(screen.getByText('No sales vouchers found')).toBeDefined(),
    );
  });

  it('renders New Sale button', () => {
    renderList();
    expect(screen.getByText('+ New Sale')).toBeDefined();
  });

  it('renders column headers', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText('Sr.')).toBeDefined();
      expect(screen.getByText(/Voucher No/)).toBeDefined();
      expect(screen.getByText('Customer')).toBeDefined();
      expect(screen.getByText('Items')).toBeDefined();
      const thead = document.querySelector('thead')!;
      expect(thead.textContent).toContain('Date');
      expect(thead.textContent).toContain('Gross Wt');
      expect(thead.textContent).toContain('Net Wt');
      expect(thead.textContent).toContain('Salesman');
    });
  });

  it('renders customer and salesman names in rows', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText('Saurabh Faudar')).toBeDefined();
      // 'Amit' appears in both dropdown option and table cell
      const amitElements = screen.getAllByText('Amit');
      expect(amitElements.length).toBeGreaterThanOrEqual(2); // dropdown + row
    });
  });

  it('renders status badges', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeDefined();
      expect(screen.getByText('CANCELLED')).toBeDefined();
    });
  });

  it('renders footer totals when vouchers exist', async () => {
    renderList();
    await waitFor(() => {
      const footerText = screen.getByText(/Total \(2 of 2 vouchers\)/);
      expect(footerText).toBeDefined();
    });
  });
});

// ════════════════════════════════════════════════════════════
// Primary filter controls
// ════════════════════════════════════════════════════════════
describe('SalesEntryList primary filters', () => {
  it('renders search input', () => {
    renderList();
    expect(screen.getByTestId('search-input')).toBeDefined();
  });

  it('renders date from and to inputs', () => {
    renderList();
    expect(screen.getByTestId('date-from')).toBeDefined();
    expect(screen.getByTestId('date-to')).toBeDefined();
  });

  it('renders status dropdown with all options', () => {
    renderList();
    const statusSelect = screen.getByTestId('status-filter') as HTMLSelectElement;
    expect(statusSelect).toBeDefined();
    const options = statusSelect.querySelectorAll('option');
    expect(options.length).toBe(4);
    expect(options[0].value).toBe('ALL');
    expect(options[1].value).toBe('ACTIVE');
    expect(options[2].value).toBe('CANCELLED');
    expect(options[3].value).toBe('VOID');
  });

  it('renders salesman dropdown', async () => {
    renderList();
    await waitFor(() => {
      const salesmanSelect = screen.getByTestId('salesman-filter') as HTMLSelectElement;
      expect(salesmanSelect).toBeDefined();
    });
  });

  it('renders search button', () => {
    renderList();
    expect(screen.getByTestId('search-btn')).toBeDefined();
  });

  it('typing in search input updates value', async () => {
    renderList();
    const user = userEvent.setup();
    const input = screen.getByTestId('search-input') as HTMLInputElement;
    await user.type(input, 'Saurabh');
    expect(input.value).toBe('Saurabh');
  });

  it('changing status dropdown updates value', async () => {
    renderList();
    const user = userEvent.setup();
    const select = screen.getByTestId('status-filter') as HTMLSelectElement;
    await user.selectOptions(select, 'CANCELLED');
    expect(select.value).toBe('CANCELLED');
  });
});

// ════════════════════════════════════════════════════════════
// Advanced filters (collapsible)
// ════════════════════════════════════════════════════════════
describe('SalesEntryList advanced filters', () => {
  it('advanced filters hidden by default', () => {
    renderList();
    expect(screen.queryByTestId('advanced-filters')).toBeNull();
  });

  it('toggles advanced filters on button click', async () => {
    renderList();
    const user = userEvent.setup();
    const toggleBtn = screen.getByTestId('toggle-advanced');
    expect(toggleBtn.textContent).toContain('More Filters');

    await user.click(toggleBtn);
    expect(screen.getByTestId('advanced-filters')).toBeDefined();

    await user.click(toggleBtn);
    expect(screen.queryByTestId('advanced-filters')).toBeNull();
  });

  it('shows all advanced filter inputs when expanded', async () => {
    renderList();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toggle-advanced'));

    expect(screen.getByTestId('filter-voucherNo')).toBeDefined();
    expect(screen.getByTestId('filter-narration')).toBeDefined();
    expect(screen.getByTestId('filter-reference')).toBeDefined();
    expect(screen.getByTestId('filter-paymentMode')).toBeDefined();
    expect(screen.getByTestId('filter-labelNo')).toBeDefined();
    expect(screen.getByTestId('filter-itemName')).toBeDefined();
    expect(screen.getByTestId('filter-minAmount')).toBeDefined();
    expect(screen.getByTestId('filter-maxAmount')).toBeDefined();
    expect(screen.getByTestId('filter-minDue')).toBeDefined();
    expect(screen.getByTestId('filter-maxDue')).toBeDefined();
    expect(screen.getByTestId('filter-minGrossWeight')).toBeDefined();
    expect(screen.getByTestId('filter-maxGrossWeight')).toBeDefined();
    expect(screen.getByTestId('filter-minNetWeight')).toBeDefined();
    expect(screen.getByTestId('filter-maxNetWeight')).toBeDefined();
    expect(screen.getByTestId('sort-by')).toBeDefined();
    expect(screen.getByTestId('sort-order')).toBeDefined();
  });

  it('payment mode dropdown has all options', async () => {
    renderList();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toggle-advanced'));

    const pmSelect = screen.getByTestId('filter-paymentMode') as HTMLSelectElement;
    const options = pmSelect.querySelectorAll('option');
    expect(options.length).toBe(6); // All, Cash, Bank, Card, Old Gold, Due Only
  });

  it('sort by dropdown has all sort fields', async () => {
    renderList();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toggle-advanced'));

    const sortSelect = screen.getByTestId('sort-by') as HTMLSelectElement;
    const options = sortSelect.querySelectorAll('option');
    expect(options.length).toBe(8); // Date, Voucher No, Amount, Due, Gross Wt, Net Wt, Metal Amt, Created
  });

  it('typing in voucher no filter updates value', async () => {
    renderList();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toggle-advanced'));

    const input = screen.getByTestId('filter-voucherNo') as HTMLInputElement;
    await user.type(input, 'JGI/1');
    expect(input.value).toBe('JGI/1');
  });

  it('typing in narration filter updates value', async () => {
    renderList();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toggle-advanced'));

    const input = screen.getByTestId('filter-narration') as HTMLInputElement;
    await user.type(input, 'wedding');
    expect(input.value).toBe('wedding');
  });

  it('typing in labelNo filter updates value', async () => {
    renderList();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toggle-advanced'));

    const input = screen.getByTestId('filter-labelNo') as HTMLInputElement;
    await user.type(input, 'GN/51');
    expect(input.value).toBe('GN/51');
  });

  it('sort order button toggles between asc and desc', async () => {
    renderList();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toggle-advanced'));

    const sortBtn = screen.getByTestId('sort-order');
    expect(sortBtn.textContent).toContain('Desc');

    await user.click(sortBtn);
    expect(sortBtn.textContent).toContain('Asc');

    await user.click(sortBtn);
    expect(sortBtn.textContent).toContain('Desc');
  });
});

// ════════════════════════════════════════════════════════════
// Active filter count & clear
// ════════════════════════════════════════════════════════════
describe('SalesEntryList filter count & clear', () => {
  it('shows active filter count when filters are set', async () => {
    renderList();
    const user = userEvent.setup();

    // Set search text (should increment count)
    const searchInput = screen.getByTestId('search-input');
    await user.type(searchInput, 'Saurabh');

    const toggleBtn = screen.getByTestId('toggle-advanced');
    expect(toggleBtn.textContent).toContain('1');
  });

  it('clear filters resets all filters', async () => {
    renderList();
    const user = userEvent.setup();

    // Set a filter
    const searchInput = screen.getByTestId('search-input') as HTMLInputElement;
    await user.type(searchInput, 'test');

    // Change status
    const status = screen.getByTestId('status-filter') as HTMLSelectElement;
    await user.selectOptions(status, 'CANCELLED');

    // Clear button should appear
    const clearBtn = screen.getByTestId('clear-filters');
    expect(clearBtn).toBeDefined();

    await user.click(clearBtn);

    // Verify filters are reset
    expect(searchInput.value).toBe('');
    expect(status.value).toBe('ALL');
  });
});

// ════════════════════════════════════════════════════════════
// Column sorting
// ════════════════════════════════════════════════════════════
describe('SalesEntryList column sorting', () => {
  it('clicking column header toggles sort', async () => {
    renderList();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeDefined();
    });

    // Find the Date <th> header — it contains '▼' because voucherDate is default desc
    const thead = document.querySelector('thead')!;
    const dateHeader = thead.querySelector('th:nth-child(3)')!;
    expect(dateHeader.textContent).toContain('Date');
    expect(dateHeader.textContent).toContain('▼');

    await user.click(dateHeader);
    // Now should be ascending
    await waitFor(() => {
      expect(dateHeader.textContent).toContain('▲');
    });
  });

  it('clicking a different column changes sort field', async () => {
    renderList();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeDefined();
    });

    // Click the Total <th> header (13th column)
    const thead = document.querySelector('thead')!;
    const totalHeader = thead.querySelector('th:nth-child(13)')!;
    expect(totalHeader.textContent).toContain('Total');

    await user.click(totalHeader);

    // total column should now show sort indicator
    await waitFor(() => {
      expect(totalHeader.textContent).toContain('▼');
    });
  });
});

// ════════════════════════════════════════════════════════════
// Navigation
// ════════════════════════════════════════════════════════════
describe('SalesEntryList navigation', () => {
  it('navigates to sales/new on New Sale click', async () => {
    renderList();
    const user = userEvent.setup();
    await user.click(screen.getByText('+ New Sale'));
    expect(mockNavigate).toHaveBeenCalledWith('/sales/new');
  });

  it('navigates to voucher detail on row click', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeDefined();
    });

    const row = screen.getByText('JGI/1').closest('tr')!;
    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith('/sales/1');
  });
});

// ════════════════════════════════════════════════════════════
// Pagination
// ════════════════════════════════════════════════════════════
describe('SalesEntryList pagination', () => {
  it('does not show pagination when all data fits on one page', async () => {
    renderList([VOUCHER_1], 1);
    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeDefined();
    });

    expect(screen.queryByText('First')).toBeNull();
    expect(screen.queryByText('Prev')).toBeNull();
    expect(screen.queryByText('Next')).toBeNull();
    expect(screen.queryByText('Last')).toBeNull();
  });

  it('shows pagination controls when totalPages > 1', async () => {
    // Simulate 100 total vouchers (limit 50 → 2 pages)
    mockList.mockResolvedValue({
      data: { vouchers: [VOUCHER_1, VOUCHER_2], total: 100, page: 1, limit: 50 },
    });
    mockSalesmen.mockResolvedValue({ data: SALESMEN });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={qc}>
        <SalesEntryList />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('First')).toBeDefined();
      expect(screen.getByText('Prev')).toBeDefined();
      expect(screen.getByText('Next')).toBeDefined();
      expect(screen.getByText('Last')).toBeDefined();
      expect(screen.getByText(/Page/)).toBeDefined();
    });
  });
});

// ════════════════════════════════════════════════════════════
// API call verification
// ════════════════════════════════════════════════════════════
describe('SalesEntryList API integration', () => {
  it('calls salesAPI.list on mount with default params', async () => {
    renderList();
    await waitFor(() => {
      expect(mockList).toHaveBeenCalled();
    });

    // Check params include sortBy and sortOrder
    const params = mockList.mock.calls[0][0];
    expect(params.sortBy).toBe('voucherDate');
    expect(params.sortOrder).toBe('desc');
    expect(params.page).toBe(1);
    expect(params.limit).toBe(50);
  });

  it('calls salesAPI.list with status when changed', async () => {
    renderList();
    const user = userEvent.setup();

    const status = screen.getByTestId('status-filter');
    await user.selectOptions(status, 'CANCELLED');

    // Click search to trigger refetch
    await user.click(screen.getByTestId('search-btn'));

    await waitFor(() => {
      const lastCall = mockList.mock.calls[mockList.mock.calls.length - 1][0];
      expect(lastCall.status).toBe('CANCELLED');
    });
  });

  it('calls salesAPI.list with search text', async () => {
    renderList();
    const user = userEvent.setup();

    const searchInput = screen.getByTestId('search-input');
    await user.type(searchInput, 'wedding');

    await user.click(screen.getByTestId('search-btn'));

    await waitFor(() => {
      const lastCall = mockList.mock.calls[mockList.mock.calls.length - 1][0];
      expect(lastCall.search).toBe('wedding');
    });
  });

  it('calls mastersAPI.salesmen to populate dropdown', async () => {
    renderList();
    await waitFor(() => {
      expect(mockSalesmen).toHaveBeenCalled();
    });
  });
});

// ════════════════════════════════════════════════════════════
// Voucher Print Column
// ════════════════════════════════════════════════════════════
describe('SalesEntryList voucher print', () => {
  it('renders Voucher column header', async () => {
    renderList();
    await waitFor(() => {
      const thead = document.querySelector('thead')!;
      expect(thead.textContent).toContain('Actions');
    });
  });

  it('renders 🖨️ print button for each row', async () => {
    renderList();
    await waitFor(() => {
      const printButtons = screen.getAllByTitle('Print Voucher');
      expect(printButtons.length).toBe(2); // one per voucher row
    });
  });

  it('opens VoucherPrintDialog when print button is clicked', async () => {
    // Mock salesAPI.get for dialog data fetch
    const mockSalesGet = salesAPI.get as ReturnType<typeof vi.fn>;
    mockSalesGet.mockResolvedValue({
      data: {
        ...VOUCHER_1,
        account: { ...VOUCHER_1.account, mobile: '9876543210' },
        items: [
          { id: 1, itemName: 'Gold Necklace', item: { name: 'Gold Necklace', hsnCode: '711311', purity: { name: '22K' } }, pcs: 1, grossWeight: 10.5, netWeight: 9.8, totalAmount: 68110 },
        ],
        taxableAmount: 68110,
      },
    });

    renderList();
    await waitFor(() => {
      expect(screen.getAllByTitle('Print Voucher').length).toBe(2);
    });

    // Click first row's print button
    fireEvent.click(screen.getAllByTitle('Print Voucher')[0]);

    // Dialog should appear
    await waitFor(() => {
      expect(screen.getByText(/Voucher Print/)).toBeInTheDocument();
    });
  });

  it('does not navigate when print button is clicked (stopPropagation)', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getAllByTitle('Print Voucher').length).toBe(2);
    });

    fireEvent.click(screen.getAllByTitle('Print Voucher')[0]);

    // Navigate should NOT have been called
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// Voucher Cancel
// ════════════════════════════════════════════════════════════

import toast from 'react-hot-toast';
const mockCancel = salesAPI.cancel as ReturnType<typeof vi.fn>;

describe('SalesEntryList voucher cancel', () => {
  it('shows cancel button only for ACTIVE vouchers', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeDefined();
    });

    // VOUCHER_1 is ACTIVE → cancel button should exist
    expect(screen.getByTestId('cancel-btn-1')).toBeDefined();

    // VOUCHER_2 is CANCELLED → no cancel button
    expect(screen.queryByTestId('cancel-btn-2')).toBeNull();
  });

  it('opens confirmation dialog on cancel button click', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByTestId('cancel-btn-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('cancel-btn-1'));

    await waitFor(() => {
      expect(screen.getByTestId('cancel-dialog')).toBeDefined();
      expect(screen.getByText('Cancel Voucher')).toBeDefined();
      expect(screen.getByText('Yes, Cancel')).toBeDefined();
      expect(screen.getByText('No, Keep It')).toBeDefined();
    });
  });

  it('closes confirmation dialog on "No, Keep It" click', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByTestId('cancel-btn-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('cancel-btn-1'));

    await waitFor(() => {
      expect(screen.getByTestId('cancel-dialog')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('cancel-dialog-no'));

    await waitFor(() => {
      expect(screen.queryByTestId('cancel-dialog')).toBeNull();
    });
  });

  it('calls salesAPI.cancel and shows success toast on confirm', async () => {
    mockCancel.mockResolvedValue({ data: { message: 'Voucher cancelled' } });
    renderList();
    await waitFor(() => {
      expect(screen.getByTestId('cancel-btn-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('cancel-btn-1'));

    await waitFor(() => {
      expect(screen.getByTestId('cancel-dialog-yes')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('cancel-dialog-yes'));

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledWith(1);
      expect((toast.success as any)).toHaveBeenCalledWith('Voucher cancelled successfully');
    });
  });

  it('shows error toast when cancel fails', async () => {
    mockCancel.mockRejectedValue(new Error('Server error'));
    renderList();
    await waitFor(() => {
      expect(screen.getByTestId('cancel-btn-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('cancel-btn-1'));

    await waitFor(() => {
      expect(screen.getByTestId('cancel-dialog-yes')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('cancel-dialog-yes'));

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledWith(1);
      expect((toast.error as any)).toHaveBeenCalledWith('Failed to cancel voucher');
    });
  });

  it('does not navigate when cancel button is clicked', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByTestId('cancel-btn-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('cancel-btn-1'));

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
