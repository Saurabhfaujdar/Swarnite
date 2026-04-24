import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore, CartLabel } from '../../src/lib/cartStore';
import { act } from '@testing-library/react';

const LABEL_1: CartLabel = {
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

const LABEL_2: CartLabel = {
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

const LABEL_3: CartLabel = {
  id: 3,
  labelNo: 'SR/10',
  itemId: 30,
  itemName: 'Silver Ring',
  grossWeight: 3.0,
  netWeight: 2.8,
  pcsCount: 1,
  status: 'IN_STOCK',
  metalType: 'Silver',
  purityCode: '925',
  purityPercentage: 92.5,
};

describe('useCartStore', () => {
  beforeEach(() => {
    act(() => {
      useCartStore.getState().clear();
    });
  });

  describe('addItem', () => {
    it('adds item to empty cart', () => {
      act(() => {
        useCartStore.getState().addItem(LABEL_1);
      });
      expect(useCartStore.getState().items).toHaveLength(1);
      expect(useCartStore.getState().items[0].labelNo).toBe('GP/1');
    });

    it('adds multiple items', () => {
      act(() => {
        useCartStore.getState().addItem(LABEL_1);
        useCartStore.getState().addItem(LABEL_2);
      });
      expect(useCartStore.getState().items).toHaveLength(2);
    });

    it('does not add duplicate item', () => {
      act(() => {
        useCartStore.getState().addItem(LABEL_1);
        useCartStore.getState().addItem(LABEL_1);
      });
      expect(useCartStore.getState().items).toHaveLength(1);
    });

    it('preserves all cart label fields', () => {
      act(() => {
        useCartStore.getState().addItem(LABEL_1);
      });
      const item = useCartStore.getState().items[0];
      expect(item.id).toBe(1);
      expect(item.labelNo).toBe('GP/1');
      expect(item.itemId).toBe(10);
      expect(item.itemName).toBe('Gold Pendant 22KT');
      expect(item.grossWeight).toBe(5.2);
      expect(item.netWeight).toBe(4.8);
      expect(item.pcsCount).toBe(1);
      expect(item.metalType).toBe('Gold');
      expect(item.purityCode).toBe('22KT');
      expect(item.purityPercentage).toBe(91.6);
      expect(item.labourRate).toBe(500);
    });
  });

  describe('removeItem', () => {
    it('removes item by label id', () => {
      act(() => {
        useCartStore.getState().addItem(LABEL_1);
        useCartStore.getState().addItem(LABEL_2);
        useCartStore.getState().removeItem(1);
      });
      expect(useCartStore.getState().items).toHaveLength(1);
      expect(useCartStore.getState().items[0].id).toBe(2);
    });

    it('does nothing if id not in cart', () => {
      act(() => {
        useCartStore.getState().addItem(LABEL_1);
        useCartStore.getState().removeItem(999);
      });
      expect(useCartStore.getState().items).toHaveLength(1);
    });
  });

  describe('toggleItem', () => {
    it('adds item when not in cart', () => {
      act(() => {
        useCartStore.getState().toggleItem(LABEL_1);
      });
      expect(useCartStore.getState().items).toHaveLength(1);
    });

    it('removes item when already in cart', () => {
      act(() => {
        useCartStore.getState().addItem(LABEL_1);
        useCartStore.getState().toggleItem(LABEL_1);
      });
      expect(useCartStore.getState().items).toHaveLength(0);
    });

    it('toggling twice returns to original state', () => {
      act(() => {
        useCartStore.getState().toggleItem(LABEL_1);
        useCartStore.getState().toggleItem(LABEL_1);
      });
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });

  describe('isInCart', () => {
    it('returns true for item in cart', () => {
      act(() => {
        useCartStore.getState().addItem(LABEL_1);
      });
      expect(useCartStore.getState().isInCart(1)).toBe(true);
    });

    it('returns false for item not in cart', () => {
      expect(useCartStore.getState().isInCart(999)).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all items', () => {
      act(() => {
        useCartStore.getState().addItem(LABEL_1);
        useCartStore.getState().addItem(LABEL_2);
        useCartStore.getState().addItem(LABEL_3);
        useCartStore.getState().clear();
      });
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });
});
