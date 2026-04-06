import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { layawayAPI } from '../../lib/api';
import { formatIndianNumber, formatDate, formatWeight } from '../../lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

type Tab = 'items' | 'payments' | 'history' | 'conversion';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  PARTIALLY_PAID: 'bg-blue-100 text-blue-800',
  OVERDUE: 'bg-red-100 text-red-800',
  READY_FOR_CONVERSION: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-purple-100 text-purple-800',
  CONVERTED: 'bg-gray-200 text-gray-600',
  CANCELLED: 'bg-red-50 text-red-400',
  EXPIRED: 'bg-orange-100 text-orange-700',
};

const CONVERTIBLE = ['ACTIVE', 'PARTIALLY_PAID', 'READY_FOR_CONVERSION', 'OVERDUE'];

export default function LayawayDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('items');

  // Add Payment modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Cash');
  const [payRef, setPayRef] = useState('');
  const [payNarration, setPayNarration] = useState('');

  // Convert modal state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [finalPaymentAmount, setFinalPaymentAmount] = useState('');
  const [finalPaymentMode, setFinalPaymentMode] = useState('Cash');
  const [saleVoucherNo, setSaleVoucherNo] = useState('');

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: layaway, isLoading } = useQuery({
    queryKey: ['layaway', id],
    queryFn: () => layawayAPI.get(Number(id)).then((r) => r.data),
    enabled: !!id,
  });

  const { data: preview, isFetching: previewLoading, refetch: fetchPreview } = useQuery({
    queryKey: ['layaway-preview', id],
    queryFn: () => layawayAPI.conversionPreview(Number(id)).then((r) => r.data),
    enabled: false,
  });

  const payMutation = useMutation({
    mutationFn: (data: any) => layawayAPI.addPayment(Number(id), data),
    onSuccess: () => {
      toast.success('Payment recorded');
      queryClient.invalidateQueries({ queryKey: ['layaway', id] });
      queryClient.invalidateQueries({ queryKey: ['layaways'] });
      setShowPayModal(false);
      setPayAmount(''); setPayRef(''); setPayNarration('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to record payment'),
  });

  const convertMutation = useMutation({
    mutationFn: (data: any) => layawayAPI.convert(Number(id), data),
    onSuccess: () => {
      toast.success('Layaway converted to sale!');
      queryClient.invalidateQueries({ queryKey: ['layaway', id] });
      queryClient.invalidateQueries({ queryKey: ['layaways'] });
      queryClient.invalidateQueries({ queryKey: ['sales-list'] });
      setShowConvertModal(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to convert'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => layawayAPI.cancel(Number(id), cancelReason),
    onSuccess: () => {
      toast.success('Layaway cancelled');
      queryClient.invalidateQueries({ queryKey: ['layaway', id] });
      queryClient.invalidateQueries({ queryKey: ['layaways'] });
      queryClient.invalidateQueries({ queryKey: ['labels-list'] });
      setShowCancelModal(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to cancel'),
  });

  const submitPayment = () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return toast.error('Enter valid amount');
    payMutation.mutate({ amount, paymentMode: payMode, reference: payRef || null, narration: payNarration || null });
  };

  const submitConvert = () => {
    convertMutation.mutate({
      finalPaymentAmount: Number(finalPaymentAmount) || 0,
      finalPaymentMode,
      saleVoucherNo: saleVoucherNo || null,
    });
  };

  const handleOpenConvert = () => {
    fetchPreview();
    setShowConvertModal(true);
  };

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading layaway details...</div>;
  if (!layaway) return <div className="p-8 text-center text-red-500">Layaway not found</div>;

  const paid = Number(layaway.paymentAmount);
  const balance = Number(layaway.voucherAmount) - paid;
  const isConvertible = CONVERTIBLE.includes(layaway.status);
  const isCancellable = !['CANCELLED', 'CONVERTED', 'EXPIRED'].includes(layaway.status);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'items', label: `Items (${layaway.items?.length || 0})` },
    { key: 'payments', label: `Payments (${layaway.payments?.length || 0})` },
    { key: 'history', label: 'Status History' },
    { key: 'conversion', label: 'Conversion Preview' },
  ];

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/layaway/list')} className="text-gray-400 hover:text-gray-700 text-sm">← Back</button>
            <span className="font-bold text-blue-700">{layaway.voucherNo}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[layaway.status] || 'bg-gray-100'}`}>
              {layaway.status?.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex gap-2">
            {isConvertible && (
              <button onClick={handleOpenConvert} className="btn-success text-xs">Convert to Sale</button>
            )}
            {isConvertible && (
              <button onClick={() => setShowPayModal(true)} className="btn-primary text-xs">+ Add Payment</button>
            )}
            {isCancellable && (
              <button onClick={() => setShowCancelModal(true)} className="btn-danger text-xs">Cancel Layaway</button>
            )}
          </div>
        </div>

        {/* Summary row */}
        <div className="panel-body">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500">Customer</div>
              <div className="font-semibold">{layaway.account?.name}</div>
              <div className="text-xs text-gray-400">{layaway.account?.mobile}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Booking Date / Expiry</div>
              <div className="font-semibold">{formatDate(layaway.voucherDate)}</div>
              <div className={`text-xs ${layaway.expiryDate && new Date(layaway.expiryDate) < new Date() ? 'text-red-600' : 'text-gray-400'}`}>
                {layaway.expiryDate ? `Expires: ${formatDate(layaway.expiryDate)}` : 'No expiry set'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Pricing Model</div>
              <div className="font-semibold">{layaway.pricingModel || 'FLOATING'}</div>
              <div className="text-xs text-gray-400">Salesman: {layaway.salesmanName || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Branch / Voucher</div>
              <div className="font-semibold">{layaway.branch?.name}</div>
              <div className="text-xs text-gray-400">{layaway.voucherNo}</div>
            </div>
          </div>

          {/* Amount Summary */}
          <div className="mt-3 flex gap-6 bg-gray-50 rounded p-3 text-sm">
            <div className="text-center">
              <div className="text-xs text-gray-500">Booking Value</div>
              <div className="font-bold text-blue-700">₹{formatIndianNumber(layaway.voucherAmount)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Total Paid</div>
              <div className="font-bold text-green-700">₹{formatIndianNumber(paid)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Balance Due</div>
              <div className={`font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>₹{formatIndianNumber(balance)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">CGST + SGST</div>
              <div className="font-bold text-gray-700">₹{formatIndianNumber(Number(layaway.cgstAmount) + Number(layaway.sgstAmount))}</div>
            </div>
            {layaway.convertedToSaleId && (
              <div className="text-center">
                <div className="text-xs text-gray-500">Converted To</div>
                <div className="font-bold text-purple-700">{layaway.convertedToSaleId}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="panel flex-1 overflow-auto flex flex-col">
        <div className="flex border-b">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveTab(t.key); if (t.key === 'conversion') fetchPreview(); }}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-blue-600 text-blue-700 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-3">
          {/* ITEMS TAB */}
          {activeTab === 'items' && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Label No</th>
                  <th>Item Name</th>
                  <th className="text-center">Pcs</th>
                  <th className="text-right">Gross Wt</th>
                  <th className="text-right">Net Wt</th>
                  <th className="text-right">Fine Wt</th>
                  <th className="text-right">Metal Rate</th>
                  <th className="text-right">Metal Amt</th>
                  <th className="text-right">Labour</th>
                  <th className="text-right">Taxable</th>
                  <th className="text-right">Total Amt</th>
                </tr>
              </thead>
              <tbody>
                {layaway.items?.map((item: any) => (
                  <tr key={item.id} className="hover:bg-blue-50">
                    <td className="font-medium">{item.labelNo}</td>
                    <td>{item.itemName}</td>
                    <td className="text-center">{item.pcs}</td>
                    <td className="text-right">{formatWeight(item.grossWeight)}</td>
                    <td className="text-right">{formatWeight(item.netWeight)}</td>
                    <td className="text-right">{formatWeight(item.fineWeight)}</td>
                    <td className="text-right">{formatIndianNumber(item.metalRate)}</td>
                    <td className="text-right">{formatIndianNumber(item.metalAmount)}</td>
                    <td className="text-right">{formatIndianNumber(item.labourAmount)}</td>
                    <td className="text-right">{formatIndianNumber(item.taxableAmount)}</td>
                    <td className="text-right font-semibold text-blue-700">{formatIndianNumber(item.totalAmount)}</td>
                  </tr>
                ))}
                {!layaway.items?.length && (
                  <tr><td colSpan={11} className="text-center text-gray-400 py-6">No items</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* PAYMENTS TAB */}
          {activeTab === 'payments' && (
            <div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Mode</th>
                    <th className="text-right">Amount</th>
                    <th>Reference</th>
                    <th>Narration</th>
                  </tr>
                </thead>
                <tbody>
                  {layaway.payments?.map((p: any, idx: number) => (
                    <tr key={p.id} className="hover:bg-blue-50">
                      <td>{idx + 1}</td>
                      <td>{formatDate(p.paymentDate)}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">{p.paymentMode}</span>
                      </td>
                      <td className="text-right font-semibold text-green-700">₹{formatIndianNumber(p.amount)}</td>
                      <td>{p.reference || '—'}</td>
                      <td className="text-gray-500 text-xs">{p.narration || '—'}</td>
                    </tr>
                  ))}
                  {!layaway.payments?.length && (
                    <tr><td colSpan={6} className="text-center text-gray-400 py-6">No payments recorded yet</td></tr>
                  )}
                </tbody>
              </table>
              {layaway.payments?.length > 0 && (
                <div className="flex justify-end mt-2 text-sm font-bold text-green-700 px-2">
                  Total Paid: ₹{formatIndianNumber(layaway.payments.reduce((s: number, p: any) => s + Number(p.amount), 0))}
                </div>
              )}
            </div>
          )}

          {/* STATUS HISTORY TAB */}
          {activeTab === 'history' && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Changed By</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {layaway.statusHistory?.map((h: any) => (
                  <tr key={h.id} className="hover:bg-blue-50">
                    <td className="text-xs">{new Date(h.changedAt).toLocaleString('en-IN')}</td>
                    <td>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[h.fromStatus] || 'bg-gray-100'}`}>
                        {h.fromStatus?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[h.toStatus] || 'bg-gray-100'}`}>
                        {h.toStatus?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{h.changedBy}</td>
                    <td className="text-gray-500 text-xs">{h.reason || '—'}</td>
                  </tr>
                ))}
                {!layaway.statusHistory?.length && (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-6">No status history</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* CONVERSION PREVIEW TAB */}
          {activeTab === 'conversion' && (
            <div>
              {previewLoading && <div className="text-center py-8 text-gray-400">Loading current rates...</div>}
              {!previewLoading && preview && (
                <div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-blue-50 rounded p-3 text-center">
                      <div className="text-xs text-gray-500">Booking Value</div>
                      <div className="font-bold text-blue-700">₹{formatIndianNumber(preview.bookingValue)}</div>
                    </div>
                    <div className="bg-yellow-50 rounded p-3 text-center">
                      <div className="text-xs text-gray-500">Current Value ({preview.pricingModel})</div>
                      <div className="font-bold text-yellow-700">₹{formatIndianNumber(preview.totalCurrentValue)}</div>
                    </div>
                    <div className={`rounded p-3 text-center ${preview.totalVariance >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                      <div className="text-xs text-gray-500">Variance</div>
                      <div className={`font-bold ${preview.totalVariance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {preview.totalVariance >= 0 ? '+' : ''}₹{formatIndianNumber(preview.totalVariance)}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded p-3 text-center">
                      <div className="text-xs text-gray-500">Balance Due (Current)</div>
                      <div className="font-bold text-red-600">₹{formatIndianNumber(preview.balanceDue)}</div>
                    </div>
                  </div>

                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Label No</th>
                        <th>Item Name</th>
                        <th className="text-right">Net Wt</th>
                        <th className="text-right">Rate at Booking</th>
                        <th className="text-right">Current Rate</th>
                        <th className="text-right">Booking Value</th>
                        <th className="text-right">Current Value</th>
                        <th className="text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.items.map((item: any) => (
                        <tr key={item.id} className={item.variance > 0 ? 'bg-red-50' : item.variance < 0 ? 'bg-green-50' : ''}>
                          <td className="font-medium">{item.labelNo}</td>
                          <td>{item.itemName}</td>
                          <td className="text-right">{formatWeight(item.netWeight)}</td>
                          <td className="text-right">{formatIndianNumber(item.metalRateAtBooking)}</td>
                          <td className="text-right">{formatIndianNumber(item.currentMetalRate)}</td>
                          <td className="text-right">{formatIndianNumber(item.bookingItemValue)}</td>
                          <td className="text-right font-semibold">{formatIndianNumber(item.currentItemValue)}</td>
                          <td className={`text-right font-semibold ${item.variance > 0 ? 'text-red-600' : item.variance < 0 ? 'text-green-600' : ''}`}>
                            {item.variance > 0 ? '+' : ''}{formatIndianNumber(item.variance)}
                            {item.variance !== 0 && <span className="text-xs ml-1">({item.variancePct}%)</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {preview.pricingModel === 'LOCKED' && (
                    <div className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                      ℹ️ <strong>Locked pricing</strong>: Final invoice will use booking rates. Variance is shown for reference only.
                    </div>
                  )}
                  {preview.pricingModel === 'FLOATING' && (
                    <div className="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                      ℹ️ <strong>Floating pricing</strong>: Final invoice will use current market rates. Customer pays ₹{formatIndianNumber(preview.balanceDue)}.
                    </div>
                  )}
                  {preview.pricingModel === 'HYBRID' && (
                    <div className="mt-2 text-xs text-purple-700 bg-purple-50 p-2 rounded">
                      ℹ️ <strong>Hybrid pricing</strong>: Making charges locked at booking; metal value recalculated at current rate.
                    </div>
                  )}
                </div>
              )}
              {!previewLoading && !preview && (
                <div className="text-center py-8">
                  <button onClick={() => fetchPreview()} className="btn-primary text-xs">Load Conversion Preview</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ADD PAYMENT MODAL */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 p-5">
            <div className="font-bold text-base mb-1">Add Payment</div>
            <div className="text-xs text-gray-500 mb-3">
              {layaway.voucherNo} — Balance: <strong className="text-red-600">₹{formatIndianNumber(balance)}</strong>
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label block text-xs">Amount *</label>
                <input type="number" className="form-input w-full" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="form-label block text-xs">Mode</label>
                <select className="form-select w-full" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                  <option>Cash</option><option>UPI</option><option>Bank</option><option>Card</option>
                </select>
              </div>
              <div>
                <label className="form-label block text-xs">Reference</label>
                <input className="form-input w-full" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
              </div>
              <div>
                <label className="form-label block text-xs">Narration</label>
                <input className="form-input w-full" value={payNarration} onChange={(e) => setPayNarration(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={submitPayment} disabled={payMutation.isPending} className="btn-success flex-1">
                {payMutation.isPending ? 'Saving...' : 'Record Payment'}
              </button>
              <button onClick={() => setShowPayModal(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* CONVERT TO SALE MODAL */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[500px] p-5">
            <div className="font-bold text-base mb-1">Convert to Sale</div>
            <div className="text-xs text-gray-500 mb-4">
              {layaway.voucherNo} — {layaway.account?.name}
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-blue-50 rounded p-2 text-center">
                <div className="text-xs text-gray-500">Booking Value</div>
                <div className="font-bold text-blue-700 text-sm">₹{formatIndianNumber(layaway.voucherAmount)}</div>
              </div>
              <div className="bg-green-50 rounded p-2 text-center">
                <div className="text-xs text-gray-500">Already Paid</div>
                <div className="font-bold text-green-700 text-sm">₹{formatIndianNumber(paid)}</div>
              </div>
              <div className="bg-red-50 rounded p-2 text-center">
                <div className="text-xs text-gray-500">Balance Due</div>
                <div className="font-bold text-red-600 text-sm">₹{formatIndianNumber(balance)}</div>
              </div>
            </div>

            {preview && preview.pricingModel !== 'LOCKED' && preview.totalVariance !== 0 && (
              <div className={`mb-3 p-2 rounded text-xs ${preview.totalVariance > 0 ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
                ⚠ <strong>{preview.pricingModel}</strong> pricing: Current value is ₹{formatIndianNumber(preview.totalCurrentValue)}{' '}
                ({preview.totalVariance > 0 ? '+' : ''}₹{formatIndianNumber(preview.totalVariance)} variance).
                Effective balance due: <strong>₹{formatIndianNumber(preview.balanceDue)}</strong>
              </div>
            )}

            <div className="space-y-3">
              {balance > 0 && (
                <>
                  <div>
                    <label className="form-label block text-xs">Final Balance Payment (₹{formatIndianNumber(balance)})</label>
                    <input
                      type="number"
                      className="form-input w-full"
                      value={finalPaymentAmount}
                      onChange={(e) => setFinalPaymentAmount(e.target.value)}
                      placeholder={String(balance)}
                    />
                  </div>
                  <div>
                    <label className="form-label block text-xs">Payment Mode</label>
                    <select className="form-select w-full" value={finalPaymentMode} onChange={(e) => setFinalPaymentMode(e.target.value)}>
                      <option>Cash</option><option>UPI</option><option>Bank</option><option>Card</option>
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="form-label block text-xs">Sale Voucher No (optional — fill after creating sale)</label>
                <input
                  className="form-input w-full"
                  value={saleVoucherNo}
                  onChange={(e) => setSaleVoucherNo(e.target.value)}
                  placeholder="SV/1234"
                />
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-3 text-xs text-yellow-800">
              ⚠ This action will mark all reserved items as SOLD and close the layaway. This cannot be undone.
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={submitConvert} disabled={convertMutation.isPending} className="btn-success flex-1">
                {convertMutation.isPending ? 'Converting...' : 'Confirm Conversion'}
              </button>
              <button onClick={() => setShowConvertModal(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 p-5">
            <div className="font-bold text-base mb-1 text-red-600">Cancel Layaway</div>
            <div className="text-xs text-gray-500 mb-3">
              This will release all reserved items back to stock.
              {paid > 0 && <span className="block mt-1 text-orange-600">⚠ ₹{formatIndianNumber(paid)} was collected. Handle refund manually.</span>}
            </div>
            <div>
              <label className="form-label block text-xs">Reason *</label>
              <textarea
                className="form-input w-full min-h-[60px]"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation..."
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { if (!cancelReason.trim()) { toast.error('Please enter a reason'); return; } cancelMutation.mutate(); }}
                disabled={cancelMutation.isPending}
                className="btn-danger flex-1"
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
              <button onClick={() => setShowCancelModal(false)} className="btn-secondary flex-1">Back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
