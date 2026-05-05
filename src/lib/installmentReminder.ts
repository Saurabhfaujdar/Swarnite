/**
 * Builds a wa.me URL for a savings-scheme installment reminder.
 *
 * The message wording differs depending on whether the installment is:
 *   - upcoming (due in N days)
 *   - due today
 *   - overdue (past due by N days)
 *
 * The mobile number is normalised to digits-only and prefixed with the
 * Indian country code (91) when no country code is present. If no mobile
 * is supplied at all we still produce a wa.me/?text=... link so the
 * cashier can pick the contact in WhatsApp themselves.
 */
const SHOP_NAME = 'JAIGURU JEWELS LLP';

export interface InstallmentReminderInput {
  customerName: string;
  mobile?: string | null;
  schemeNo: string;
  installmentNo: number;
  dueDate: string | Date;
  amount: number;
  /** Today, used for relative wording. Defaults to `new Date()`. */
  today?: Date;
}

export interface BuiltReminder {
  url: string;
  message: string;
  bucket: 'upcoming' | 'today' | 'overdue';
  daysFromToday: number;
}

const DAY_MS = 86_400_000;

function normaliseMobile(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  // Already includes a country code (>= 11 digits) — leave as-is
  if (digits.length >= 11) return digits;
  return `91${digits}`;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function formatINDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function buildInstallmentReminder(
  input: InstallmentReminderInput,
): BuiltReminder {
  const today = startOfDay(input.today ?? new Date());
  const due = startOfDay(new Date(input.dueDate));
  const diffDays = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  const bucket: BuiltReminder['bucket'] =
    diffDays > 0 ? 'upcoming' : diffDays === 0 ? 'today' : 'overdue';

  const dueText = formatINDate(due);
  const amountText = `₹${input.amount.toLocaleString('en-IN')}`;

  let lead: string;
  if (bucket === 'upcoming') {
    lead = `This is a friendly reminder that installment #${input.installmentNo} of your savings scheme *${input.schemeNo}* is due on *${dueText}* (in ${diffDays} day${diffDays === 1 ? '' : 's'}).`;
  } else if (bucket === 'today') {
    lead = `Installment #${input.installmentNo} of your savings scheme *${input.schemeNo}* is due *today (${dueText})*.`;
  } else {
    const overdueDays = Math.abs(diffDays);
    lead = `Installment #${input.installmentNo} of your savings scheme *${input.schemeNo}* was due on *${dueText}* and is now ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue.`;
  }

  const message =
    `Dear ${input.customerName},\n\n` +
    `${lead}\n\n` +
    `Amount: *${amountText}*\n\n` +
    `Kindly arrange the payment at your earliest convenience.\n\n` +
    `Thank you! 🙏\n${SHOP_NAME}`;

  const phone = normaliseMobile(input.mobile);
  const encoded = encodeURIComponent(message);
  const url = phone
    ? `https://wa.me/${phone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  return { url, message, bucket, daysFromToday: diffDays };
}
