// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mock react-hot-toast ───────────────────────────────────
vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

// ── Mock api module ────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  inventoryAPI: {
    items: vi.fn(),
    prefixes: vi.fn(),
    createBatch: vi.fn(),
  },
  mastersAPI: {
    counters: vi.fn(),
  },
}));

import { inventoryAPI, mastersAPI } from '../../src/lib/api';
import LabelPreparation from '../../src/pages/Inventory/LabelPreparation';

const mockItems = inventoryAPI.items as ReturnType<typeof vi.fn>;
const mockPrefixes = inventoryAPI.prefixes as ReturnType<typeof vi.fn>;
const mockCreateBatch = inventoryAPI.createBatch as ReturnType<typeof vi.fn>;
const mockCounters = mastersAPI.counters as ReturnType<typeof vi.fn>;

// ── Sample data ────────────────────────────────────────────
const ITEM_TAG_REQUIRED = {
  id: 1,
  name: 'Gold Necklace 22KT',
  itemGroup: { id: 1, name: 'Necklace', requiresTagId: true },
};
const ITEM_BULK = {
  id: 2,
  name: 'Gold Coin 1g',
  itemGroup: { id: 10, name: 'Coin', requiresTagId: false },
};

const PREFIX_GN = { id: 1, prefix: 'GN', description: 'Gold Necklace' };

function renderPrep() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  mockItems.mockResolvedValue({ data: [ITEM_TAG_REQUIRED, ITEM_BULK] });
  mockPrefixes.mockResolvedValue({ data: [PREFIX_GN] });
  mockCounters.mockResolvedValue({ data: [] });
  mockCreateBatch.mockResolvedValue({ data: { count: 1, created: 1 } });

  return render(
    <QueryClientProvider client={qc}>
      <LabelPreparation />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// Pcs editable for tagged labels
// ════════════════════════════════════════════════════════════
describe('LabelPreparation: editable pcs for tagged labels', () => {
  it('Pcs input remains enabled even when Tag ID is provided', async () => {
    const user = userEvent.setup();
    renderPrep();

    // Wait for items to populate the select.
    await screen.findByRole('option', { name: 'Gold Necklace 22KT' }, { timeout: 5000 });

    // Pick the tag-required item. The Item select is the third <select>
    // after Prefix and Counter.
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const itemSelect = selects[selects.length - 1];
    await user.selectOptions(itemSelect, '1');

    // Tag ID field appears once an item is selected.
    const tagInput = screen.getByPlaceholderText('e.g. A001') as HTMLInputElement;
    await user.type(tagInput, 'SET01');

    // Pcs input — the form label (not the table column header).
    const pcsLabel = screen.getAllByText('Pcs').find((el) => el.tagName === 'LABEL') as HTMLElement;
    const pcsInput = pcsLabel.parentElement!.querySelector('input') as HTMLInputElement;
    expect(pcsInput.disabled).toBe(false);
  });

  it('preserves user-supplied pcsCount > 1 when Tag ID is set and forwards it to the API', async () => {
    const user = userEvent.setup();
    renderPrep();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Gold Necklace 22KT' })).toBeTruthy();
    });

    const selects1 = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const itemSelect = selects1[selects1.length - 1];
    await user.selectOptions(itemSelect, '1');

    const tagInput = screen.getByPlaceholderText('e.g. A001') as HTMLInputElement;
    await user.type(tagInput, 'SET01');

    // Gross Wt — required for addEntry to succeed.
    const grossLabel = screen.getByText('Gross Wt (gm)');
    const grossInput = grossLabel.parentElement!.querySelector('input') as HTMLInputElement;
    await user.clear(grossInput);
    await user.type(grossInput, '30');

    // Pcs = 4 (a tagged set of 4 bangles).
    const pcsLabel = screen.getAllByText('Pcs').find((el) => el.tagName === 'LABEL') as HTMLElement;
    const pcsInput = pcsLabel.parentElement!.querySelector('input') as HTMLInputElement;
    await user.clear(pcsInput);
    await user.type(pcsInput, '4');

    await user.click(screen.getByRole('button', { name: /\+ Add/i }));

    // Row appears in the items table with pcs=4.
    await waitFor(() => {
      expect(screen.getByText('SET01')).toBeTruthy();
    });
    // Footer total pcs reflects 4.
    expect(screen.getByText(/Total Pcs: 4/)).toBeTruthy();

    // Submit — verify createBatch payload.
    await user.click(screen.getByRole('button', { name: /Save & Generate Labels/i }));

    await waitFor(() => {
      expect(mockCreateBatch).toHaveBeenCalled();
    });
    const payload = mockCreateBatch.mock.calls[0][0];
    expect(payload.labels).toHaveLength(1);
    expect(payload.labels[0].tagId).toBe('SET01');
    expect(payload.labels[0].pcsCount).toBe(4);
    expect(payload.labels[0].grossWeight).toBe(30);
  });

  it('defaults pcsCount to 1 when user does not change the field for a tagged label', async () => {
    const user = userEvent.setup();
    renderPrep();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Gold Necklace 22KT' })).toBeTruthy();
    });

    const selects2 = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const itemSelect = selects2[selects2.length - 1];
    await user.selectOptions(itemSelect, '1');

    const tagInput = screen.getByPlaceholderText('e.g. A001') as HTMLInputElement;
    await user.type(tagInput, 'SOLO');

    const grossLabel2 = screen.getByText('Gross Wt (gm)');
    const grossInput = grossLabel2.parentElement!.querySelector('input') as HTMLInputElement;
    await user.clear(grossInput);
    await user.type(grossInput, '8');

    await user.click(screen.getByRole('button', { name: /\+ Add/i }));
    await user.click(screen.getByRole('button', { name: /Save & Generate Labels/i }));

    await waitFor(() => {
      expect(mockCreateBatch).toHaveBeenCalled();
    });
    expect(mockCreateBatch.mock.calls[0][0].labels[0].pcsCount).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════
// Sales-side proportional weight derivation (pure math)
// Mirrors RetailSalesEntry's pcsRatio formula:
//   weight_for_x = (label_weight / total_pcs) * x
// ════════════════════════════════════════════════════════════
describe('Sales weight scaling for multi-pc tagged labels', () => {
  function scale(labelWeight: number, totalPcs: number, x: number) {
    return (labelWeight / totalPcs) * x;
  }

  it('computes per-piece weight by dividing label weight by total pcs', () => {
    // Tagged set of 4 bangles, gross=30g, net=28g
    expect(scale(30, 4, 1)).toBeCloseTo(7.5, 6);
    expect(scale(28, 4, 1)).toBeCloseTo(7, 6);
  });

  it('scales weight linearly when selling x of N pcs', () => {
    // Selling 2 of 4 pcs from a 30g tagged set → 15g
    expect(scale(30, 4, 2)).toBeCloseTo(15, 6);
    // Selling all 4 pcs → full label weight
    expect(scale(30, 4, 4)).toBeCloseTo(30, 6);
  });

  it('reduces to identity (no scaling) for single-pc labels', () => {
    expect(scale(12.345, 1, 1)).toBeCloseTo(12.345, 6);
  });
});
