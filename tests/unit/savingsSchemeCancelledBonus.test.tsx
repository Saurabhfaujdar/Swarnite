// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

/**
 * SavingsSchemeDetail — bonus is forfeited when the scheme is cancelled.
 *
 * The detail page must NOT show the shop-bonus tile for a CANCELLED
 * scheme, and the third tile should read "Refund Amount" (not
 * "Maturity Value") to reflect that the customer is being refunded
 * exactly what they paid in.
 */

const mockGet = vi.fn();
vi.mock('../../src/lib/api', () => ({
  savingsSchemeAPI: {
    get: (...a: any[]) => mockGet(...a),
    payInstallment: vi.fn(),
    markMissed: vi.fn(),
    redeem: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => {
  const t = vi.fn() as any;
  t.success = vi.fn();
  t.error = vi.fn();
  return { default: t };
});

import SavingsSchemeDetail from '../../src/pages/SavingsScheme/SavingsSchemeDetail';

function renderAt(scheme: any) {
  mockGet.mockResolvedValue({ data: scheme });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/savings-scheme/detail/3']}>
        <Routes>
          <Route path="/savings-scheme/detail/:id" element={<SavingsSchemeDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const baseScheme = {
  id: 3,
  schemeNo: 'SS/3',
  schemeName: 'Gold Savings Scheme',
  startDate: '2026-04-26',
  maturityDate: '2027-03-26',
  durationMonths: 11,
  monthlyAmount: 5000,
  bonusMonths: 1,
  bonusAmount: 5000,
  totalPaidAmount: 15000,
  maturityValue: 20000,
  status: 'ACTIVE',
  account: { name: 'saurabh', mobile: '9999999999' },
  branch: { name: 'Main' },
  installments: [],
};

describe('SavingsSchemeDetail — cancelled scheme tiles', () => {
  beforeEach(() => mockGet.mockReset());

  it('shows the Bonus tile and "Maturity Value" label for an ACTIVE scheme', async () => {
    renderAt({ ...baseScheme, status: 'ACTIVE' });

    await waitFor(() => expect(screen.getByText(/Maturity Value/)).toBeInTheDocument());
    expect(screen.getByText(/Bonus \(1 mo\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Refund Amount/)).not.toBeInTheDocument();
  });

  it('hides the Bonus tile and renames the tile to "Refund Amount" for a CANCELLED scheme', async () => {
    // Server-normalized payload: bonusAmount=0, maturityValue=totalPaidAmount.
    renderAt({
      ...baseScheme,
      status: 'CANCELLED',
      bonusAmount: 0,
      maturityValue: 15000,
    });

    await waitFor(() => expect(screen.getByText(/Refund Amount/)).toBeInTheDocument());
    expect(screen.queryByText(/Bonus \(/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Maturity Value/)).not.toBeInTheDocument();
  });
});
