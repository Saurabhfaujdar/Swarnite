// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mock api module ────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  salesAPI: {
    get: vi.fn(),
  },
}));

// ── Mock react-hot-toast ───────────────────────────────────
vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

import { salesAPI } from '../../src/lib/api';
import VoucherPrintDialog from '../../src/components/VoucherPrintDialog';
import toast from 'react-hot-toast';

const mockGet = salesAPI.get as ReturnType<typeof vi.fn>;

// ── Sample voucher response ────────────────────────────────
const VOUCHER = {
  id: 1,
  voucherNo: 'JGI/1',
  voucherDate: '2026-03-05T00:00:00.000Z',
  account: {
    id: 10,
    name: 'Saurabh Faudar',
    address: '123 Main Street',
    city: 'Haldwani',
    state: 'Uttarakhand',
    pincode: '263139',
    mobile: '9876543210',
    gstin: '09AAACG1234F1Z5',
    pan: 'AAACG1234F',
  },
  items: [
    {
      id: 1,
      itemName: 'Gold Necklace 22K',
      item: { name: 'Gold Necklace 22K', hsnCode: '711311', purity: { name: '22K' } },
      pcs: 1,
      grossWeight: 10.5,
      netWeight: 9.8,
      totalAmount: 68110,
    },
  ],
  taxableAmount: 68110,
  discountAmount: 0,
  cgstAmount: 1022,
  sgstAmount: 1022,
  igstAmount: 0,
  voucherAmount: 70154,
  cashAmount: 50000,
  bankAmount: 20154,
  cardAmount: 0,
  oldGoldAmount: 0,
  dueAmount: 0,
  status: 'ACTIVE',
};

// ── Helper ──────────────────────────────────────────────────
function renderDialog(voucherId = 1, onClose = vi.fn()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  mockGet.mockResolvedValue({ data: VOUCHER });

  return {
    onClose,
    ...render(
      <QueryClientProvider client={qc}>
        <VoucherPrintDialog voucherId={voucherId} onClose={onClose} />
      </QueryClientProvider>,
    ),
  };
}

// ── Tests ───────────────────────────────────────────────────
describe('VoucherPrintDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Renders Dialog Chrome ────────────────────────────────
  it('renders dialog header', async () => {
    renderDialog();
    expect(screen.getByText(/Voucher Print/)).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    // Make the API never resolve
    mockGet.mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <VoucherPrintDialog voucherId={1} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Loading voucher data...')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <VoucherPrintDialog voucherId={1} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Failed to load voucher')).toBeInTheDocument();
    });
  });

  // ── After Data Loads ─────────────────────────────────────
  it('renders voucher info banner after loading', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeInTheDocument();
    });
    expect(screen.getByText('Saurabh Faudar')).toBeInTheDocument();
  });

  it('renders Voucher Format dropdown', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('Voucher Format')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(/GST Sales Voucher \(A4\) Jai Guru NB/)).toBeInTheDocument();
  });

  it('renders Template dropdown', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('Template')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('bill_orn_5')).toBeInTheDocument();
  });

  it('renders No of Copies input defaulting to 1', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('No. Of Copies')).toBeInTheDocument();
    });
    const copiesInput = screen.getByDisplayValue('1');
    expect(copiesInput).toBeInTheDocument();
    expect(copiesInput).toHaveAttribute('type', 'number');
  });

  it('renders WhatsApp text area', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('Whatsapp Text')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('invoice')).toBeInTheDocument();
  });

  // ── Action Buttons (use title attrs — emojis get mangled in jsdom) ──
  it('renders all action buttons by title', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeInTheDocument();
    });
    expect(screen.getByTitle('Setup')).toBeInTheDocument();
    expect(screen.getByTitle('Upload Document')).toBeInTheDocument();
    expect(screen.getByTitle('Share via WhatsApp')).toBeInTheDocument();
    expect(screen.getByTitle('Preview invoice')).toBeInTheDocument();
    expect(screen.getByTitle('Print invoice')).toBeInTheDocument();
  });

  it('calls onClose when header × is clicked', () => {
    const { onClose } = renderDialog();
    const closeBtn = screen.getByText('×');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── View / Print / WhatsApp buttons are enabled once data loads ──
  it('View button is enabled after data loads', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeInTheDocument();
    });
    const viewBtn = screen.getByTitle('Preview invoice');
    expect(viewBtn).not.toBeDisabled();
  });

  it('Print button is enabled after data loads', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeInTheDocument();
    });
    const printBtn = screen.getByTitle('Print invoice');
    expect(printBtn).not.toBeDisabled();
  });

  it('WhatsApp button is enabled after data loads', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeInTheDocument();
    });
    const whatsappBtn = screen.getByTitle('Share via WhatsApp');
    expect(whatsappBtn).not.toBeDisabled();
  });

  // ── Escape Key ────────────────────────────────────────────
  it('calls onClose on Escape key', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Dropdown Changes ────────────────────────────────────
  it('changes voucher format selection', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByDisplayValue(/Jai Guru NB/)).toBeInTheDocument();
    });
    const select = screen.getByDisplayValue(/Jai Guru NB/);
    fireEvent.change(select, { target: { value: 'Estimate / Quotation (A4)' } });
    expect(screen.getByDisplayValue('Estimate / Quotation (A4)')).toBeInTheDocument();
  });

  // ── Print Button Behaviour ──────────────────────────────
  it('opens a new window and calls focus + print on Print click', async () => {
    const mockPrintWindow = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
        readyState: 'complete',
      },
      focus: vi.fn(),
      print: vi.fn(),
      addEventListener: vi.fn((_event: string, cb: () => void) => cb()),
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(mockPrintWindow as any);

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Print invoice'));

    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(mockPrintWindow.document.write).toHaveBeenCalled();
    expect(mockPrintWindow.document.close).toHaveBeenCalled();
    // Must focus before printing to prevent UI hang
    expect(mockPrintWindow.focus).toHaveBeenCalled();
    expect(mockPrintWindow.print).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('shows toast error when popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('JGI/1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Print invoice'));

    expect(toast.error).toHaveBeenCalledWith('Please allow popups to print');
    vi.restoreAllMocks();
  });
});
