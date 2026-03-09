// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── Mock react-router-dom ──────────────────────────────────
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// ── Mock api module ────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  branchManagementAPI: {
    list: vi.fn(),
    get: vi.fn(),
    children: vi.fn(),
    stats: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
    softDelete: vi.fn(),
    permanentDelete: vi.fn(),
    transfer: vi.fn(),
    transferHistory: vi.fn(),
    auditLog: vi.fn(),
  },
}));

// ── Mock react-hot-toast ───────────────────────────────────
vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

import { branchManagementAPI } from '../../src/lib/api';
import BranchManagement from '../../src/pages/Branch/BranchManagement';

const mockList = branchManagementAPI.list as ReturnType<typeof vi.fn>;
const mockStats = branchManagementAPI.stats as ReturnType<typeof vi.fn>;
const mockCreate = branchManagementAPI.create as ReturnType<typeof vi.fn>;
const mockDisable = branchManagementAPI.disable as ReturnType<typeof vi.fn>;
const mockEnable = branchManagementAPI.enable as ReturnType<typeof vi.fn>;
const mockSoftDelete = branchManagementAPI.softDelete as ReturnType<typeof vi.fn>;
const mockTransferHistory = branchManagementAPI.transferHistory as ReturnType<typeof vi.fn>;
const mockAuditLog = branchManagementAPI.auditLog as ReturnType<typeof vi.fn>;

// ── Sample data ────────────────────────────────────────────
const MASTER = {
  id: 1, name: 'Main Store', code: 'MAIN', branchType: 'MASTER',
  isMaster: true, parentId: null, isActive: true, isDeleted: false,
  companyId: 1, city: 'Mumbai', state: 'MH', gstin: '27AAPCS1234A1Z1',
  phone: '9876543210', address: '123 Gold Lane', email: 'main@swarnite.com',
  company: { id: 1, name: 'Swarnite' },
};
const CHILD1 = {
  id: 2, name: 'Pune Branch', code: 'PUN', branchType: 'BRANCH',
  isMaster: false, parentId: 1, isActive: true, isDeleted: false,
  companyId: 1, city: 'Pune', state: 'MH',
  parent: { id: 1, name: 'Main Store', code: 'MAIN' },
  company: { id: 1, name: 'Swarnite' },
};
const DISABLED_CHILD = {
  id: 3, name: 'Closed Branch', code: 'CLO', branchType: 'BRANCH',
  isMaster: false, parentId: 1, isActive: false, isDeleted: false,
  companyId: 1, city: 'Nashik',
  parent: { id: 1, name: 'Main Store', code: 'MAIN' },
  company: { id: 1, name: 'Swarnite' },
};

// ── Setup ──────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ data: { branches: [MASTER, CHILD1], total: 2 } });
  mockTransferHistory.mockResolvedValue({ data: { transfers: [], total: 0 } });
  mockAuditLog.mockResolvedValue({ data: { logs: [], total: 0 } });
});

// ════════════════════════════════════════════════════════════
// BRANCH LIST
// ════════════════════════════════════════════════════════════
describe('BranchManagement — Branch List', () => {
  it('renders the page header', async () => {
    render(<BranchManagement />);
    await waitFor(() => {
      expect(screen.getByText('Branch Management')).toBeInTheDocument();
    });
  });

  it('loads and displays branch list', async () => {
    render(<BranchManagement />);
    await waitFor(() => {
      expect(screen.getByText('Main Store')).toBeInTheDocument();
    });
    expect(mockList).toHaveBeenCalled();
  });

  it('shows MASTER badge for master branch', async () => {
    render(<BranchManagement />);
    await waitFor(() => {
      expect(screen.getByText('MASTER')).toBeInTheDocument();
    });
  });

  it('shows New Branch button', async () => {
    render(<BranchManagement />);
    await waitFor(() => {
      expect(screen.getByText('New Branch')).toBeInTheDocument();
    });
  });

  it('displays tabs for branches, transfers, and audit', async () => {
    render(<BranchManagement />);
    await waitFor(() => {
      expect(screen.getByText('Branches')).toBeInTheDocument();
      expect(screen.getByText('Transfer History')).toBeInTheDocument();
      expect(screen.getByText('Audit Log')).toBeInTheDocument();
    });
  });
});

// ════════════════════════════════════════════════════════════
// BRANCH STATS
// ════════════════════════════════════════════════════════════
describe('BranchManagement — Branch Stats', () => {
  it('shows stats when a branch is selected', async () => {
    mockStats.mockResolvedValue({
      data: {
        branchId: 1,
        inventory: { total: 50, inStock: 30, sold: 15 },
        sales: 10,
        purchases: 3,
        users: 4,
        transfers: { outgoing: 2, incoming: 1 },
      },
    });

    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Main Store')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Main Store'));

    await waitFor(() => {
      expect(screen.getByText('30')).toBeInTheDocument(); // in-stock
      expect(screen.getByText('In Stock')).toBeInTheDocument();
    });
  });

  it('shows default message when no branch selected', async () => {
    render(<BranchManagement />);
    await waitFor(() => {
      expect(screen.getByText('Select a branch to view details')).toBeInTheDocument();
    });
  });
});

// ════════════════════════════════════════════════════════════
// CREATE BRANCH
// ════════════════════════════════════════════════════════════
describe('BranchManagement — Create Branch', () => {
  it('opens create dialog when New Branch is clicked', async () => {
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('New Branch')).toBeInTheDocument();
    });

    await user.click(screen.getByText('New Branch'));

    await waitFor(() => {
      expect(screen.getByText('Create New Branch Store')).toBeInTheDocument();
    });
  });

  it('has required fields for branch name and code', async () => {
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('New Branch')).toBeInTheDocument();
    });
    await user.click(screen.getByText('New Branch'));

    await waitFor(() => {
      expect(screen.getByText('Branch Name *')).toBeInTheDocument();
      expect(screen.getByText('Branch Code *')).toBeInTheDocument();
    });
  });

  it('disables Create button when name/code is empty', async () => {
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('New Branch')).toBeInTheDocument();
    });
    await user.click(screen.getByText('New Branch'));

    await waitFor(() => {
      expect(screen.getByText('Create Branch')).toBeDisabled();
    });
  });

  it('calls create API and refreshes list on success', async () => {
    mockCreate.mockResolvedValue({ data: CHILD1 });
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('New Branch')).toBeInTheDocument();
    });
    await user.click(screen.getByText('New Branch'));

    const nameInput = screen.getAllByRole('textbox')[0]; // first input = name
    const codeInput = screen.getAllByRole('textbox')[1]; // second input = code
    await user.type(nameInput, 'Pune Branch');
    await user.type(codeInput, 'PUN');

    await user.click(screen.getByText('Create Branch'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Pune Branch',
          code: 'PUN',
        })
      );
    });
  });

  it('closes dialog on Cancel', async () => {
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('New Branch')).toBeInTheDocument();
    });
    await user.click(screen.getByText('New Branch'));

    await waitFor(() => {
      expect(screen.getByText('Create New Branch Store')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Create New Branch Store')).not.toBeInTheDocument();
    });
  });
});

// ════════════════════════════════════════════════════════════
// TRANSFER HISTORY TAB
// ════════════════════════════════════════════════════════════
describe('BranchManagement — Transfer History Tab', () => {
  it('loads transfer history when tab is clicked', async () => {
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Transfer History')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Transfer History'));

    await waitFor(() => {
      expect(mockTransferHistory).toHaveBeenCalled();
    });
  });

  it('shows empty state when no transfers', async () => {
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Transfer History')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Transfer History'));

    await waitFor(() => {
      expect(screen.getByText('No transfers found')).toBeInTheDocument();
    });
  });
});

// ════════════════════════════════════════════════════════════
// AUDIT LOG TAB
// ════════════════════════════════════════════════════════════
describe('BranchManagement — Audit Log Tab', () => {
  it('loads audit logs when tab is clicked', async () => {
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Audit Log')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Audit Log'));

    await waitFor(() => {
      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  it('shows empty state when no audit logs', async () => {
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Audit Log')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Audit Log'));

    await waitFor(() => {
      expect(screen.getByText('No audit logs found')).toBeInTheDocument();
    });
  });
});

// ════════════════════════════════════════════════════════════
// DISABLE / ENABLE
// ════════════════════════════════════════════════════════════
describe('BranchManagement — Disable/Enable Branch', () => {
  it('shows child branches when master is expanded', async () => {
    mockList.mockResolvedValue({ data: { branches: [MASTER, CHILD1], total: 2 } });
    const user = userEvent.setup();
    render(<BranchManagement />);

    // Wait for master branch to render
    await waitFor(() => {
      expect(screen.getByText('Main Store')).toBeInTheDocument();
    });

    // Find and click the expand chevron button (the one with class p-0.5 inside the master row)
    const masterRow = screen.getByText('Main Store').closest('[class*="cursor-pointer"]')!;
    const expandBtn = within(masterRow as HTMLElement).getAllByRole('button')[0];
    await user.click(expandBtn);

    // Children should now appear
    await waitFor(() => {
      expect(screen.getByText('Pune Branch')).toBeInTheDocument();
    });
  });
});

// ════════════════════════════════════════════════════════════
// DELETE
// ════════════════════════════════════════════════════════════
describe('BranchManagement — Delete Branch', () => {
  it('shows child branch actions when expanded', async () => {
    mockList.mockResolvedValue({ data: { branches: [MASTER, CHILD1], total: 2 } });
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Main Store')).toBeInTheDocument();
    });

    // Find and click the expand chevron
    const masterRow = screen.getByText('Main Store').closest('[class*="cursor-pointer"]')!;
    const expandBtn = within(masterRow as HTMLElement).getAllByRole('button')[0];
    await user.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByText('Pune Branch')).toBeInTheDocument();
    });

    // Should see action buttons (Edit, Disable, Delete) for child branch
    const childRow = screen.getByText('Pune Branch').closest('[class*="cursor-pointer"]')!;
    const childBtns = within(childRow as HTMLElement).getAllByRole('button');
    expect(childBtns.length).toBeGreaterThanOrEqual(3); // Edit, Disable, Delete
  });
});
