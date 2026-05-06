import { create } from 'zustand';

export interface CartLabel {
  id: number;
  labelNo: string;
  itemId: number;
  itemName: string;
  // Effective values used for the sale = sum across selected pcs.
  // For single-pc labels these equal the full label weights.
  grossWeight: number;
  netWeight: number;
  pcsCount: number;
  // Original full-label values (snapshot at the moment of cart-add) so the
  // UI can show "remaining on label = original - selected" and downstream
  // sales code can validate against the source label.
  originalPcsCount?: number;
  originalGrossWeight?: number;
  originalNetWeight?: number;
  // Per-piece weights chosen by the user when partially picking from a
  // multi-pc label. Length equals pcsCount.
  perPcGross?: number[];
  perPcNet?: number[];
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
