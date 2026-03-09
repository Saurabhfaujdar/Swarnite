// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  inventoryAPI: {
    labels: vi.fn(),
  },
}));

// ── Mock react-hot-toast ───────────────────────────────────
vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

import { inventoryAPI } from '../../src/lib/api';
import LabelEntryList from '../../src/pages/Inventory/LabelEntryList';

const mockLabels = inventoryAPI.labels as ReturnType<typeof vi.fn>;

// ── Sample labels ──────────────────────────────────────────
const LABEL_1 = {
  id: 1,
  labelNo: 'GP/1',
  grossWeight: 5.2,
  netWeight: 4.8,
  pcsCount: 1,
  huid: 'HU123',
  size: null,
  counterCode: 'C1',
  status: 'IN_STOCK',
  createdAt: '2026-03-07T21:09:38.847Z',
  item: {
    name: 'Gold Pendant 22KT',
    metalType: { name: 'Gold' },
    purity: { code: '22KT' },
  },
  branch: { name: 'Main' },
};

const LABEL_2 = {
  ...LABEL_1,
  id: 2,
  labelNo: 'GN/51',
  grossWeight: 10.5,
  netWeight: 9.8,
  status: 'SOLD',
  createdAt: '2026-03-06T10:00:00.000Z',
  item: {
    name: 'Gold Necklace 22KT',
    metalType: { name: 'Gold' },
    purity: { code: '22KT' },
  },
};

// ── Helper ──────────────────────────────────────────────────
function renderList(labels = [LABEL_1, LABEL_2], total = labels.length) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  mockLabels.mockResolvedValue({
    data: { labels, total },
  });

  return render(
    <QueryClientProvider client={qc}>
      <LabelEntryList />
    </QueryClientProvider>,
  );
}

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// Critical bug regression: dateFrom must default to empty
// ════════════════════════════════════════════════════════════
describe('LabelEntryList date filter defaults', () => {
  it('dateFrom defaults to empty so labels from all dates are shown', async () => {
    renderList();
    await waitFor(() => {
      expect(mockLabels).toHaveBeenCalled();
    });

    const params = mockLabels.mock.calls[0][0];
    // dateFrom must be empty/falsy — NOT today's date
    expect(params.dateFrom).toBe('');
  });

  it('dateTo defaults to today', async () => {
    renderList();
    await waitFor(() => {
      expect(mockLabels).toHaveBeenCalled();
    });

    const params = mockLabels.mock.calls[0][0];
    const today = new Date().toISOString().split('T')[0];
    expect(params.dateTo).toBe(today);
  });

  it('status ALL does not send status param', async () => {
    renderList();
    await waitFor(() => {
      expect(mockLabels).toHaveBeenCalled();
    });

    const params = mockLabels.mock.calls[0][0];
    expect(params.status).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════
// Rendering
// ════════════════════════════════════════════════════════════
describe('LabelEntryList rendering', () => {
  it('renders the Label / SKU List header', () => {
    renderList();
    expect(screen.getByText('Label / SKU List')).toBeDefined();
  });

  it('renders label rows after loading', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText('GP/1')).toBeDefined();
      expect(screen.getByText('GN/51')).toBeDefined();
    });
  });

  it('shows No labels found when list is empty', async () => {
    renderList([], 0);
    await waitFor(() =>
      expect(screen.getByText('No labels found')).toBeDefined(),
    );
  });

  it('renders column headers', () => {
    renderList();
    expect(screen.getByText('Sr.')).toBeDefined();
    expect(screen.getByText('Label No')).toBeDefined();
    expect(screen.getByText('Item Name')).toBeDefined();
    expect(screen.getByText('Metal')).toBeDefined();
    expect(screen.getByText('Purity')).toBeDefined();
    expect(screen.getByText('HUID')).toBeDefined();
    expect(screen.getByText('Counter')).toBeDefined();
    expect(screen.getByText('Branch')).toBeDefined();
  });

  it('renders status badges', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText('IN_STOCK')).toBeDefined();
      expect(screen.getByText('SOLD')).toBeDefined();
    });
  });

  it('renders footer totals when labels exist', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText(/Total \(2 labels\)/)).toBeDefined();
    });
  });

  it('renders + New Label button', () => {
    renderList();
    expect(screen.getByText('+ New Label')).toBeDefined();
  });

  it('renders Export Excel and Print buttons', () => {
    renderList();
    expect(screen.getByText(/Export Excel/)).toBeDefined();
    expect(screen.getByText(/Print/)).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════
// Filter controls
// ════════════════════════════════════════════════════════════
describe('LabelEntryList filter controls', () => {
  it('renders status dropdown with all options', () => {
    renderList();
    const statusSelect = screen.getByDisplayValue('All') as HTMLSelectElement;
    const options = statusSelect.querySelectorAll('option');
    expect(options.length).toBe(5); // All, In Stock, Sold, On Approval, Transferred
  });

  it('renders search input', () => {
    renderList();
    expect(screen.getByPlaceholderText('Label No / Item...')).toBeDefined();
  });

  it('renders Search button', () => {
    renderList();
    expect(screen.getByText(/🔍 Search/)).toBeDefined();
  });

  it('changing status filter updates the value', async () => {
    renderList();
    const user = userEvent.setup();
    const select = screen.getByDisplayValue('All') as HTMLSelectElement;
    await user.selectOptions(select, 'SOLD');
    expect(select.value).toBe('SOLD');
  });

  it('typing in search input updates value', async () => {
    renderList();
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Label No / Item...') as HTMLInputElement;
    await user.type(input, 'GP/1');
    expect(input.value).toBe('GP/1');
  });
});

// ════════════════════════════════════════════════════════════
// Navigation
// ════════════════════════════════════════════════════════════
describe('LabelEntryList navigation', () => {
  it('navigates to new label page on + New Label click', async () => {
    renderList();
    const user = userEvent.setup();
    await user.click(screen.getByText('+ New Label'));
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/labels/new');
  });
});
