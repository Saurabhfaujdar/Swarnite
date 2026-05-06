// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import AddToCartPartialModal from '../../src/components/AddToCartPartialModal';

const baseProps = {
  labelNo: 'GE/35',
  itemName: 'Gold Earring 22KT',
  totalPcs: 10,
  totalGrossWeight: 120,
  totalNetWeight: 120,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AddToCartPartialModal', () => {
  it('defaults to 1 piece with proportional per-pc weights', () => {
    const onConfirm = vi.fn();
    render(
      <AddToCartPartialModal
        {...baseProps}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    );

    // selected pcs input defaults to 1
    const sel = screen.getByTestId('selected-pcs-input') as HTMLInputElement;
    expect(sel.value).toBe('1');

    // single per-pc row defaults to 120/10 = 12
    const gross = screen.getByTestId('pc-gross-0') as HTMLInputElement;
    expect(Number(gross.value)).toBeCloseTo(12, 6);

    // sum totals reflect 1 pc × 12g
    expect(screen.getByTestId('sum-gross').textContent).toMatch(/12\.000/);
  });

  it('lets the user pick 3 pcs with custom weights and confirms with summed totals', () => {
    const onConfirm = vi.fn();
    render(
      <AddToCartPartialModal
        {...baseProps}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    );

    // Bump pcs to 3 — three rows with default 12g each (=120/10).
    const sel = screen.getByTestId('selected-pcs-input') as HTMLInputElement;
    fireEvent.change(sel, { target: { value: '3' } });

    // Override per-pc weights to 12, 10, 10 (gross).
    fireEvent.change(screen.getByTestId('pc-gross-0'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('pc-gross-1'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('pc-gross-2'), { target: { value: '10' } });
    // Net weights match gross for this scenario.
    fireEvent.change(screen.getByTestId('pc-net-0'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('pc-net-1'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('pc-net-2'), { target: { value: '10' } });

    // Sum totals = 32g.
    expect(screen.getByTestId('sum-gross').textContent).toMatch(/32\.000/);
    expect(screen.getByTestId('sum-net').textContent).toMatch(/32\.000/);

    // Remaining preview = 120 - 32 = 88g, 7 pcs.
    expect(screen.getByTestId('remaining-summary').textContent).toMatch(/7 pc/);
    expect(screen.getByTestId('remaining-summary').textContent).toMatch(/88\.000/);

    // Confirm.
    fireEvent.click(screen.getByTestId('confirm-add'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      selectedPcs: 3,
      selectedGrossWeight: 32,
      selectedNetWeight: 32,
      perPcGross: [12, 10, 10],
      perPcNet: [12, 10, 10],
    });
  });

  it('blocks confirm when selected gross exceeds label gross', () => {
    const onConfirm = vi.fn();
    render(
      <AddToCartPartialModal
        {...baseProps}
        totalGrossWeight={30}
        totalNetWeight={28}
        totalPcs={3}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    );

    fireEvent.change(screen.getByTestId('selected-pcs-input'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('pc-gross-0'), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId('pc-gross-1'), { target: { value: '20' } });

    const errors = screen.getByTestId('errors');
    expect(errors.textContent).toMatch(/exceeds label gross/);

    const confirm = screen.getByTestId('confirm-add') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('blocks confirm when net exceeds gross on any row', () => {
    const onConfirm = vi.fn();
    render(
      <AddToCartPartialModal
        {...baseProps}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    );

    fireEvent.change(screen.getByTestId('selected-pcs-input'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('pc-gross-0'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('pc-net-0'), { target: { value: '6' } });

    const errors = screen.getByTestId('errors');
    expect(errors.textContent).toMatch(/Pc #1: net cannot exceed gross/);

    expect((screen.getByTestId('confirm-add') as HTMLButtonElement).disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('caps selected pcs at totalPcs', () => {
    render(
      <AddToCartPartialModal
        {...baseProps}
        totalPcs={3}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );

    const sel = screen.getByTestId('selected-pcs-input') as HTMLInputElement;
    fireEvent.change(sel, { target: { value: '99' } });
    expect(sel.value).toBe('3'); // clamped
  });
});
