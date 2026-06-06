/**
 * SupplierInvoiceForm
 * ───────────────────
 * Form to record supplier invoice against an order.
 */
import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';

interface Props {
  orderId: number;
  advancePaid: number;
  onSubmit: (data: any) => void;
  isPending: boolean;
  onCancel: () => void;
}

export default function SupplierInvoiceForm({ advancePaid, onSubmit, isPending, onCancel }: Props) {
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [taxableAmount, setTaxableAmount] = useState('');
  const [cgstAmount, setCgst] = useState('');
  const [sgstAmount, setSgst] = useState('');
  const [igstAmount, setIgst] = useState('');
  const [otherCharges, setOtherCharges] = useState('0');
  const [discountAmount, setDiscount] = useState('0');
  const [advanceAdjusted, setAdvAdj] = useState(String(advancePaid || 0));

  const gst = Number(cgstAmount || 0) + Number(sgstAmount || 0) + Number(igstAmount || 0);
  const total = Number(taxableAmount || 0) + gst + Number(otherCharges || 0) - Number(discountAmount || 0);
  const due = total - Number(advanceAdjusted || 0);

  useEffect(() => { setAdvAdj(String(Math.min(advancePaid, total))); }, [advancePaid, total]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierInvoiceNo.trim()) return;
    if (Number(taxableAmount) <= 0) return;
    onSubmit({
      supplierInvoiceNo: supplierInvoiceNo.trim(),
      taxableAmount: Number(taxableAmount),
      cgstAmount: Number(cgstAmount) || 0,
      sgstAmount: Number(sgstAmount) || 0,
      igstAmount: Number(igstAmount) || 0,
      otherCharges: Number(otherCharges) || 0,
      discountAmount: Number(discountAmount) || 0,
      advanceAdjusted: Number(advanceAdjusted) || 0,
      totalAmount: total,
      dueAmount: due,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <FileText size={16} /> Record Supplier Invoice
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-gray-500">Supplier Invoice No *</label>
          <input className="w-full border rounded px-2 py-1 text-xs" required
            value={supplierInvoiceNo} onChange={e => setSupplierInvoiceNo(e.target.value)}
            placeholder="e.g. JJ/2025/001" />
        </div>
        <div>
          <label className="text-[11px] text-gray-500">Taxable Amount *</label>
          <input type="number" step="0.01" min="0.01" required
            className="w-full border rounded px-2 py-1 text-xs"
            value={taxableAmount} onChange={e => setTaxableAmount(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] text-gray-500">CGST</label>
          <input type="number" step="0.01" className="w-full border rounded px-2 py-1 text-xs"
            value={cgstAmount} onChange={e => setCgst(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500">SGST</label>
          <input type="number" step="0.01" className="w-full border rounded px-2 py-1 text-xs"
            value={sgstAmount} onChange={e => setSgst(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500">IGST</label>
          <input type="number" step="0.01" className="w-full border rounded px-2 py-1 text-xs"
            value={igstAmount} onChange={e => setIgst(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] text-gray-500">Other Charges</label>
          <input type="number" step="0.01" className="w-full border rounded px-2 py-1 text-xs"
            value={otherCharges} onChange={e => setOtherCharges(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500">Discount</label>
          <input type="number" step="0.01" className="w-full border rounded px-2 py-1 text-xs"
            value={discountAmount} onChange={e => setDiscount(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500">Advance Adjusted</label>
          <input type="number" step="0.01" className="w-full border rounded px-2 py-1 text-xs"
            value={advanceAdjusted} onChange={e => setAdvAdj(e.target.value)}
            max={advancePaid} />
        </div>
      </div>

      <div className="flex items-center gap-4 bg-gray-50 px-3 py-2 rounded text-xs">
        <span>GST: <strong>₹{gst.toFixed(2)}</strong></span>
        <span>Total: <strong>₹{total.toFixed(2)}</strong></span>
        <span className={due > 0 ? 'text-red-600' : 'text-green-600'}>
          Due: <strong>₹{due.toFixed(2)}</strong>
        </span>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs border rounded text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={isPending}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {isPending ? 'Saving...' : 'Record Invoice'}
        </button>
      </div>
    </form>
  );
}
