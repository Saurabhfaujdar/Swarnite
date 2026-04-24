// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mock react-router-dom ──────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ── Mock api module ────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  inventoryAPI: {
    labels: vi.fn(),
  },
}));

// ── Cart store mocks ───────────────────────────────────────
let mockCartItems: any[] = [];
const mockToggleItem = vi.fn();
const mockIsInCart = vi.fn(() => false);

vi.mock('../../src/lib/cartStore', () => ({
  useCartStore: (selector: any) => {
    const state = {
      items: mockCartItems,
      toggleItem: mockToggleItem,
      isInCart: mockIsInCart,
    };
    return selector(state);
  },
  CartLabel: {},
}));

// ── Mock CartDrawer ────────────────────────────────────────
vi.mock('../../src/components/CartDrawer', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="cart-drawer-mock">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

// ── Mock react-hot-toast ───────────────────────────────────
vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

import { inventoryAPI } from '../../src/lib/api';
import LabelEntryList from '../../src/pages/Inventory/LabelEntryList';

const mockLabels = inventoryAPI.labels as ReturnType<typeof vi.fn>;

const IN_STOCK_LABEL = {
  id: 1,
  labelNo: 'GP/1',
  grossWeight: 5.2,
  netWeight: 4.8,
  pcsCount: 1,
  huid: 'HU123',
  size: null,
  counterCode: 'C1',
  status: 'IN_STOCK',
  itemId: 10,
  createdAt: '2026-03-07T21:09:38.847Z',
  item: {
    name: 'Gold Pendant 22KT',
    metalType: { name: 'Gold' },
    purity: { code: '22KT', percentage: 91.6 },
    labourRate: 500,
  },
  branch: { name: 'Main' },
};

const SOLD_LABEL = {
  ...IN_STOCK_LABEL,
  id: 2,
  labelNo: 'GN/51',
  status: 'SOLD',
};

function renderList(labels = [IN_STOCK_LABEL, SOLD_LABEL]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  mockLabels.mockResolvedValue({ data: { labels, total: labels.length } });
  return render(
    <QueryClientProvider client={qc}>
      <LabelEntryList />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCartItems = [];
  mockIsInCart.mockReturnValue(false);
});

describe('LabelEntryList cart features', () => {
  describe('checkbox rendering', () => {
    it('shows checkbox for IN_STOCK labels', async () => {
      renderList();
      await waitFor(() => {
        expect(screen.getByTestId('cart-checkbox-1')).toBeDefined();
      });
    });

    it('does not show checkbox for SOLD labels', async () => {
      renderList();
      await waitFor(() => {
        expect(screen.getByText('GN/51')).toBeDefined();
      });
      expect(screen.queryByTestId('cart-checkbox-2')).toBeNull();
    });

    it('checkbox is unchecked when item not in cart', async () => {
      mockIsInCart.mockReturnValue(false);
      renderList();
      await waitFor(() => {
        const cb = screen.getByTestId('cart-checkbox-1') as HTMLInputElement;
        expect(cb.checked).toBe(false);
      });
    });

    it('checkbox is checked when item is in cart', async () => {
      mockIsInCart.mockReturnValue(true);
      renderList();
      await waitFor(() => {
        const cb = screen.getByTestId('cart-checkbox-1') as HTMLInputElement;
        expect(cb.checked).toBe(true);
      });
    });
  });

  describe('checkbox interaction', () => {
    it('calls toggleItem when checkbox clicked', async () => {
      renderList();
      await waitFor(() => {
        expect(screen.getByTestId('cart-checkbox-1')).toBeDefined();
      });
      await userEvent.click(screen.getByTestId('cart-checkbox-1'));
      expect(mockToggleItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          labelNo: 'GP/1',
          itemId: 10,
          itemName: 'Gold Pendant 22KT',
          grossWeight: 5.2,
          netWeight: 4.8,
          pcsCount: 1,
          status: 'IN_STOCK',
          metalType: 'Gold',
          purityCode: '22KT',
        }),
      );
    });
  });

  describe('cart badge', () => {
    it('does not show cart badge when cart is empty', async () => {
      mockCartItems = [];
      renderList();
      await waitFor(() => {
        expect(screen.getByText('GP/1')).toBeDefined();
      });
      expect(screen.queryByTestId('cart-badge')).toBeNull();
    });

    it('shows cart badge with count when cart has items', async () => {
      mockCartItems = [IN_STOCK_LABEL];
      renderList();
      await waitFor(() => {
        expect(screen.getByTestId('cart-badge')).toBeDefined();
      });
      expect(screen.getByTestId('cart-badge').textContent).toContain('1');
    });
  });

  describe('cart drawer', () => {
    it('opens cart drawer when badge clicked', async () => {
      mockCartItems = [IN_STOCK_LABEL];
      renderList();
      await waitFor(() => {
        expect(screen.getByTestId('cart-badge')).toBeDefined();
      });
      await userEvent.click(screen.getByTestId('cart-badge'));
      expect(screen.getByTestId('cart-drawer-mock')).toBeDefined();
    });

    it('hides cart drawer when closed', async () => {
      mockCartItems = [IN_STOCK_LABEL];
      renderList();
      await waitFor(() => {
        expect(screen.getByTestId('cart-badge')).toBeDefined();
      });
      await userEvent.click(screen.getByTestId('cart-badge'));
      expect(screen.getByTestId('cart-drawer-mock')).toBeDefined();

      await userEvent.click(screen.getByText('Close'));
      expect(screen.queryByTestId('cart-drawer-mock')).toBeNull();
    });
  });

  describe('row highlighting', () => {
    it('highlights row with bg-blue-50 when in cart', async () => {
      mockIsInCart.mockReturnValue(true);
      renderList([IN_STOCK_LABEL]);
      await waitFor(() => {
        const row = screen.getByTestId('cart-checkbox-1').closest('tr');
        expect(row?.className).toContain('bg-blue-50');
      });
    });
  });
});
