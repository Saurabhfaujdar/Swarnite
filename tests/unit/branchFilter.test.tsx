// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── Mock auth store ────────────────────────────────────────
const mockUser = { branch: { isMaster: true } };
vi.mock('../../src/lib/auth', () => ({
  useAuthStore: (selector: Function) => selector({ user: mockUser }),
}));

// ── Mock react-query ───────────────────────────────────────
let mockBranches: any[] | undefined = undefined;
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: any) => ({ data: mockBranches }),
}));

// ── Mock api ───────────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  reportsAPI: { branches: vi.fn() },
}));

import BranchFilter from '../../src/components/BranchFilter';

describe('BranchFilter', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.branch = { isMaster: true };
    mockBranches = [
      { id: 1, name: 'Main' },
      { id: 2, name: 'Branch A' },
      { id: 3, name: 'Branch B' },
    ];
  });

  it('renders branch dropdown for master user', () => {
    render(<BranchFilter value="" onChange={onChange} />);
    expect(screen.getByText('All Branches')).toBeDefined();
    expect(screen.getByText('Branch A')).toBeDefined();
    expect(screen.getByText('Branch B')).toBeDefined();
  });

  it('renders nothing for non-master user', () => {
    mockUser.branch = { isMaster: false };
    const { container } = render(<BranchFilter value="" onChange={onChange} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when only one branch', () => {
    mockBranches = [{ id: 1, name: 'Main' }];
    const { container } = render(<BranchFilter value="" onChange={onChange} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when branches not loaded', () => {
    mockBranches = undefined;
    const { container } = render(<BranchFilter value="" onChange={onChange} />);
    expect(container.innerHTML).toBe('');
  });

  it('calls onChange when branch selected', async () => {
    render(<BranchFilter value="" onChange={onChange} />);
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, '2');
    expect(onChange).toHaveBeenCalledWith('2');
  });

  it('shows selected branch value', () => {
    render(<BranchFilter value="3" onChange={onChange} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('3');
  });
});
