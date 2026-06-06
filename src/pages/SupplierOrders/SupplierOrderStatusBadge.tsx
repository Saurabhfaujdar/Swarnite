/**
 * SupplierOrderStatusBadge
 * ────────────────────────
 * Color-coded status chip matching the repair badge pattern.
 */

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  DRAFT: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-700' },
  SENT_TO_SUPPLIER: { label: 'Sent', bg: 'bg-blue-100', text: 'text-blue-700' },
  SUPPLIER_ACKNOWLEDGED: { label: 'Acknowledged', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  ADVANCE_PAID: { label: 'Advance Paid', bg: 'bg-purple-100', text: 'text-purple-700' },
  IN_PRODUCTION: { label: 'In Production', bg: 'bg-yellow-100', text: 'text-yellow-800' },
  DISPATCHED: { label: 'Dispatched', bg: 'bg-cyan-100', text: 'text-cyan-700' },
  PARTIALLY_RECEIVED: { label: 'Partial Receipt', bg: 'bg-orange-100', text: 'text-orange-700' },
  RECEIVED_PENDING_QC: { label: 'Pending QC', bg: 'bg-amber-100', text: 'text-amber-800' },
  QC_COMPLETED: { label: 'QC Done', bg: 'bg-teal-100', text: 'text-teal-700' },
  SHORT_DELIVERED: { label: 'Short Delivered', bg: 'bg-red-100', text: 'text-red-700' },
  EXCESS_DELIVERED: { label: 'Excess Delivered', bg: 'bg-pink-100', text: 'text-pink-700' },
  PURCHASE_POSTED: { label: 'Purchase Posted', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  INVOICE_RECEIVED: { label: 'Invoice Received', bg: 'bg-sky-100', text: 'text-sky-700' },
  PAYMENT_PENDING: { label: 'Payment Pending', bg: 'bg-rose-100', text: 'text-rose-700' },
  CLOSED: { label: 'Closed', bg: 'bg-green-100', text: 'text-green-700' },
  CANCELLED: { label: 'Cancelled', bg: 'bg-red-50', text: 'text-red-500' },
  DISPUTED: { label: 'Disputed', bg: 'bg-red-100', text: 'text-red-800' },
};

export default function SupplierOrderStatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}
