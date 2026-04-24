// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── Mock react-router-dom ──────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ── Cart store state (shared mutable for tests) ───────────
let mockItems: any[] = [];
const mockRemoveItem = vi.fn();
const mockClear = vi.fn();

vi.mock('../../src/lib/cartStore', () => ({
  useCartStore: (selector: any) => {
    const state = {
      items: mockItems,
      removeItem: mockRemoveItem,
      clear: mockClear,
    };
    return selector(state);
  },
}));

import CartDrawer from '../../src/components/CartDrawer';

const CART_ITEM_1 = {
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
  purityPercentage: 91.6,
  labourRate: 500,
};

const CART_ITEM_2 = {
  id: 2,
  labelNo: 'GN/51',
  itemId: 20,
  itemName: 'Gold Necklace 22KT',
  grossWeight: 10.5,
  netWeight: 9.8,
  pcsCount: 3,
  status: 'IN_STOCK',
  metalType: 'Gold',
  purityCode: '22KT',
  purityPercentage: 91.6,
  labourRate: 600,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockItems = [];
});

describe('CartDrawer', () => {
  describe('empty cart', () => {
    it('shows empty message', () => {
      render(<CartDrawer onClose={vi.fn()} />);
      expect(screen.getByText('Cart is empty')).toBeDefined();
    });

    it('does not show action buttons when empty', () => {
      render(<CartDrawer onClose={vi.fn()} />);
      expect(screen.queryByTestId('cart-to-layaway')).toBeNull();
      expect(screen.queryByTestId('cart-to-sale')).toBeNull();
    });
  });

  describe('with items', () => {
    beforeEach(() => {
      mockItems = [CART_ITEM_1, CART_ITEM_2];
    });

    it('renders cart header with count', () => {
      render(<CartDrawer onClose={vi.fn()} />);
      expect(screen.getByText(/Cart \(2 items\)/)).toBeDefined();
    });

    it('renders each cart item', () => {
      render(<CartDrawer onClose={vi.fn()} />);
      expect(screen.getByText('GP/1')).toBeDefined();
      expect(screen.getByText('GN/51')).toBeDefined();
      expect(screen.getByText('Gold Pendant 22KT')).toBeDefined();
      expect(screen.getByText('Gold Necklace 22KT')).toBeDefined();
    });

    it('renders summary totals', () => {
      render(<CartDrawer onClose={vi.fn()} />);
      expect(screen.getByText(/2 items, 4 pcs/)).toBeDefined();
    });

    it('renders Layaway and Sale buttons', () => {
      render(<CartDrawer onClose={vi.fn()} />);
      expect(screen.getByTestId('cart-to-layaway')).toBeDefined();
      expect(screen.getByTestId('cart-to-sale')).toBeDefined();
    });

    it('renders Clear Cart button', () => {
      render(<CartDrawer onClose={vi.fn()} />);
      expect(screen.getByTestId('cart-clear')).toBeDefined();
    });
  });

  describe('actions', () => {
    beforeEach(() => {
      mockItems = [CART_ITEM_1];
    });

    it('calls onClose when backdrop clicked', async () => {
      const onClose = vi.fn();
      const { container } = render(<CartDrawer onClose={onClose} />);
      const backdrop = container.querySelector('.bg-black\\/30');
      if (backdrop) await userEvent.click(backdrop as HTMLElement);
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when close button clicked', async () => {
      const onClose = vi.fn();
      render(<CartDrawer onClose={onClose} />);
      await userEvent.click(screen.getByTestId('cart-close'));
      expect(onClose).toHaveBeenCalled();
    });

    it('calls removeItem when remove button clicked', async () => {
      render(<CartDrawer onClose={vi.fn()} />);
      await userEvent.click(screen.getByTestId('cart-remove-1'));
      expect(mockRemoveItem).toHaveBeenCalledWith(1);
    });

    it('calls clear when Clear Cart clicked', async () => {
      render(<CartDrawer onClose={vi.fn()} />);
      await userEvent.click(screen.getByTestId('cart-clear'));
      expect(mockClear).toHaveBeenCalled();
    });

    it('navigates to layaway with cart items and clears', async () => {
      const onClose = vi.fn();
      render(<CartDrawer onClose={onClose} />);
      await userEvent.click(screen.getByTestId('cart-to-layaway'));

      expect(mockClear).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/layaway', {
        state: {
          cartItems: [
            expect.objectContaining({ id: 1, labelNo: 'GP/1', itemId: 10 }),
          ],
        },
      });
    });

    it('navigates to sales with cart items and clears', async () => {
      const onClose = vi.fn();
      render(<CartDrawer onClose={onClose} />);
      await userEvent.click(screen.getByTestId('cart-to-sale'));

      expect(mockClear).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/sales/retail', {
        state: {
          cartItems: [
            expect.objectContaining({ id: 1, labelNo: 'GP/1', itemId: 10 }),
          ],
        },
      });
    });
  });
});
