// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mock navigate ──────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ── Mock api module ────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  reportsAPI: {
    dashboard: vi.fn().mockResolvedValue({ data: {} }),
  },
  mastersAPI: {
    metalRates: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

import Dashboard from '../../src/pages/Dashboard';

function fireKey(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  return event;
}

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard Keyboard Shortcuts', () => {
  it('F1 navigates to sales entry', () => {
    renderDashboard();
    act(() => { fireKey('F1'); });
    expect(mockNavigate).toHaveBeenCalledWith('/sales/retail');
  });

  it('F2 navigates to purchase entry', () => {
    renderDashboard();
    act(() => { fireKey('F2'); });
    expect(mockNavigate).toHaveBeenCalledWith('/purchase/urd');
  });

  it('F3 navigates to cash entry', () => {
    renderDashboard();
    act(() => { fireKey('F3'); });
    expect(mockNavigate).toHaveBeenCalledWith('/cash-bank/cash');
  });

  it('F4 navigates to label entry', () => {
    renderDashboard();
    act(() => { fireKey('F4'); });
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/labels/new');
  });

  it('F5 navigates to daily report', () => {
    renderDashboard();
    act(() => { fireKey('F5'); });
    expect(mockNavigate).toHaveBeenCalledWith('/reports/daily-sales');
  });

  it('F6 navigates to stock report', () => {
    renderDashboard();
    act(() => { fireKey('F6'); });
    expect(mockNavigate).toHaveBeenCalledWith('/reports/stock');
  });

  it('prevents default browser action for F1-F6', () => {
    renderDashboard();
    for (const key of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']) {
      const event = fireKey(key);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('does not navigate for unmapped keys', () => {
    renderDashboard();
    act(() => { fireKey('F7'); });
    act(() => { fireKey('F8'); });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clicking Sales Entry button navigates', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Sales Entry'));
    expect(mockNavigate).toHaveBeenCalledWith('/sales/retail');
  });

  it('clicking Purchase Entry button navigates', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Purchase Entry'));
    expect(mockNavigate).toHaveBeenCalledWith('/purchase/urd');
  });

  it('clicking Cash Entry button navigates', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Cash Entry'));
    expect(mockNavigate).toHaveBeenCalledWith('/cash-bank/cash');
  });

  it('clicking Label Entry button navigates', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Label Entry'));
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/labels/new');
  });

  it('clicking Daily Report button navigates', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Daily Report'));
    expect(mockNavigate).toHaveBeenCalledWith('/reports/daily-sales');
  });

  it('clicking Stock Report button navigates', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Stock Report'));
    expect(mockNavigate).toHaveBeenCalledWith('/reports/stock');
  });

  it('renders all 6 quick access buttons with correct key labels', () => {
    renderDashboard();
    expect(screen.getByText('(F1)')).toBeInTheDocument();
    expect(screen.getByText('(F2)')).toBeInTheDocument();
    expect(screen.getByText('(F3)')).toBeInTheDocument();
    expect(screen.getByText('(F4)')).toBeInTheDocument();
    expect(screen.getByText('(F5)')).toBeInTheDocument();
    expect(screen.getByText('(F6)')).toBeInTheDocument();
  });

  it('cleans up listeners on unmount', () => {
    const { unmount } = renderDashboard();
    unmount();
    act(() => { fireKey('F1'); });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
