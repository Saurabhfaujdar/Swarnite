// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildInstallmentReminder } from '../../src/lib/installmentReminder';

const baseInput = {
  customerName: 'Asha Kumari',
  mobile: '9876543210',
  schemeNo: 'SCH/42',
  installmentNo: 5,
  amount: 1000,
  // 2 May 2026 (matches the conversation date the feature is being built on)
  today: new Date('2026-05-02T00:00:00'),
};

describe('buildInstallmentReminder', () => {
  it('produces an "upcoming" reminder when due in 2 days', () => {
    const r = buildInstallmentReminder({
      ...baseInput,
      dueDate: new Date('2026-05-04T00:00:00'),
    });
    expect(r.bucket).toBe('upcoming');
    expect(r.daysFromToday).toBe(2);
    expect(r.message).toMatch(/in 2 days/i);
    expect(r.message).toMatch(/SCH\/42/);
    expect(r.message).toMatch(/installment #5/i);
    expect(r.url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
  });

  it('produces a "today" reminder when due today (case 2 / day-of)', () => {
    const r = buildInstallmentReminder({
      ...baseInput,
      dueDate: new Date('2026-05-02T00:00:00'),
    });
    expect(r.bucket).toBe('today');
    expect(r.daysFromToday).toBe(0);
    expect(r.message).toMatch(/due \*today/i);
  });

  it('produces an "overdue" reminder when due 2 days ago', () => {
    const r = buildInstallmentReminder({
      ...baseInput,
      dueDate: new Date('2026-04-30T00:00:00'),
    });
    expect(r.bucket).toBe('overdue');
    expect(r.daysFromToday).toBe(-2);
    expect(r.message).toMatch(/2 days overdue/i);
  });

  it('uses singular grammar for 1 day', () => {
    const r = buildInstallmentReminder({
      ...baseInput,
      dueDate: new Date('2026-05-03T00:00:00'),
    });
    expect(r.message).toMatch(/in 1 day(?!s)/i);
    const r2 = buildInstallmentReminder({
      ...baseInput,
      dueDate: new Date('2026-05-01T00:00:00'),
    });
    expect(r2.message).toMatch(/1 day overdue/i);
  });

  it('prefixes Indian country code 91 to a 10-digit mobile', () => {
    const r = buildInstallmentReminder({
      ...baseInput,
      mobile: '9876543210',
      dueDate: '2026-05-02',
    });
    expect(r.url).toContain('wa.me/919876543210');
  });

  it('keeps the country code intact when the mobile already has 11+ digits', () => {
    const r = buildInstallmentReminder({
      ...baseInput,
      mobile: '+91 98765 43210',
      dueDate: '2026-05-02',
    });
    expect(r.url).toContain('wa.me/919876543210');
  });

  it('falls back to a contact-picker wa.me link when no mobile is provided', () => {
    const r = buildInstallmentReminder({
      ...baseInput,
      mobile: null,
      dueDate: '2026-05-02',
    });
    expect(r.url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it('URL-encodes the message', () => {
    const r = buildInstallmentReminder({
      ...baseInput,
      dueDate: '2026-05-02',
    });
    expect(r.url).toContain(encodeURIComponent('Dear Asha Kumari'));
    expect(r.url).not.toContain('\n'); // newlines must be encoded
  });
});
