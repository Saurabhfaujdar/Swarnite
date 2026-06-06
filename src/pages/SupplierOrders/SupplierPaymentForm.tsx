/**
 * SupplierPaymentForm
 * ───────────────────
 * Form for recording advance or delivery payment.
 */
import { useState } from 'react';
import { IndianRupee } from 'lucide-react';

interface Props {
  type: 'advance' | 'payment';
  maxAmount?: number;
  onSubmit: (data: any) => void;
  isPending: boolean;
  onCancel: () => void;
}

export default function SupplierPaymentForm({ type, maxAmount, onSubmit, isPending, onCancel }: Props) {
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(amount) <= 0) return;
    onSubmit({
      amount: Number(amount),
      paymentMode,
      reference: reference || undefined,
      remarks: remarks || undefined,
    });
  };

  const title = type === 'advance' ? 'Record Advance Payment' : 'Record Payment';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <IndianRupee size={16} /> {title}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-gray-500">Amount *</label>
          <input type="number" step="0.01" min="0.01" required
            max={maxAmount || undefined}
            className="w-full border rounded px-2 py-1 text-xs"
            value={amount} onChange={e => setAmount(e.target.value)} />
          {maxAmount && (
            <span className="text-[10px] text-gray-400">Max: ₹{maxAmount.toFixed(2)}</span>
          )}
        </div>
        <div>
          <label className="text-[11px] text-gray-500">Payment Mode</label>
          <select className="w-full border rounded px-2 py-1 text-xs"
            value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="NEFT">NEFT/RTGS</option>
            <option value="CHEQUE">Cheque</option>
            <option value="CARD">Card</option>
            <option value="METAL">Metal</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-gray-500">Reference / UTR</label>
          <input className="w-full border rounded px-2 py-1 text-xs"
            value={reference} onChange={e => setReference(e.target.value)}
            placeholder="Transaction reference" />
        </div>
        <div>
          <label className="text-[11px] text-gray-500">Remarks</label>
          <input className="w-full border rounded px-2 py-1 text-xs"
            value={remarks} onChange={e => setRemarks(e.target.value)} />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs border rounded text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={isPending}
          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
          {isPending ? 'Processing...' : `Pay ₹${Number(amount || 0).toFixed(2)}`}
        </button>
      </div>
    </form>
  );
}
