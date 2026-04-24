// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mock api module ────────────────────────────────────────
const mockPurities = vi.fn();
const mockLatestRates = vi.fn();
vi.mock('../../src/lib/api', () => ({
  mastersAPI: {
    purities: () => mockPurities(),
    latestRates: () => mockLatestRates(),
  },
}));

import OldGoldPurchaseModal from '../../src/components/OldGoldPurchaseModal';

function renderModal(props: Partial<React.ComponentProps<typeof OldGoldPurchaseModal>> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  mockPurities.mockResolvedValue({
    data: [
      { id: 1, code: '22KT', percentage: 91.6 },
      { id: 2, code: '18KT', percentage: 75.0 },
    ],
  });
  mockLatestRates.mockResolvedValue({
    data: [
      { purityCode: '22KT', metalType: { name: 'Gold' }, rate: 6950 },
      { purityCode: '18KT', metalType: { name: 'Gold' }, rate: 5700 },
    ],
  });

  const defaultProps = {
    currentAmount: 0,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <QueryClientProvider client={qc}>
        <OldGoldPurchaseModal {...defaultProps} />
      </QueryClientProvider>,
    ),
    props: defaultProps,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OldGoldPurchaseModal', () => {
  describe('rendering', () => {
    it('renders modal with title', () => {
      renderModal();
      expect(screen.getByText('Old Gold Purchase')).toBeDefined();
    });

    it('renders weight input fields', () => {
      renderModal();
      expect(screen.getByTestId('og-gross-weight')).toBeDefined();
      expect(screen.getByTestId('og-less-weight')).toBeDefined();
      expect(screen.getByTestId('og-net-weight')).toBeDefined();
    });

    it('renders purity selector', () => {
      renderModal();
      expect(screen.getByTestId('og-purity')).toBeDefined();
    });

    it('renders metal rate input', () => {
      renderModal();
      expect(screen.getByTestId('og-metal-rate')).toBeDefined();
    });

    it('renders confirm and cancel buttons', () => {
      renderModal();
      expect(screen.getByTestId('og-confirm')).toBeDefined();
      expect(screen.getByText('Cancel')).toBeDefined();
    });

    it('confirm button is disabled when amount is 0', () => {
      renderModal();
      const btn = screen.getByTestId('og-confirm') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('shows Clear OG button when currentAmount > 0', () => {
      renderModal({ currentAmount: 5000 });
      expect(screen.getByTestId('og-clear')).toBeDefined();
    });

    it('hides Clear OG button when currentAmount is 0', () => {
      renderModal({ currentAmount: 0 });
      expect(screen.queryByTestId('og-clear')).toBeNull();
    });
  });

  describe('calculations', () => {
    it('calculates net weight = gross - less', async () => {
      renderModal();

      await userEvent.type(screen.getByTestId('og-gross-weight'), '10');
      await userEvent.type(screen.getByTestId('og-less-weight'), '1.5');

      const netInput = screen.getByTestId('og-net-weight') as HTMLInputElement;
      expect(netInput.value).toBe('8.500');
    });

    it('calculates fine weight from net weight and purity', async () => {
      renderModal();

      await userEvent.type(screen.getByTestId('og-gross-weight'), '10');
      // Default purity is 916 (91.6%)
      // Fine wt = 10 * 91.6 / 100 = 9.16

      const fineInput = screen.getByTestId('og-fine-weight') as HTMLInputElement;
      expect(fineInput.value).toBe('9.160');
    });

    it('calculates amount = fine weight × metal rate', async () => {
      renderModal();

      await userEvent.type(screen.getByTestId('og-gross-weight'), '10');
      await userEvent.type(screen.getByTestId('og-metal-rate'), '7000');
      // Fine wt = 10 * 91.6 / 100 = 9.16
      // Amount = 9.16 * 7000 = 64120

      await waitFor(() => {
        const amountEl = screen.getByTestId('og-amount');
        expect(amountEl.textContent).toContain('64,120');
      });
    });

    it('enables confirm button when amount > 0', async () => {
      renderModal();

      await userEvent.type(screen.getByTestId('og-gross-weight'), '10');
      await userEvent.type(screen.getByTestId('og-metal-rate'), '7000');

      const btn = screen.getByTestId('og-confirm') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });

  describe('actions', () => {
    it('calls onConfirm with calculated amount', async () => {
      const { props } = renderModal();

      await userEvent.type(screen.getByTestId('og-gross-weight'), '10');
      await userEvent.type(screen.getByTestId('og-metal-rate'), '7000');
      await userEvent.click(screen.getByTestId('og-confirm'));

      // 10g × 91.6% = 9.16g fine × 7000 = 64120
      expect(props.onConfirm).toHaveBeenCalledWith(64120);
    });

    it('calls onClose when cancel button clicked', async () => {
      const { props } = renderModal();
      await userEvent.click(screen.getByText('Cancel'));
      expect(props.onClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop clicked', async () => {
      const { props, container } = renderModal();
      const backdrop = container.querySelector('.bg-black\\/30');
      if (backdrop) await userEvent.click(backdrop as HTMLElement);
      expect(props.onClose).toHaveBeenCalled();
    });

    it('calls onClose when X button clicked', async () => {
      const { props } = renderModal();
      await userEvent.click(screen.getByTestId('og-modal-close'));
      expect(props.onClose).toHaveBeenCalled();
    });

    it('Clear OG calls onConfirm with 0', async () => {
      const { props } = renderModal({ currentAmount: 5000 });
      await userEvent.click(screen.getByTestId('og-clear'));
      expect(props.onConfirm).toHaveBeenCalledWith(0);
    });
  });

  describe('with less weight', () => {
    it('deducts less weight from gross for calculation', async () => {
      const { props } = renderModal();

      await userEvent.type(screen.getByTestId('og-gross-weight'), '20');
      await userEvent.type(screen.getByTestId('og-less-weight'), '2');
      await userEvent.type(screen.getByTestId('og-metal-rate'), '7000');
      await userEvent.click(screen.getByTestId('og-confirm'));

      // Net = 20 - 2 = 18g, Fine = 18 × 91.6% = 16.488, Amount = 16.488 × 7000 = 115416
      expect(props.onConfirm).toHaveBeenCalledWith(115416);
    });
  });
});
