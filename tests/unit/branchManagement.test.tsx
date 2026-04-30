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
    branchUsers: vi.fn(),
    createBranchUser: vi.fn(),
    updateBranchUser: vi.fn(),
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

// ════════════════════════════════════════════════════════════
// STORE HIERARCHY — MASTER BRANCH RENDERING
// ════════════════════════════════════════════════════════════
describe('BranchManagement — Store Hierarchy', () => {
  it('renders Store Hierarchy heading', async () => {
    render(<BranchManagement />);
    await waitFor(() => {
      expect(screen.getByText('Store Hierarchy')).toBeInTheDocument();
    });
  });

  it('promotes the natural root when no row has isMaster=true (regression for prod data)', async () => {
    // All branches come back with isMaster=false — the production
    // payload shape when the 20260423 branch-fix migration hasn't
    // been applied. The Store Hierarchy must still render the root
    // (parentId == null) as the master so the panel isn't empty.
    mockList.mockResolvedValue({
      data: {
        branches: [
          { ...MASTER, isMaster: false, branchType: 'BRANCH' },
          CHILD1,
        ],
        total: 2,
      },
    });

    render(<BranchManagement />);
    await waitFor(() => {
      expect(screen.getByText('Store Hierarchy')).toBeInTheDocument();
    });

    // The natural root (Main Store, parentId=null) is promoted to
    // master and gets the MASTER badge via the client-side fallback.
    expect(screen.getByText('Main Store')).toBeInTheDocument();
    expect(screen.getByText('MASTER')).toBeInTheDocument();
  });

  it('renders master with MASTER badge when isMaster=true', async () => {
    render(<BranchManagement />);
    await waitFor(() => {
      expect(screen.getByText('Main Store')).toBeInTheDocument();
      expect(screen.getByText('MASTER')).toBeInTheDocument();
      expect(screen.getByText('(MAIN)')).toBeInTheDocument();
    });
  });

  it('shows children under master when expanded', async () => {
    mockList.mockResolvedValue({
      data: {
        branches: [
          MASTER,
          CHILD1,
          { ...DISABLED_CHILD },
        ],
        total: 3,
      },
    });

    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Main Store')).toBeInTheDocument();
    });

    // Expand master
    const masterRow = screen.getByText('Main Store').closest('[class*="cursor-pointer"]')!;
    const expandBtn = within(masterRow as HTMLElement).getAllByRole('button')[0];
    await user.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByText('Pune Branch')).toBeInTheDocument();
      expect(screen.getByText('Closed Branch')).toBeInTheDocument();
    });
  });

  it('shows Disabled badge for inactive branches', async () => {
    mockList.mockResolvedValue({
      data: { branches: [MASTER, DISABLED_CHILD], total: 2 },
    });

    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Main Store')).toBeInTheDocument();
    });

    // Expand master
    const masterRow = screen.getByText('Main Store').closest('[class*="cursor-pointer"]')!;
    const expandBtn = within(masterRow as HTMLElement).getAllByRole('button')[0];
    await user.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('shows "No branch stores yet" when no children exist', async () => {
    mockList.mockResolvedValue({
      data: { branches: [MASTER], total: 1 },
    });

    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Main Store')).toBeInTheDocument();
    });

    // Expand master
    const masterRow = screen.getByText('Main Store').closest('[class*="cursor-pointer"]')!;
    const expandBtn = within(masterRow as HTMLElement).getAllByRole('button')[0];
    await user.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByText('No branch stores yet')).toBeInTheDocument();
    });
  });
});

// ════════════════════════════════════════════════════════════
// CREATE BRANCH WITH USER CREDENTIALS
// ════════════════════════════════════════════════════════════
describe('BranchManagement — Create Branch with User', () => {
  it('shows optional user credentials section in create dialog', async () => {
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('New Branch')).toBeInTheDocument();
    });
    await user.click(screen.getByText('New Branch'));

    await waitFor(() => {
      expect(screen.getByText('Branch Login Credentials (optional)')).toBeInTheDocument();
      expect(screen.getByText('Username')).toBeInTheDocument();
      expect(screen.getByText('Password')).toBeInTheDocument();
    });
  });
});

// ════════════════════════════════════════════════════════════
// MASTER FALLBACK — handles legacy data missing the isMaster flag
// ════════════════════════════════════════════════════════════
//
// Production has rows that pre-date the 20260423 branch-fix migration:
// every branch has `isMaster=false` and no parent. With the old code
// `branches.find(b => b.isMaster)` returned undefined and the entire
// Store Hierarchy panel rendered nothing. The component now falls
// back to the natural root (parentId === null, then branches[0]).
describe('BranchManagement — Store Hierarchy fallback when isMaster is missing', () => {
  // Mirrors the actual production payload the user shared (single
  // branch, isMaster=false, parentId=null, branchType=BRANCH).
  const LEGACY_HQ = {
    id: 1, name: 'Main Branch', code: 'HQ', branchType: 'BRANCH',
    isMaster: false, parentId: null, isActive: true, isDeleted: false,
    companyId: 1, city: 'Mumbai', state: 'Maharashtra',
    company: { id: 1, name: 'JAIGURU JEWELS LLP' },
    parent: null,
    _count: { children: 0, users: 2, labels: 11, salesVouchers: 8 },
  };
  const LEGACY_CHILD = {
    id: 2, name: 'Pune Branch', code: 'PUN', branchType: 'BRANCH',
    isMaster: false, parentId: 1, isActive: true, isDeleted: false,
    companyId: 1, city: 'Pune',
    parent: { id: 1, name: 'Main Branch', code: 'HQ' },
    company: { id: 1, name: 'JAIGURU JEWELS LLP' },
  };

  it('renders the root branch even when no row has isMaster=true', async () => {
    mockList.mockResolvedValue({ data: { branches: [LEGACY_HQ], total: 1 } });
    render(<BranchManagement />);

    // Store Hierarchy panel must NOT be empty; the legacy HQ row
    // should be promoted to the master slot via the parentId fallback.
    await waitFor(() => {
      expect(screen.getByText('Main Branch')).toBeInTheDocument();
    });
    expect(screen.getByText('Store Hierarchy')).toBeInTheDocument();
    expect(screen.getByText('MASTER')).toBeInTheDocument();
  });

  it('treats every other row as a child of the fallback master', async () => {
    mockList.mockResolvedValue({
      data: { branches: [LEGACY_HQ, LEGACY_CHILD], total: 2 },
    });
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Main Branch')).toBeInTheDocument();
    });

    // Expand the (fallback) master row.
    const masterRow = screen.getByText('Main Branch').closest('[class*="cursor-pointer"]')!;
    const expandBtn = within(masterRow as HTMLElement).getAllByRole('button')[0];
    await user.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByText('Pune Branch')).toBeInTheDocument();
    });
  });

  it('does NOT render the master twice when it is also the only row', async () => {
    mockList.mockResolvedValue({ data: { branches: [LEGACY_HQ], total: 1 } });
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Main Branch')).toBeInTheDocument();
    });
    // The single row appears once as the master; it must not also
    // appear inside its own child list.
    expect(screen.getAllByText('Main Branch')).toHaveLength(1);
  });

  it('still prefers an explicitly-flagged master over the parentId fallback', async () => {
    // A child has parentId=null (bad data) but another row IS flagged
    // master — the flagged one must win so the tree doesn't invert.
    const REAL_MASTER = { ...LEGACY_HQ, id: 10, name: 'Real HQ', isMaster: true, parentId: null };
    const ORPHAN = { ...LEGACY_HQ, id: 11, name: 'Orphan Row', isMaster: false, parentId: null };
    mockList.mockResolvedValue({
      data: { branches: [ORPHAN, REAL_MASTER], total: 2 },
    });
    const user = userEvent.setup();
    render(<BranchManagement />);

    await waitFor(() => {
      expect(screen.getByText('Real HQ')).toBeInTheDocument();
    });

    // Real HQ holds the MASTER badge; orphan is treated as a child.
    const masterRow = screen.getByText('Real HQ').closest('[class*="cursor-pointer"]')!;
    expect(within(masterRow as HTMLElement).getByText('MASTER')).toBeInTheDocument();

    const expandBtn = within(masterRow as HTMLElement).getAllByRole('button')[0];
    await user.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByText('Orphan Row')).toBeInTheDocument();
    });
  });
});
