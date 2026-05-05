// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * SavingsSchemeDetail surfaces a "💬 Remind" button on installment rows
 * whose due date is within the auto-reminder window (2 days before, day-of,
 * or already overdue and still PENDING/MISSED). Clicking it must open a
 * wa.me URL in a new tab.
 */

// Freeze "today" so the test is deterministic — but ONLY override Date,
// not setTimeout/setInterval (react-query relies on real timers).
const NOW = new Date('2026-05-02T10:00:00');
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: '7' }),
  useNavigate: () => vi.fn(),
}));

const mockGetScheme = vi.fn();
vi.mock('../../src/lib/api', () => ({
  savingsSchemeAPI: {
    get: (...args: any[]) => mockGetScheme(...args),
    payInstallment: vi.fn(),
    markMissed: vi.fn(),
    redeem: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

import SavingsSchemeDetail from '../../src/pages/SavingsScheme/SavingsSchemeDetail';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SavingsSchemeDetail />
    </QueryClientProvider>,
  );
}

const SCHEME_BASE = {
  id: 7,
  schemeNo: 'SCH/7',
  schemeName: 'Gold Plus',
  status: 'ACTIVE',
  durationMonths: 11,
  monthlyAmount: 1000,
  bonusMonths: 1,
  bonusAmount: 1000,
  totalPaidAmount: 4000,
  maturityValue: 12000,
  startDate: '2026-01-02',
  maturityDate: '2026-12-02',
  account: { id: 1, name: 'Asha Kumari', mobile: '9876543210' },
};

function inst(no: number, dueDate: string, status: 'PAID' | 'PENDING' | 'MISSED') {
  return {
    id: no,
    installmentNo: no,
    dueDate,
    paidDate: status === 'PAID' ? '2026-04-26' : null,
    amount: status === 'PAID' ? 1000 : 0,
    paymentMode: status === 'PAID' ? 'Cash' : null,
    reference: null,
    status,
  };
}

describe('SavingsSchemeDetail — WhatsApp installment reminder', () => {
  beforeEach(() => {
    mockGetScheme.mockReset();
  });

  it('shows a Remind button only on PENDING/MISSED rows inside the reminder window', async () => {
    mockGetScheme.mockResolvedValue({
      data: {
        ...SCHEME_BASE,
        installments: [
          inst(1, '2026-04-02', 'PAID'),     // already paid → no button
          inst(2, '2026-04-30', 'MISSED'),   // overdue + missed → button
          inst(3, '2026-05-02', 'PENDING'),  // due today → button
          inst(4, '2026-05-04', 'PENDING'),  // due in 2 days → button
          inst(5, '2026-05-05', 'PENDING'),  // due in 3 days → NO button
          inst(6, '2026-06-02', 'PENDING'),  // far future → no button
        ],
      },
    });

    renderPage();

    // Wait for the table to render
    expect(await screen.findByText('Installments')).toBeInTheDocument();

    expect(screen.queryByTestId('send-reminder-1')).not.toBeInTheDocument(); // PAID
    expect(screen.getByTestId('send-reminder-2')).toBeInTheDocument();        // overdue MISSED
    expect(screen.getByTestId('send-reminder-3')).toBeInTheDocument();        // today
    expect(screen.getByTestId('send-reminder-4')).toBeInTheDocument();        // T-2
    expect(screen.queryByTestId('send-reminder-5')).not.toBeInTheDocument(); // T-3 → outside window
    expect(screen.queryByTestId('send-reminder-6')).not.toBeInTheDocument(); // far future
  });

  it('opens wa.me with the customer mobile and a per-installment message when clicked', async () => {
    mockGetScheme.mockResolvedValue({
      data: {
        ...SCHEME_BASE,
        installments: [inst(3, '2026-05-02', 'PENDING')],
      },
    });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderPage();

    const btn = await screen.findByTestId('send-reminder-3');
    btn.click();

    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = openSpy.mock.calls[0][0] as string;
    expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(decodeURIComponent(url)).toMatch(/SCH\/7/);
    expect(decodeURIComponent(url)).toMatch(/installment #3/i);
    expect(decodeURIComponent(url)).toMatch(/Asha Kumari/);

    openSpy.mockRestore();
  });

  it('hides the Remind button entirely on a non-ACTIVE scheme (cancelled / matured)', async () => {
    mockGetScheme.mockResolvedValue({
      data: {
        ...SCHEME_BASE,
        status: 'CANCELLED',
        installments: [inst(3, '2026-05-02', 'PENDING')],
      },
    });

    renderPage();
    expect(await screen.findByText('Installments')).toBeInTheDocument();
    expect(screen.queryByTestId('send-reminder-3')).not.toBeInTheDocument();
  });
});
