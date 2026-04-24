// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts, ShortcutMap } from '../../src/lib/useKeyboardShortcuts';

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  window.dispatchEvent(event);
  return event;
}

describe('useKeyboardShortcuts', () => {
  it('calls the handler when matching key is pressed', () => {
    const fn = vi.fn();
    renderHook(() => useKeyboardShortcuts({ F2: fn }));

    fireKey('F2');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not call handler for non-matching keys', () => {
    const fn = vi.fn();
    renderHook(() => useKeyboardShortcuts({ F5: fn }));

    fireKey('F2');
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls preventDefault on matched key', () => {
    const fn = vi.fn();
    renderHook(() => useKeyboardShortcuts({ F5: fn }));

    const event = fireKey('F5');
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not call preventDefault on non-matched key', () => {
    const fn = vi.fn();
    renderHook(() => useKeyboardShortcuts({ F5: fn }));

    const event = fireKey('F9');
    expect(event.defaultPrevented).toBe(false);
  });

  it('supports multiple shortcuts', () => {
    const f2 = vi.fn();
    const f5 = vi.fn();
    const f12 = vi.fn();
    renderHook(() => useKeyboardShortcuts({ F2: f2, F5: f5, F12: f12 }));

    fireKey('F2');
    fireKey('F5');
    fireKey('F12');

    expect(f2).toHaveBeenCalledTimes(1);
    expect(f5).toHaveBeenCalledTimes(1);
    expect(f12).toHaveBeenCalledTimes(1);
  });

  it('cleans up listener on unmount', () => {
    const fn = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcuts({ F2: fn }));

    unmount();
    fireKey('F2');
    expect(fn).not.toHaveBeenCalled();
  });

  it('updates handler when shortcuts change', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const { rerender } = renderHook(
      ({ shortcuts }: { shortcuts: ShortcutMap }) => useKeyboardShortcuts(shortcuts),
      { initialProps: { shortcuts: { F2: fn1 } } },
    );

    fireKey('F2');
    expect(fn1).toHaveBeenCalledTimes(1);

    rerender({ shortcuts: { F2: fn2 } });
    fireKey('F2');
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn1).toHaveBeenCalledTimes(1); // old handler not called again
  });

  it('ignores keydown from textarea elements', () => {
    const fn = vi.fn();
    renderHook(() => useKeyboardShortcuts({ F2: fn }));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const event = new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: textarea });
    window.dispatchEvent(event);

    expect(fn).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it('works with non-function keys like Escape', () => {
    const fn = vi.fn();
    renderHook(() => useKeyboardShortcuts({ Escape: fn }));

    fireKey('Escape');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires handler multiple times on repeated key presses', () => {
    const fn = vi.fn();
    renderHook(() => useKeyboardShortcuts({ F5: fn }));

    fireKey('F5');
    fireKey('F5');
    fireKey('F5');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
