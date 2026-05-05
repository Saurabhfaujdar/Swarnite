// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

/**
 * Sidebar reminder badge: when the user's branch has incoming PENDING
 * stock-transfer requests, the "Stock Requests" nav item must show a
 * red counter so staff are reminded to act on them.
 */

// ── API mock — only stockRequestAPI.pendingCount is exercised here ──
const mockPendingCount = vi.fn();
vi.mock('../../src/lib/api', () => ({
  stockRequestAPI: { pendingCount: (...args: any[]) => mockPendingCount(...args) },
  savingsSchemeAPI: { dueReminders: vi.fn().mockResolvedValue({ data: { total: 0 } }) },
}));

// ── Auth mock so the query is enabled ────────────────────────────────
vi.mock('../../src/lib/auth', () => ({
  useAuthStore: (selector: any) =>
    selector({
      user: { id: 1, fullName: 'Tester', branch: { name: 'Main' } },
      logout: vi.fn(),
    }),
}));

// ── utils mock (only getFinancialYear is used) ───────────────────────
vi.mock('../../src/lib/utils', () => ({
  getFinancialYear: () => '2026-2027',
}));

import Layout from '../../src/components/Layout/Layout';

function renderLayout() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<div>home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Layout — Stock Requests pending badge', () => {
  beforeEach(() => {
    mockPendingCount.mockReset();
  });

  it('renders a badge with the incoming count when > 0', async () => {
    mockPendingCount.mockResolvedValue({ data: { incoming: 4, outgoing: 1 } });

    renderLayout();

    const badge = await screen.findByTestId('stock-requests-badge');
    expect(badge).toHaveTextContent('4');
    // Tooltip / a11y label uses the pluralised wording
    expect(badge).toHaveAttribute('title', expect.stringMatching(/4 pending/i));
  });

  it('does NOT render a badge when there are no incoming requests', async () => {
    mockPendingCount.mockResolvedValue({ data: { incoming: 0, outgoing: 7 } });

    renderLayout();

    // Wait one tick so the query resolves
    await waitFor(() => expect(mockPendingCount).toHaveBeenCalled());
    expect(screen.queryByTestId('stock-requests-badge')).not.toBeInTheDocument();
  });

  it('caps the badge label at 99+ for very large queues', async () => {
    mockPendingCount.mockResolvedValue({ data: { incoming: 250, outgoing: 0 } });

    renderLayout();

    const badge = await screen.findByTestId('stock-requests-badge');
    expect(badge).toHaveTextContent('99+');
  });

  it('hides the badge gracefully if the count endpoint errors out', async () => {
    mockPendingCount.mockRejectedValue(new Error('boom'));

    renderLayout();

    await waitFor(() => expect(mockPendingCount).toHaveBeenCalled());
    expect(screen.queryByTestId('stock-requests-badge')).not.toBeInTheDocument();
    // Sidebar still renders (sanity)
    expect(screen.getByText('Stock Requests')).toBeInTheDocument();
  });
});
