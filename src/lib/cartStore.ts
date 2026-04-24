import { create } from 'zustand';

export interface CartLabel {
  id: number;
  labelNo: string;
  itemId: number;
  itemName: string;
  grossWeight: number;
  netWeight: number;
  pcsCount: number;
  status: string;
  huid?: string;
  size?: string;
  counterCode?: string;
  metalType?: string;
  purityCode?: string;
  purityPercentage?: number;
  labourRate?: number;
}

interface CartState {
  items: CartLabel[];
  addItem: (item: CartLabel) => void;
  removeItem: (labelId: number) => void;
  toggleItem: (item: CartLabel) => void;
  isInCart: (labelId: number) => boolean;
  clear: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addItem: (item) =>
    set((state) => {
      if (state.items.find((i) => i.id === item.id)) return state;
      return { items: [...state.items, item] };
    }),
  removeItem: (labelId) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== labelId) })),
  toggleItem: (item) => {
    const state = get();
    if (state.items.find((i) => i.id === item.id)) {
      set({ items: state.items.filter((i) => i.id !== item.id) });
    } else {
      set({ items: [...state.items, item] });
    }
  },
  isInCart: (labelId) => get().items.some((i) => i.id === labelId),
  clear: () => set({ items: [] }),
}));
