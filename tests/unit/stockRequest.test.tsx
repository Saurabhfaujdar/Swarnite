import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── Mock react-router-dom ──────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ── Mock api module ────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  stockRequestAPI: {
    branches: vi.fn(),
    browse: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  },
}));

// ── Mock auth store ────────────────────────────────────────
vi.mock('../../src/lib/auth', () => ({
  useAuthStore: vi.fn((selector: any) =>
    selector({
      user: { id: 1, branchId: 1, role: 'ADMIN', username: 'admin' },
      token: 'test-token',
    }),
  ),
}));

// ── Mock react-hot-toast ───────────────────────────────────
vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

import { stockRequestAPI } from '../../src/lib/api';
import toast from 'react-hot-toast';
import StockRequestPage from '../../src/pages/Branch/StockRequest';

const mockBranches = stockRequestAPI.branches as ReturnType<typeof vi.fn>;
const mockBrowse = stockRequestAPI.browse as ReturnType<typeof vi.fn>;
const mockList = stockRequestAPI.list as ReturnType<typeof vi.fn>;
const mockCreate = stockRequestAPI.create as ReturnType<typeof vi.fn>;
const mockApprove = stockRequestAPI.approve as ReturnType<typeof vi.fn>;
const mockReject = stockRequestAPI.reject as ReturnType<typeof vi.fn>;

// ── Test Data ────────────────────────────────────────────
const BRANCHES = {
  data: {
    branches: [
      { id: 1, name: 'Main Branch', code: 'MB' },
      { id: 2, name: 'Sub Branch', code: 'SB' },
    ],
  },
};

const BROWSE_LABELS = {
  data: {
    labels: [
      {
        id: 10, labelNo: 'LBL-001', grossWeight: 15.5, netWeight: 14.0, pcsCount: 1, status: 'IN_STOCK',
        item: { name: 'Gold Ring', itemGroup: { name: 'Rings' }, purity: { name: '22K' } },
        branch: { id: 2, name: 'Sub Branch', code: 'SB' },
      },
      {
        id: 11, labelNo: 'LBL-002', grossWeight: 25.0, netWeight: 23.5, pcsCount: 1, status: 'IN_STOCK',
        item: { name: 'Gold Chain', itemGroup: { name: 'Chains' }, purity: { name: '22K' } },
        branch: { id: 2, name: 'Sub Branch', code: 'SB' },
      },
    ],
    total: 2,
  },
};

const OUTGOING_REQUESTS = {
  data: {
    requests: [
      {
        id: 100, requestNo: 'SR/1', requestDate: '2026-04-18', status: 'PENDING',
        totalPcs: 2, totalGrossWeight: 40.5, narration: null,
        requestingBranch: { id: 1, name: 'Main Branch', code: 'MB' },
        sourceBranch: { id: 2, name: 'Sub Branch', code: 'SB' },
        items: [
          { id: 1, labelNo: 'LBL-001', itemName: 'Gold Ring', grossWeight: 15.5, netWeight: 14.0, pcs: 1, purityName: '22K' },
        ],
      },
    ],
  },
};

const INCOMING_REQUESTS = {
  data: {
    requests: [
      {
        id: 200, requestNo: 'SR/2', requestDate: '2026-04-17', status: 'PENDING',
        totalPcs: 1, totalGrossWeight: 10.0, narration: 'Urgent',
        requestingBranch: { id: 2, name: 'Sub Branch', code: 'SB' },
        sourceBranch: { id: 1, name: 'Main Branch', code: 'MB' },
        items: [
          { id: 3, labelNo: 'LBL-010', itemName: 'Gold Bangle', grossWeight: 10.0, netWeight: 9.5, pcs: 1, purityName: '22K' },
        ],
      },
    ],
  },
};

function renderPage() {
  mockBranches.mockResolvedValue(BRANCHES);
  return render(<StockRequestPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ══════════════════════════════════════════════════════════
// Rendering & Tab Navigation
// ══════════════════════════════════════════════════════════
describe('StockRequestPage', () => {
  it('renders the page title and tabs', async () => {
    renderPage();

    expect(screen.getByText('Stock Requests')).toBeInTheDocument();
    expect(screen.getByText('Browse Stock')).toBeInTheDocument();
    expect(screen.getByText('My Requests')).toBeInTheDocument();
    expect(screen.getByText('Incoming Requests')).toBeInTheDocument();
  });

  it('shows empty state when no branch selected', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/select a branch/i)).toBeInTheDocument();
    });
  });

  it('filters out own branch from dropdown', async () => {
    renderPage();

    await waitFor(() => {
      // Only Sub Branch should be in the dropdown (own branch filtered)
      expect(screen.getByText('Sub Branch (SB)')).toBeInTheDocument();
      expect(screen.queryByText('Main Branch (MB)')).not.toBeInTheDocument();
    });
  });
});

// ══════════════════════════════════════════════════════════
// Browse Stock Tab
// ══════════════════════════════════════════════════════════
describe('Browse Stock Tab', () => {
  it('loads and displays labels when branch selected', async () => {
    mockBrowse.mockResolvedValue(BROWSE_LABELS);
    renderPage();

    await waitFor(() => expect(screen.getByText('Sub Branch (SB)')).toBeInTheDocument());

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '2' } });

    await waitFor(() => {
      expect(screen.getByText('LBL-001')).toBeInTheDocument();
      expect(screen.getByText('LBL-002')).toBeInTheDocument();
      expect(screen.getByText('Gold Ring')).toBeInTheDocument();
      expect(screen.getByText('Gold Chain')).toBeInTheDocument();
    });
  });

  it('shows item count', async () => {
    mockBrowse.mockResolvedValue(BROWSE_LABELS);
    renderPage();

    await waitFor(() => expect(screen.getByText('Sub Branch (SB)')).toBeInTheDocument());

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '2' } });

    await waitFor(() => {
      expect(screen.getByText(/2 items in stock/i)).toBeInTheDocument();
    });
  });

  it('shows request panel when items selected', async () => {
    mockBrowse.mockResolvedValue(BROWSE_LABELS);
    renderPage();

    await waitFor(() => expect(screen.getByText('Sub Branch (SB)')).toBeInTheDocument());

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });

    await waitFor(() => expect(screen.getByText('LBL-001')).toBeInTheDocument());

    // Click on a row to select
    fireEvent.click(screen.getByText('LBL-001'));

    await waitFor(() => {
      expect(screen.getByText(/1 item\(s\) selected/)).toBeInTheDocument();
      expect(screen.getByText('Request Items')).toBeInTheDocument();
    });
  });

  it('submits stock request', async () => {
    mockBrowse.mockResolvedValue(BROWSE_LABELS);
    mockCreate.mockResolvedValue({ data: { id: 100 } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Sub Branch (SB)')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });

    await waitFor(() => expect(screen.getByText('LBL-001')).toBeInTheDocument());
    fireEvent.click(screen.getByText('LBL-001'));

    await waitFor(() => expect(screen.getByText('Request Items')).toBeInTheDocument());

    // Reset browse mock for refetch after submit
    mockBrowse.mockResolvedValue(BROWSE_LABELS);

    fireEvent.click(screen.getByText('Request Items'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceBranchId: 2,
          items: [{ labelId: 10 }],
        }),
      );
      expect(toast.success).toHaveBeenCalledWith('Stock request sent!');
    });
  });

  it('shows error toast on failed request', async () => {
    mockBrowse.mockResolvedValue(BROWSE_LABELS);
    mockCreate.mockRejectedValue({ response: { data: { error: 'Label not available' } } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Sub Branch (SB)')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });

    await waitFor(() => expect(screen.getByText('LBL-001')).toBeInTheDocument());
    fireEvent.click(screen.getByText('LBL-001'));
    await waitFor(() => expect(screen.getByText('Request Items')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Request Items'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Label not available');
    });
  });
});

// ══════════════════════════════════════════════════════════
// My Requests Tab (Outgoing)
// ══════════════════════════════════════════════════════════
describe('My Requests Tab', () => {
  it('loads outgoing requests on tab click', async () => {
    mockList.mockResolvedValue(OUTGOING_REQUESTS);
    renderPage();

    fireEvent.click(screen.getByText('My Requests'));

    await waitFor(() => {
      expect(screen.getByText('SR/1')).toBeInTheDocument();
      expect(screen.getByText('Sub Branch')).toBeInTheDocument();
      expect(screen.getByText('PENDING')).toBeInTheDocument();
    });

    expect(mockList).toHaveBeenCalledWith({ direction: 'outgoing' });
  });

  it('expands request to show items', async () => {
    mockList.mockResolvedValue(OUTGOING_REQUESTS);
    renderPage();

    fireEvent.click(screen.getByText('My Requests'));
    await waitFor(() => expect(screen.getByText('SR/1')).toBeInTheDocument());

    fireEvent.click(screen.getByText('SR/1'));

    await waitFor(() => {
      expect(screen.getByText('LBL-001')).toBeInTheDocument();
      expect(screen.getByText('Gold Ring')).toBeInTheDocument();
    });
  });
});

// ══════════════════════════════════════════════════════════
// Incoming Requests Tab
// ══════════════════════════════════════════════════════════
describe('Incoming Requests Tab', () => {
  it('loads incoming requests with action buttons', async () => {
    mockList.mockResolvedValue(INCOMING_REQUESTS);
    renderPage();

    fireEvent.click(screen.getByText('Incoming Requests'));

    await waitFor(() => {
      expect(screen.getByText('SR/2')).toBeInTheDocument();
      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });

    expect(mockList).toHaveBeenCalledWith({ direction: 'incoming' });
  });

  it('approves a request', async () => {
    mockList.mockResolvedValue(INCOMING_REQUESTS);
    mockApprove.mockResolvedValue({ data: {} });
    renderPage();

    fireEvent.click(screen.getByText('Incoming Requests'));
    await waitFor(() => expect(screen.getByText('Approve')).toBeInTheDocument());

    // Re-mock for refetch after approve
    mockList.mockResolvedValue({ data: { requests: [] } });

    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith(200);
      expect(toast.success).toHaveBeenCalledWith('Request approved — stock transferred');
    });
  });

  it('opens reject dialog and rejects with reason', async () => {
    mockList.mockResolvedValue(INCOMING_REQUESTS);
    mockReject.mockResolvedValue({ data: {} });
    renderPage();

    fireEvent.click(screen.getByText('Incoming Requests'));
    await waitFor(() => expect(screen.getByText('Reject')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Reject'));

    await waitFor(() => {
      expect(screen.getByText('Reject Stock Request?')).toBeInTheDocument();
    });

    const reasonInput = screen.getByPlaceholderText(/items needed/i);
    fireEvent.change(reasonInput, { target: { value: 'Stock needed here' } });

    // Re-mock for refetch after reject
    mockList.mockResolvedValue({ data: { requests: [] } });

    // Click the Reject button in the dialog (not the table one)
    const rejectButtons = screen.getAllByText('Reject');
    fireEvent.click(rejectButtons[rejectButtons.length - 1]); // dialog button is last

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith(200, 'Stock needed here');
      expect(toast.success).toHaveBeenCalledWith('Request rejected');
    });
  });

  it('cancels reject dialog', async () => {
    mockList.mockResolvedValue(INCOMING_REQUESTS);
    renderPage();

    fireEvent.click(screen.getByText('Incoming Requests'));
    await waitFor(() => expect(screen.getByText('Reject')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => expect(screen.getByText('Reject Stock Request?')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Reject Stock Request?')).not.toBeInTheDocument();
    });
  });

  it('shows no requests message when empty', async () => {
    mockList.mockResolvedValue({ data: { requests: [] } });
    renderPage();

    fireEvent.click(screen.getByText('Incoming Requests'));

    await waitFor(() => {
      expect(screen.getByText('No requests found')).toBeInTheDocument();
    });
  });
});
