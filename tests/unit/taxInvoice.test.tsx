// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import TaxInvoice, { type InvoiceData } from '../../src/components/TaxInvoice';

// ── Sample invoice data ────────────────────────────────────
const SAMPLE_INVOICE: InvoiceData = {
  sellerName: 'JAIGURU JEWELS LLP',
  sellerGstin: '09AATFJ3777G1ZO',
  buyerName: 'Saurabh Faudar',
  buyerAddress: '123 Main Street, Haldwani, Uttarakhand, 263139',
  buyerContact: '9876543210',
  buyerState: 'Uttarakhand',
  buyerStateCode: '05',
  buyerGstin: '09AAACG1234F1Z5',
  buyerPan: 'AAACG1234F',
  invoiceDate: '05/03/2026',
  invoiceNo: 'JGI/1',
  items: [
    {
      sNo: 1,
      description: 'Gold Necklace 22K',
      hsnCode: '711311',
      purity: '22K',
      pcs: 1,
      grossWt: 10.5,
      netWt: 9.8,
      amount: 68110,
    },
    {
      sNo: 2,
      description: 'Gold Ring 18K',
      hsnCode: '711311',
      purity: '18K',
      pcs: 1,
      grossWt: 5.2,
      netWt: 4.8,
      amount: 25000,
    },
  ],
  productTotal: 93110,
  discount: 500,
  valueAfterDiscount: 92610,
  cgstRate: 1.5,
  cgstAmount: 1389,
  sgstRate: 1.5,
  sgstAmount: 1389,
  igstRate: 0,
  igstAmount: 0,
  taxAmountAfterTax: 95388,
  cashAmount: 50000,
  bankAmount: 30000,
  cardAmount: 0,
  oldPurchaseAmount: 10000,
  amountPaid: 90000,
  balance: 5388,
  bankAccountName: 'JAIGURU JEWELS LLP',
  bankAccountNo: '42206799212',
  bankIfsc: 'SBIN0011409',
  bankName: 'BHOTIA PARAO, HALDWANI',
};

// ── Helper ──────────────────────────────────────────────────
function renderInvoice(overrides: Partial<InvoiceData> = {}) {
  const data = { ...SAMPLE_INVOICE, ...overrides };
  return render(<TaxInvoice data={data} />);
}

// ── Tests ───────────────────────────────────────────────────
describe('TaxInvoice', () => {
  // ── Header / Buyer & Seller ───────────────────────────────
  it('renders seller name and TAX INVOICE heading', () => {
    renderInvoice();
    expect(screen.getByText('JAIGURU JEWELS LLP')).toBeInTheDocument();
    expect(screen.getByText('TAX INVOICE')).toBeInTheDocument();
  });

  it('renders buyer name and address', () => {
    renderInvoice();
    expect(screen.getByText('Saurabh Faudar')).toBeInTheDocument();
    expect(screen.getByText('123 Main Street, Haldwani, Uttarakhand, 263139')).toBeInTheDocument();
  });

  it('renders buyer contact and state', () => {
    renderInvoice();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
    expect(screen.getByText('Uttarakhand')).toBeInTheDocument();
    expect(screen.getByText('05')).toBeInTheDocument();
  });

  it('renders buyer GSTIN and PAN', () => {
    const { container } = renderInvoice();
    const gstinDiv = container.querySelector('.tax-invoice-print');
    expect(gstinDiv?.textContent).toContain('09AAACG1234F1Z5');
    expect(gstinDiv?.textContent).toContain('AAACG1234F');
  });

  it('renders invoice date and number', () => {
    renderInvoice();
    expect(screen.getByText('05/03/2026')).toBeInTheDocument();
    expect(screen.getByText('JGI/1')).toBeInTheDocument();
  });

  it('renders seller GSTIN', () => {
    renderInvoice();
    expect(screen.getByText('09AATFJ3777G1ZO')).toBeInTheDocument();
  });

  // ── Items Table ───────────────────────────────────────────
  it('renders all column headers', () => {
    renderInvoice();
    expect(screen.getByText('S. No.')).toBeInTheDocument();
    expect(screen.getByText('DESCRIPTION OF GOODS')).toBeInTheDocument();
    expect(screen.getByText('HSN CODE')).toBeInTheDocument();
    expect(screen.getByText('PURITY')).toBeInTheDocument();
    expect(screen.getByText('PCS')).toBeInTheDocument();
    expect(screen.getByText('Gross Wt.')).toBeInTheDocument();
    expect(screen.getByText('Net Wt.')).toBeInTheDocument();
  });

  it('renders item descriptions', () => {
    renderInvoice();
    expect(screen.getByText('Gold Necklace 22K')).toBeInTheDocument();
    expect(screen.getByText('Gold Ring 18K')).toBeInTheDocument();
  });

  it('renders item HSN codes', () => {
    renderInvoice();
    // Both have 711311 — multiple matches expected
    const hsnCells = screen.getAllByText('711311');
    expect(hsnCells.length).toBeGreaterThanOrEqual(2);
  });

  it('renders item purity values', () => {
    renderInvoice();
    expect(screen.getByText('22K')).toBeInTheDocument();
    expect(screen.getByText('18K')).toBeInTheDocument();
  });

  it('fills empty rows when items < 5', () => {
    const { container } = renderInvoice();
    // 2 items + 3 empty rows = 5 body rows total
    const tbodyRows = container.querySelectorAll('tbody tr');
    expect(tbodyRows.length).toBe(5);
  });

  it('does not add empty rows when items >= 5', () => {
    const fiveItems = Array.from({ length: 5 }, (_, i) => ({
      sNo: i + 1,
      description: `Item ${i + 1}`,
      hsnCode: '711311',
      purity: '22K',
      pcs: 1,
      grossWt: 5,
      netWt: 4.5,
      amount: 10000,
    }));
    const { container } = renderInvoice({ items: fiveItems });
    const tbodyRows = container.querySelectorAll('tbody tr');
    expect(tbodyRows.length).toBe(5); // exactly 5, no empties
  });

  // ── Tax & Totals ──────────────────────────────────────────
  it('renders product total and discount', () => {
    renderInvoice();
    expect(screen.getByText('Product total value')).toBeInTheDocument();
    expect(screen.getByText('Discount')).toBeInTheDocument();
    expect(screen.getByText('Value after discount')).toBeInTheDocument();
  });

  it('renders CGST and SGST rates', () => {
    renderInvoice();
    expect(screen.getByText('Add CGST @ 1.5 %')).toBeInTheDocument();
    expect(screen.getByText('Add SGST @ 1.5 %')).toBeInTheDocument();
  });

  it('renders total amount after tax label', () => {
    renderInvoice();
    expect(screen.getByText('Tax amount after tax')).toBeInTheDocument();
  });

  it('renders total amount in words', () => {
    renderInvoice();
    expect(screen.getByText('Total amount in words')).toBeInTheDocument();
    // numberToWords(95388) = "Ninety Five Thousand Three Hundred Eighty Eight Rupees Only"
    expect(screen.getByText(/Ninety Five Thousand Three Hundred Eighty Eight Rupees Only/)).toBeInTheDocument();
  });

  // ── Payment Details ───────────────────────────────────────
  it('renders payment details section', () => {
    renderInvoice();
    expect(screen.getByText('PAYMENT DETAILS :-')).toBeInTheDocument();
    expect(screen.getByText('RATE')).toBeInTheDocument();
  });

  it('renders old purchase section', () => {
    renderInvoice();
    expect(screen.getByText('OLD PURCHASE :-')).toBeInTheDocument();
  });

  it('renders amount paid and balance labels', () => {
    renderInvoice();
    expect(screen.getByText('Amount Paid')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
  });

  // ── Bank Details ──────────────────────────────────────────
  it('renders bank account details', () => {
    renderInvoice();
    expect(screen.getByText('BANK ACCOUNT DETAILS :-')).toBeInTheDocument();
    expect(screen.getByText(/42206799212/)).toBeInTheDocument();
    expect(screen.getByText(/SBIN0011409/)).toBeInTheDocument();
    expect(screen.getByText(/BHOTIA PARAO, HALDWANI/)).toBeInTheDocument();
  });

  // ── Terms & Signatures ───────────────────────────────────
  it('renders terms and conditions', () => {
    renderInvoice();
    expect(screen.getByText('TERMS & CONDITIONS')).toBeInTheDocument();
    expect(screen.getByText(/Hallmarking Charges/)).toBeInTheDocument();
    expect(screen.getByText(/Haldwani jurisdiction/)).toBeInTheDocument();
  });

  it('renders signature lines', () => {
    renderInvoice();
    expect(screen.getByText('Authorised Signature')).toBeInTheDocument();
    expect(screen.getByText('Customer Signature')).toBeInTheDocument();
  });

  it('renders certified statement', () => {
    renderInvoice();
    expect(screen.getByText(/Certified that the particulars/)).toBeInTheDocument();
  });

  // ── Conditional rendering ─────────────────────────────────
  it('hides bank amount when zero', () => {
    const { container } = renderInvoice({ bankAmount: 0 });
    // "Bank:" text should not appear in payment section
    const bankLabel = container.querySelector('div')?.textContent || '';
    // bankAmount field is conditionally rendered
    expect(screen.queryByText(/^Bank:/)).not.toBeInTheDocument();
  });

  it('shows bank amount when > 0', () => {
    renderInvoice({ bankAmount: 30000 });
    expect(screen.getByText(/^Bank:/)).toBeInTheDocument();
  });

  it('shows card amount when > 0', () => {
    renderInvoice({ cardAmount: 5000 });
    expect(screen.getByText(/^Card:/)).toBeInTheDocument();
  });
});
