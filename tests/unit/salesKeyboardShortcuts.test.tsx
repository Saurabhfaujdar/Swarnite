// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useRef, useState, useMemo } from 'react';
import { useKeyboardShortcuts } from '../../src/lib/useKeyboardShortcuts';

/**
 * Tests that keyboard shortcuts work correctly in a component context
 * that mirrors the Sales/Layaway entry pages' shortcut pattern.
 */

function fireKey(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  return event;
}

// A mini component that mirrors the Sales entry shortcut pattern
function SalesShortcutTestHarness() {
  const cashRef = useRef<HTMLInputElement>(null);
  const bankRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const [cashAmount, setCashAmount] = useState(0);
  const [saved, setSaved] = useState(false);
  const voucherAmount = 10000;

  const shortcuts = useMemo(() => ({
    F2: () => setShowCustomer(true),
    F5: () => cashRef.current?.focus(),
    F6: () => bankRef.current?.focus(),
    F7: () => cardRef.current?.focus(),
    F10: () => { setCashAmount(voucherAmount); cashRef.current?.focus(); },
    F12: () => setSaved(true),
  }), [voucherAmount]);
  useKeyboardShortcuts(shortcuts);

  return (
    <div>
      {showCustomer && <div data-testid="customer-modal">Customer Modal</div>}
      {saved && <div data-testid="saved">Saved!</div>}
      <label>
        Cash
        <input ref={cashRef} data-testid="cash-input" type="number" value={cashAmount} onChange={(e) => setCashAmount(Number(e.target.value))} />
      </label>
      <label>
        Bank
        <input ref={bankRef} data-testid="bank-input" type="number" />
      </label>
      <label>
        Card
        <input ref={cardRef} data-testid="card-input" type="number" />
      </label>

      {/* Function key buttons (click-based) */}
      <button onClick={() => setShowCustomer(true)}>Customer (F2)</button>
      <button onClick={() => cashRef.current?.focus()}>Cash (F5)</button>
      <button onClick={() => bankRef.current?.focus()}>Bank (F6)</button>
      <button onClick={() => cardRef.current?.focus()}>Card (F7)</button>
      <button onClick={() => { setCashAmount(voucherAmount); cashRef.current?.focus(); }}>Cash Effect (F10)</button>
      <button onClick={() => setSaved(true)}>AP (F12)</button>
    </div>
  );
}

function renderHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SalesShortcutTestHarness />
    </QueryClientProvider>,
  );
}

describe('Sales Keyboard Shortcuts Integration', () => {
  it('F2 opens customer modal', () => {
    renderHarness();
    expect(screen.queryByTestId('customer-modal')).not.toBeInTheDocument();

    act(() => { fireKey('F2'); });
    expect(screen.getByTestId('customer-modal')).toBeInTheDocument();
  });

  it('F5 focuses cash input', () => {
    renderHarness();
    const cashInput = screen.getByTestId('cash-input');
    expect(document.activeElement).not.toBe(cashInput);

    act(() => { fireKey('F5'); });
    expect(document.activeElement).toBe(cashInput);
  });

  it('F6 focuses bank input', () => {
    renderHarness();
    const bankInput = screen.getByTestId('bank-input');

    act(() => { fireKey('F6'); });
    expect(document.activeElement).toBe(bankInput);
  });

  it('F7 focuses card input', () => {
    renderHarness();
    const cardInput = screen.getByTestId('card-input');

    act(() => { fireKey('F7'); });
    expect(document.activeElement).toBe(cardInput);
  });

  it('F10 (Cash Effect) sets cash = voucher amount and focuses cash', () => {
    renderHarness();
    const cashInput = screen.getByTestId('cash-input') as HTMLInputElement;
    expect(cashInput.value).toBe('0');

    act(() => { fireKey('F10'); });
    expect(cashInput.value).toBe('10000');
    expect(document.activeElement).toBe(cashInput);
  });

  it('F12 triggers save', () => {
    renderHarness();
    expect(screen.queryByTestId('saved')).not.toBeInTheDocument();

    act(() => { fireKey('F12'); });
    expect(screen.getByTestId('saved')).toBeInTheDocument();
  });

  it('clicking Customer (F2) button opens modal', () => {
    renderHarness();
    fireEvent.click(screen.getByText('Customer (F2)'));
    expect(screen.getByTestId('customer-modal')).toBeInTheDocument();
  });

  it('clicking Cash (F5) button focuses cash input', () => {
    renderHarness();
    fireEvent.click(screen.getByText('Cash (F5)'));
    expect(document.activeElement).toBe(screen.getByTestId('cash-input'));
  });

  it('clicking Bank (F6) button focuses bank input', () => {
    renderHarness();
    fireEvent.click(screen.getByText('Bank (F6)'));
    expect(document.activeElement).toBe(screen.getByTestId('bank-input'));
  });

  it('clicking Card (F7) button focuses card input', () => {
    renderHarness();
    fireEvent.click(screen.getByText('Card (F7)'));
    expect(document.activeElement).toBe(screen.getByTestId('card-input'));
  });

  it('clicking Cash Effect (F10) sets cash and focuses', () => {
    renderHarness();
    fireEvent.click(screen.getByText('Cash Effect (F10)'));
    const cashInput = screen.getByTestId('cash-input') as HTMLInputElement;
    expect(cashInput.value).toBe('10000');
    expect(document.activeElement).toBe(cashInput);
  });

  it('clicking AP (F12) triggers save', () => {
    renderHarness();
    fireEvent.click(screen.getByText('AP (F12)'));
    expect(screen.getByTestId('saved')).toBeInTheDocument();
  });

  it('non-mapped function keys do nothing', () => {
    renderHarness();
    act(() => { fireKey('F8'); });
    act(() => { fireKey('F9'); });
    expect(screen.queryByTestId('customer-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('saved')).not.toBeInTheDocument();
  });

  it('prevents default browser action for mapped keys', () => {
    renderHarness();
    const e = fireKey('F5');
    expect(e.defaultPrevented).toBe(true);
  });

  it('does not prevent default for unmapped keys', () => {
    renderHarness();
    const e = fireKey('F8');
    expect(e.defaultPrevented).toBe(false);
  });
});
