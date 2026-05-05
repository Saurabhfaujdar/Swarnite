// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Tests for the layaway-conversion arithmetic in the Sales Entry page.
 *
 * When a layaway is loaded into Sales Entry, the right-hand O/s panel
 * must reflect what the customer has ALREADY paid into the layaway. So
 * if the booking was for ₹13,96,916 and the customer paid ₹6,34,567 in
 * advance, the page should show:
 *
 *   Voucher Amt    13,96,916
 *   Layaway Paid    6,34,567
 *   Payment Amt     6,34,567   (≡ already paid until cashier collects more)
 *   Due Amt          7,62,349
 *
 * F10 (Cash Effect) should dump only the remaining DUE into the cash
 * bucket, not the full voucher amount.
 */

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ state: null }),
}));

vi.mock('../../src/lib/api', () => ({
  salesAPI: { create: vi.fn() },
  inventoryAPI: { searchLabel: vi.fn() },
  accountsAPI: { list: vi.fn(), create: vi.fn(), gstSearch: vi.fn() },
  mastersAPI: { salesmen: vi.fn(), latestRates: vi.fn() },
  layawayAPI: { byVoucherNo: vi.fn(), get: vi.fn(), convert: vi.fn() },
}));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

vi.mock('../../src/components/VoucherPrintDialog', () => ({ default: () => null }));
vi.mock('../../src/components/AccountMasterModal', () => ({ default: () => null }));
vi.mock('../../src/components/OldGoldPurchaseModal', () => ({ default: () => null }));
vi.mock('../../src/components/CustomerCategoryBadge', () => ({ default: () => null }));
vi.mock('../../src/components/WhatsAppActions', () => ({ WhatsAppDropdown: () => null }));

import { mastersAPI, layawayAPI } from '../../src/lib/api';
import RetailSalesEntry from '../../src/pages/Sales/RetailSalesEntry';

const mockByVoucherNo = layawayAPI.byVoucherNo as ReturnType<typeof vi.fn>;
const mockConvert = layawayAPI.convert as ReturnType<typeof vi.fn>;
const mockSalesmen = mastersAPI.salesmen as ReturnType<typeof vi.fn>;
const mockLatestRates = mastersAPI.latestRates as ReturnType<typeof vi.fn>;

// Mirrors the user-reported scenario: voucher ₹13,96,916 with ₹6,34,567
// already paid via layaway payments; customer's prior closingBalance
// (DR) already includes the unpaid layaway portion of ₹7,62,349.
const VOUCHER = 1396916;
const PAID = 634567;
const REMAINING = VOUCHER - PAID; // 762349
const PRIOR_OS = 1531568;          // customer overall DR

const LAYAWAY = {
  id: 5,
  voucherNo: 'LY/5',
  status: 'ACTIVE',
  voucherAmount: VOUCHER,
  paymentAmount: PAID,
  account: {
    id: 42,
    name: 'Smt. Priya Jain',
    mobile: '9876543212',
    closingBalance: PRIOR_OS,
    balanceType: 'DR',
    customerTag: null,
  },
  items: [
    {
      id: 11,
      labelId: 100,
      itemId: 1,
      labelNo: 'GK/345',
      itemName: 'Gold Coin 24KT',
      grossWeight: 22,
      netWeight: 22,
      fineWeight: 20.152,
      pcs: 1,
      metalRate: 67300,
      metalAmount: 1356229.6,
      diamondWeight: 0,
      labourRate: 0,
      labourAmount: 0,
      otherCharge: 0,
      discountAmt: 0,
      totalAmount: 1356229.6,
      taxableAmount: 1356229.6,
      label: { pcsCount: 1 },
    },
  ],
};

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <RetailSalesEntry />
    </QueryClientProvider>,
  );
}

async function loadLayaway() {
  mockByVoucherNo.mockResolvedValueOnce({ data: LAYAWAY });
  const input = screen.getByPlaceholderText('Scan label...');
  fireEvent.change(input, { target: { value: 'LY/5' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(mockByVoucherNo).toHaveBeenCalledWith('LY/5'));
  await screen.findByTestId('layaway-banner');
}

function getOsPanelRow(label: string): HTMLElement {
  // Each O/s detail row in the right-hand panel is a flex row that
  // contains the label as its first <span>. Find the row by walking
  // up from the label text.
  const span = screen.getByText(label, { selector: 'span' });
  const row = span.parentElement;
  if (!row) throw new Error(`row for "${label}" not found`);
  return row as HTMLElement;
}

describe('RetailSalesEntry — O/s arithmetic when a layaway is loaded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSalesmen.mockResolvedValue({ data: [] });
    mockLatestRates.mockResolvedValue({ data: [] });
  });

  it('shows a Layaway Paid row with the amount already paid into the booking', async () => {
    renderPage();
    await loadLayaway();

    const row = await screen.findByTestId('layaway-already-paid-row');
    // 6,34,567 → Indian formatted "6,34,567"
    expect(row).toHaveTextContent(/6,34,567/);
  });

  it('counts layawayPaidAmount toward Payment Amt and reduces Due Amt to the unpaid balance', async () => {
    renderPage();
    await loadLayaway();
    await screen.findByTestId('layaway-already-paid-row');

    // Payment Amt should equal what was already paid via the layaway,
    // since the cashier hasn't entered any new payment yet.
    const paymentRow = getOsPanelRow('Payment Amt');
    expect(paymentRow).toHaveTextContent(/6,34,567/);

    // Due Amt should be voucher minus already-paid = 7,62,349.
    const dueRow = getOsPanelRow('Due Amt');
    expect(dueRow).toHaveTextContent(/7,62,349/);
    // Regression: the value is positive (customer still owes), so it
    // must NOT be rendered with a leading minus sign.
    expect(dueRow.textContent?.replace(/\s+/g, '')).toBe('DueAmt7,62,349.00');
  });

  it('does not double-count the layaway portion in Final Due (uses previousOs minus new collection)', async () => {
    renderPage();
    await loadLayaway();
    await screen.findByTestId('layaway-already-paid-row');

    // Customer's prior closingBalance already includes the unpaid
    // layaway (it was added to DR when the layaway was created and
    // decremented as advance came in). So Final Due before any new
    // collection should equal previousOs (15,31,568), NOT
    // previousOs + voucherAmount.
    const finalDueRow = getOsPanelRow('Final Due');
    expect(finalDueRow).toHaveTextContent(/15,31,568/);
    // Old (buggy) value would have been 29,28,484 — make sure we're
    // not regressing back to that.
    expect(finalDueRow).not.toHaveTextContent(/29,28,484/);
  });

  it('reduces Due Amt and Final Due as the cashier enters cash for the conversion', async () => {
    renderPage();
    await loadLayaway();
    await screen.findByTestId('layaway-already-paid-row');

    // Press F10 (Cash Effect) — for a layaway it should pre-fill cash
    // with REMAINING (7,62,349), not the full voucher.
    fireEvent.keyDown(window, { key: 'F10' });

    await waitFor(() => {
      const dueRow = getOsPanelRow('Due Amt');
      // Cashier paid the remaining 7,62,349 in cash → Due Amt = 0.
      expect(dueRow.textContent?.replace(/\s+/g, '')).toMatch(/^DueAmt-?0\.00$/);
    });

    // Final Due = previousOs − newCollection = 15,31,568 − 7,62,349 = 7,69,219.
    const finalDueRow = getOsPanelRow('Final Due');
    expect(finalDueRow).toHaveTextContent(/7,69,219/);
  });

  it('F10 (Cash Effect) does NOT overfill cash when a layaway is loaded', async () => {
    renderPage();
    await loadLayaway();
    await screen.findByTestId('layaway-already-paid-row');

    fireEvent.keyDown(window, { key: 'F10' });

    // Convert & Save → the conversion call's finalPaymentAmount must
    // equal only the remaining unpaid portion, not the full voucher.
    mockConvert.mockResolvedValueOnce({
      data: { saleVoucherNo: 'LY/5', saleVoucherId: 555 },
    });
    fireEvent.click(screen.getByRole('button', { name: /Convert & Save/i }));

    await waitFor(() => expect(mockConvert).toHaveBeenCalledTimes(1));
    const [, calledData] = mockConvert.mock.calls[0];
    expect(calledData.finalPaymentMode).toBe('Cash');
    expect(calledData.finalPaymentAmount).toBe(REMAINING);
  });
});
