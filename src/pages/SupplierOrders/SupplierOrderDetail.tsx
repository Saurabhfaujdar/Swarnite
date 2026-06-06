/**
 * Supplier Order Detail
 * ─────────────────────
 * Single-page operations console for a supplier order. Sections:
 *   1. Header + status + action buttons
 *   2. Status timeline
 *   3. Ordered items
 *   4. Supplier acknowledgement
 *   5. Advance payments
 *   6. Receipts + QC
 *   7. Weight adjustments
 *   8. Supplier invoice
 *   9. Purchase posting
 *  10. Payments
 *  11. Ledger
 *  12. Notes / audit
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supplierOrderAPI } from '../../lib/api';
import toast from 'react-hot-toast';
import {
  Send, CheckCircle2, IndianRupee, Package, FileText,
  ShoppingCart, XCircle, Lock, AlertTriangle, ArrowLeft,
  Scale, Truck,
} from 'lucide-react';
import SupplierOrderStatusBadge from './SupplierOrderStatusBadge';
import SupplierOrderTimeline from './SupplierOrderTimeline';
import SupplierOrderItemTable from './SupplierOrderItemTable';
import SupplierReceiptForm from './SupplierReceiptForm';
import SupplierQcForm from './SupplierQcForm';
import SupplierInvoiceForm from './SupplierInvoiceForm';
import SupplierPaymentForm from './SupplierPaymentForm';
import SupplierLedgerView from './SupplierLedgerView';
import SupplierOrderApprovalBanner from './SupplierOrderApprovalBanner';

type ActionPanel = 'none' | 'acknowledge' | 'advance' | 'receipt' | 'qc' | 'invoice' | 'payment' | 'close' | 'cancel';

export default function SupplierOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();

  const initialAction = (searchParams.get('action') as ActionPanel) || 'none';
  const [activePanel, setActivePanel] = useState<ActionPanel>(initialAction);
  const [cancelReason, setCancelReason] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-orders', 'detail', orderId],
    queryFn: () => supplierOrderAPI.get(orderId).then(r => r.data),
    enabled: !!orderId,
  });

  const order = data?.order;
  const balance = data?.balance;
  const allowedNextStates: string[] = data?.allowedNextStates || [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['supplier-orders', 'detail', orderId] });

  // ── Computed ───────────────────────────────────────────
  const canSend = order?.status === 'DRAFT';
  const canAcknowledge = order?.status === 'SENT_TO_SUPPLIER';
  const canAdvance = allowedNextStates.includes('ADVANCE_PAID') || order?.status === 'ADVANCE_PAID';
  const canMarkInProduction = allowedNextStates.includes('IN_PRODUCTION');
  const canMarkDispatched = allowedNextStates.includes('DISPATCHED');
  const canMarkFullyReceived = allowedNextStates.includes('RECEIVED_PENDING_QC');
  const canReceipt = ['DISPATCHED', 'PARTIALLY_RECEIVED', 'IN_PRODUCTION', 'SUPPLIER_ACKNOWLEDGED', 'ADVANCE_PAID'].includes(order?.status);
  const canQc = order?.status === 'RECEIVED_PENDING_QC' && (order?.receipts || []).some((r: any) => r.status === 'PENDING_QC');
  const canMarkQcComplete = order?.status === 'RECEIVED_PENDING_QC' && allowedNextStates.includes('QC_COMPLETED')
    && (order?.receipts || []).every((r: any) => r.status === 'QC_PASSED' || r.status === 'PARTIAL_PASS');
  const canMarkShortDelivered = allowedNextStates.includes('SHORT_DELIVERED');
  const canInvoice = ['QC_COMPLETED', 'RECEIVED_PENDING_QC', 'PURCHASE_POSTED', 'SHORT_DELIVERED', 'EXCESS_DELIVERED'].includes(order?.status);
  const canPostPurchase = ['QC_COMPLETED', 'INVOICE_RECEIVED'].includes(order?.status);
  const canPayment = ['INVOICE_RECEIVED', 'PURCHASE_POSTED', 'PAYMENT_PENDING'].includes(order?.status);
  const canClose = allowedNextStates.includes('CLOSED');
  const canCancel = allowedNextStates.includes('CANCELLED');
  const isTerminal = ['CLOSED', 'CANCELLED'].includes(order?.status);

  const pendingApprovals = useMemo(() => {
    return (order?.weightAdjustments || []).filter((wa: any) => wa.approvalRequired && !wa.approvedById).length;
  }, [order?.weightAdjustments]);

  // ── Mutations ──────────────────────────────────────────
  const sendMu = useMutation({
    mutationFn: () => supplierOrderAPI.send(orderId),
    onSuccess: () => { toast.success('Order sent to supplier'); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to send'),
  });

  const acknowledgeMu = useMutation({
    mutationFn: (data: any) => supplierOrderAPI.acknowledge(orderId, data),
    onSuccess: () => { toast.success('Acknowledgement recorded'); setActivePanel('none'); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const advanceMu = useMutation({
    mutationFn: (data: any) => supplierOrderAPI.advancePayment(orderId, data),
    onSuccess: () => { toast.success('Advance payment recorded'); setActivePanel('none'); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const receiptMu = useMutation({
    mutationFn: (data: any) => supplierOrderAPI.receipt(orderId, data),
    onSuccess: () => { toast.success('Receipt recorded'); setActivePanel('none'); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const qcMu = useMutation({
    mutationFn: ({ receiptId, data }: { receiptId: number; data: any }) =>
      supplierOrderAPI.qc(orderId, receiptId, data),
    onSuccess: () => { toast.success('QC recorded'); setActivePanel('none'); setSelectedReceipt(null); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const invoiceMu = useMutation({
    mutationFn: (data: any) => supplierOrderAPI.invoice(orderId, data),
    onSuccess: () => { toast.success('Invoice recorded'); setActivePanel('none'); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const postPurchaseMu = useMutation({
    mutationFn: () => supplierOrderAPI.postPurchase(orderId),
    onSuccess: () => { toast.success('Purchase posted to inventory'); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const paymentMu = useMutation({
    mutationFn: (data: any) => supplierOrderAPI.payment(orderId, data),
    onSuccess: () => { toast.success('Payment recorded'); setActivePanel('none'); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const closeMu = useMutation({
    mutationFn: () => supplierOrderAPI.close(orderId, closeReason || 'Order completed'),
    onSuccess: () => { toast.success('Order closed'); setActivePanel('none'); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const cancelMu = useMutation({
    mutationFn: () => supplierOrderAPI.cancel(orderId, cancelReason),
    onSuccess: () => { toast.success('Order cancelled'); setActivePanel('none'); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const statusMu = useMutation({
    mutationFn: (toStatus: string) => supplierOrderAPI.setStatus(orderId, toStatus),
    onSuccess: () => { toast.success('Status updated'); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to update status'),
  });

  // ── Loading / Not Found ────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-48" />
        <div className="h-40 bg-gray-200 rounded" />
      </div>
    );
  }
  if (!order) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Supplier order not found.</p>
        <button onClick={() => navigate('/supplier-orders')} className="mt-2 text-xs text-blue-600 hover:underline">
          Back to list
        </button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/supplier-orders')} className="p-1 rounded hover:bg-gray-100">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-800">{order.orderNo}</h1>
            <SupplierOrderStatusBadge status={order.status} />
            {order.priority === 'URGENT' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">URGENT</span>
            )}
            {order.priority === 'HIGH' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">HIGH</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {order.supplier?.name} • {order.branch?.name}
            {order.supplierReferenceNo && ` • Ref: ${order.supplierReferenceNo}`}
          </p>
        </div>
      </div>

      {/* Approval Banner */}
      <SupplierOrderApprovalBanner
        approvalRequired={order.approvalRequired}
        approvedById={order.approvedById}
        weightAdjustmentsPending={pendingApprovals}
      />

      {/* Action Buttons */}
      {!isTerminal && (
        <div className="flex flex-wrap gap-2">
          {canSend && (
            <button onClick={() => sendMu.mutate()} disabled={sendMu.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              <Send size={12} /> Send to Supplier
            </button>
          )}
          {canAcknowledge && (
            <button onClick={() => setActivePanel('acknowledge')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">
              <CheckCircle2 size={12} /> Mark Acknowledged
            </button>
          )}
          {canAdvance && (
            <button onClick={() => setActivePanel('advance')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700">
              <IndianRupee size={12} /> Advance Payment
            </button>
          )}
          {canMarkInProduction && (
            <button onClick={() => statusMu.mutate('IN_PRODUCTION')} disabled={statusMu.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50">
              <Scale size={12} /> Mark In Production
            </button>
          )}
          {canMarkDispatched && (
            <button onClick={() => statusMu.mutate('DISPATCHED')} disabled={statusMu.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">
              <Truck size={12} /> Mark Dispatched
            </button>
          )}
          {canReceipt && (
            <button onClick={() => setActivePanel('receipt')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">
              <Package size={12} /> Record Receipt
            </button>
          )}
          {canMarkFullyReceived && (
            <button onClick={() => statusMu.mutate('RECEIVED_PENDING_QC')} disabled={statusMu.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50">
              <CheckCircle2 size={12} /> Mark Fully Received
            </button>
          )}
          {canQc && (
            <button onClick={() => {
              const pendingReceipt = (order.receipts || []).find((r: any) => r.status === 'PENDING_QC');
              setSelectedReceipt(pendingReceipt);
              setActivePanel('qc');
            }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-700">
              <CheckCircle2 size={12} /> Perform QC
            </button>
          )}
          {canMarkQcComplete && (
            <button onClick={() => statusMu.mutate('QC_COMPLETED')} disabled={statusMu.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50">
              <CheckCircle2 size={12} /> Mark QC Complete
            </button>
          )}
          {canMarkShortDelivered && (
            <button onClick={() => statusMu.mutate('SHORT_DELIVERED')} disabled={statusMu.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border border-yellow-400 text-yellow-700 rounded hover:bg-yellow-50 disabled:opacity-50">
              <AlertTriangle size={12} /> Short Delivered
            </button>
          )}
          {canInvoice && (
            <button onClick={() => setActivePanel('invoice')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-sky-600 text-white rounded hover:bg-sky-700">
              <FileText size={12} /> Record Invoice
            </button>
          )}
          {canPostPurchase && (
            <button onClick={() => postPurchaseMu.mutate()} disabled={postPurchaseMu.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">
              <ShoppingCart size={12} /> Post Purchase
            </button>
          )}
          {canPayment && (
            <button onClick={() => setActivePanel('payment')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-rose-600 text-white rounded hover:bg-rose-700">
              <IndianRupee size={12} /> Record Payment
            </button>
          )}
          {canClose && (
            <button onClick={() => setActivePanel('close')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border border-green-300 text-green-700 rounded hover:bg-green-50">
              <Lock size={12} /> Close Order
            </button>
          )}
          {canCancel && (
            <button onClick={() => setActivePanel('cancel')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border border-red-300 text-red-700 rounded hover:bg-red-50">
              <XCircle size={12} /> Cancel
            </button>
          )}
        </div>
      )}

      {/* Action Panels */}
      {activePanel === 'acknowledge' && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <AcknowledgePanel onSubmit={(d: any) => acknowledgeMu.mutate(d)}
            isPending={acknowledgeMu.isPending} onCancel={() => setActivePanel('none')} />
        </div>
      )}
      {activePanel === 'advance' && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <SupplierPaymentForm type="advance" onSubmit={(d) => advanceMu.mutate(d)}
            isPending={advanceMu.isPending} onCancel={() => setActivePanel('none')} />
        </div>
      )}
      {activePanel === 'receipt' && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <SupplierReceiptForm orderItems={order.items || []}
            onSubmit={(d) => receiptMu.mutate(d)}
            isPending={receiptMu.isPending} onCancel={() => setActivePanel('none')} />
        </div>
      )}
      {activePanel === 'qc' && selectedReceipt && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <SupplierQcForm
            receiptItems={selectedReceipt.items || []}
            onSubmit={(d) => qcMu.mutate({ receiptId: selectedReceipt.id, data: d })}
            isPending={qcMu.isPending}
            onCancel={() => { setActivePanel('none'); setSelectedReceipt(null); }} />
        </div>
      )}
      {activePanel === 'invoice' && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <SupplierInvoiceForm orderId={orderId}
            advancePaid={Number(order.advancePaid || 0)}
            onSubmit={(d) => invoiceMu.mutate(d)}
            isPending={invoiceMu.isPending} onCancel={() => setActivePanel('none')} />
        </div>
      )}
      {activePanel === 'payment' && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <SupplierPaymentForm type="payment"
            maxAmount={(order.invoices || []).reduce((s: number, inv: any) => s + Number(inv.dueAmount || 0), 0)}
            onSubmit={(d) => paymentMu.mutate(d)}
            isPending={paymentMu.isPending} onCancel={() => setActivePanel('none')} />
        </div>
      )}
      {activePanel === 'close' && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Close Order</p>
            <input className="w-full border rounded px-2 py-1.5 text-xs" placeholder="Reason (optional)"
              value={closeReason} onChange={e => setCloseReason(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setActivePanel('none')} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
              <button onClick={() => closeMu.mutate()} disabled={closeMu.isPending}
                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                {closeMu.isPending ? 'Closing...' : 'Close Order'}
              </button>
            </div>
          </div>
        </div>
      )}
      {activePanel === 'cancel' && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="space-y-3">
            <p className="text-sm font-medium text-red-700">Cancel Order</p>
            <p className="text-xs text-gray-500">This will reverse all ledger entries.</p>
            <input className="w-full border rounded px-2 py-1.5 text-xs" placeholder="Cancellation reason *" required
              value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setActivePanel('none')} className="px-3 py-1.5 text-xs border rounded">Back</button>
              <button onClick={() => cancelMu.mutate()} disabled={cancelMu.isPending || !cancelReason.trim()}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                {cancelMu.isPending ? 'Cancelling...' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Order Summary */}
          <section className="border rounded-lg p-3">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Order Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-gray-500 block">Order Date</span>
                <span className="font-medium">{new Date(order.orderDate).toLocaleDateString('en-IN')}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Expected Delivery</span>
                <span className="font-medium">
                  {order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toLocaleDateString('en-IN') : '—'}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block">Estimated Amount</span>
                <span className="font-medium">₹{Number(order.estimatedAmount || 0).toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Advance Paid</span>
                <span className="font-medium text-purple-600">₹{Number(order.advancePaid || 0).toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Ordered Weight</span>
                <span className="font-medium">{Number(order.totalOrderedGrossWeight || 0).toFixed(2)}g (gross) / {Number(order.totalOrderedNetWeight || 0).toFixed(2)}g (net)</span>
              </div>
              <div>
                <span className="text-gray-500 block">Received Weight</span>
                <span className={`font-medium ${Number(order.totalReceivedNetWeight) > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {Number(order.totalReceivedGrossWeight || 0).toFixed(2)}g / {Number(order.totalReceivedNetWeight || 0).toFixed(2)}g
                </span>
              </div>
              {order.supplierReferenceNo && (
                <div>
                  <span className="text-gray-500 block">Supplier Ref</span>
                  <span className="font-medium">{order.supplierReferenceNo}</span>
                </div>
              )}
            </div>
            {/* Delivery Progress Bar */}
            {Number(order.totalOrderedNetWeight) > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
                  <span>Delivery Progress</span>
                  <span>{Math.round((Number(order.totalReceivedNetWeight) / Number(order.totalOrderedNetWeight)) * 100)}%</span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (Number(order.totalReceivedNetWeight) / Number(order.totalOrderedNetWeight)) * 100)}%` }} />
                </div>
              </div>
            )}
          </section>

          {/* Ordered Items */}
          <section className="border rounded-lg p-3">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Ordered Items</h3>
            <SupplierOrderItemTable
              items={order.items || []}
              receipts={order.receipts}
              showProgress={Number(order.totalReceivedNetWeight) > 0}
            />
          </section>

          {/* Receipts */}
          {(order.receipts || []).length > 0 && (
            <section className="border rounded-lg p-3">
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Truck size={14} /> Receipts ({order.receipts.length})
              </h3>
              <div className="space-y-3">
                {order.receipts.map((receipt: any) => (
                  <div key={receipt.id} className="border rounded p-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{receipt.receiptNo}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          receipt.status === 'QC_PASSED' ? 'bg-green-100 text-green-700' :
                          receipt.status === 'PENDING_QC' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{receipt.status.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="text-[10px] text-gray-400">
                        {new Date(receipt.receivedDate).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {receipt.items?.length || 0} items •
                      {receipt.items?.reduce((s: number, ri: any) => s + Number(ri.receivedNetWeight || 0), 0).toFixed(2)}g received
                      {receipt.packageReference && ` • Pkg: ${receipt.packageReference}`}
                    </div>
                    {receipt.status === 'PENDING_QC' && !isTerminal && (
                      <button onClick={() => { setSelectedReceipt(receipt); setActivePanel('qc'); }}
                        className="mt-1 text-[10px] text-teal-600 hover:underline">
                        Perform QC →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Weight Adjustments */}
          {(order.weightAdjustments || []).length > 0 && (
            <section className="border rounded-lg p-3">
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Scale size={14} /> Weight Adjustments ({order.weightAdjustments.length})
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="text-left px-2 py-1">Type</th>
                    <th className="text-right px-2 py-1">Net Delta</th>
                    <th className="text-right px-2 py-1">Fine Wt Delta</th>
                    <th className="text-left px-2 py-1">Reason</th>
                    <th className="text-center px-2 py-1">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {order.weightAdjustments.map((wa: any) => (
                    <tr key={wa.id} className="border-b border-gray-100">
                      <td className="px-2 py-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          wa.adjustmentType === 'SHORT_RECEIVED' ? 'bg-red-100 text-red-700' :
                          wa.adjustmentType === 'EXCESS_RECEIVED' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{wa.adjustmentType.replace(/_/g, ' ')}</span>
                      </td>
                      <td className={`px-2 py-1 text-right ${Number(wa.netDelta) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {Number(wa.netDelta) > 0 ? '+' : ''}{Number(wa.netDelta).toFixed(3)}g
                      </td>
                      <td className="px-2 py-1 text-right">{Number(wa.fineWeightDelta).toFixed(3)}g</td>
                      <td className="px-2 py-1 text-gray-500 max-w-[150px] truncate">{wa.reason || '—'}</td>
                      <td className="px-2 py-1 text-center">
                        {wa.approvalRequired ? (
                          wa.approvedById ? (
                            <span className="text-[10px] text-green-600">✓ Approved</span>
                          ) : (
                            <span className="text-[10px] text-amber-600">⏳ Pending</span>
                          )
                        ) : (
                          <span className="text-[10px] text-gray-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Invoices */}
          {(order.invoices || []).length > 0 && (
            <section className="border rounded-lg p-3">
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <FileText size={14} /> Invoices ({order.invoices.length})
              </h3>
              <div className="space-y-2">
                {order.invoices.map((inv: any) => (
                  <div key={inv.id} className="border rounded p-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="font-medium">{inv.invoiceNo}</span>
                        <span className="text-gray-500 ml-2">Supplier: {inv.supplierInvoiceNo}</span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        inv.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>{inv.status}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[11px]">
                      <div><span className="text-gray-500">Taxable:</span> ₹{Number(inv.taxableAmount).toLocaleString('en-IN')}</div>
                      <div><span className="text-gray-500">GST:</span> ₹{Number(inv.gstAmount).toLocaleString('en-IN')}</div>
                      <div><span className="text-gray-500">Total:</span> <strong>₹{Number(inv.totalAmount).toLocaleString('en-IN')}</strong></div>
                      <div><span className="text-gray-500">Due:</span> <strong className="text-red-600">₹{Number(inv.dueAmount).toLocaleString('en-IN')}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Payments */}
          {(order.payments || []).length > 0 && (
            <section className="border rounded-lg p-3">
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <IndianRupee size={14} /> Payments ({order.payments.length})
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="text-left px-2 py-1">Payment No</th>
                    <th className="text-right px-2 py-1">Amount</th>
                    <th className="text-left px-2 py-1">Mode</th>
                    <th className="text-left px-2 py-1">Reference</th>
                    <th className="text-left px-2 py-1">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {order.payments.map((pay: any) => (
                    <tr key={pay.id} className="border-b border-gray-100">
                      <td className="px-2 py-1 font-medium">{pay.paymentNo}</td>
                      <td className="px-2 py-1 text-right font-medium">₹{Number(pay.amount).toLocaleString('en-IN')}</td>
                      <td className="px-2 py-1">{pay.paymentMode}</td>
                      <td className="px-2 py-1 text-gray-500">{pay.referenceNo || '—'}</td>
                      <td className="px-2 py-1">{new Date(pay.paymentDate).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-4">
          {/* Status Timeline */}
          <section className="border rounded-lg p-3">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Timeline</h3>
            <SupplierOrderTimeline history={order.stateHistory || []} />
          </section>

          {/* Supplier Ledger Balance */}
          <section className="border rounded-lg p-3">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Supplier Balance</h3>
            <SupplierLedgerView balance={balance} />
          </section>

          {/* Notes */}
          {order.notes && (
            <section className="border rounded-lg p-3">
              <h3 className="text-sm font-medium text-gray-700 mb-1">Notes</h3>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{order.notes}</p>
            </section>
          )}

          {/* Supplier Info */}
          <section className="border rounded-lg p-3">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Supplier</h3>
            <div className="text-xs space-y-1">
              <p className="font-medium">{order.supplier?.name}</p>
              {order.supplier?.mobile && <p className="text-gray-500">📱 {order.supplier.mobile}</p>}
              {order.supplier?.email && <p className="text-gray-500">✉ {order.supplier.email}</p>}
              {order.supplier?.gstin && <p className="text-gray-500">GSTIN: {order.supplier.gstin}</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Acknowledge Panel ────────────────────────────────────
function AcknowledgePanel({ onSubmit, isPending, onCancel }: { onSubmit: (d: any) => void; isPending: boolean; onCancel: () => void }) {
  const [supplierReferenceNo, setRef] = useState('');
  const [confirmedDeliveryDate, setDate] = useState('');
  const [remarks, setRemarks] = useState('');

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">Record Supplier Acknowledgement</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-gray-500">Supplier Reference No</label>
          <input className="w-full border rounded px-2 py-1 text-xs"
            value={supplierReferenceNo} onChange={e => setRef(e.target.value)} placeholder="JJ-REF-001" />
        </div>
        <div>
          <label className="text-[11px] text-gray-500">Confirmed Delivery Date</label>
          <input type="date" className="w-full border rounded px-2 py-1 text-xs"
            value={confirmedDeliveryDate} onChange={e => setDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-gray-500">Remarks</label>
        <input className="w-full border rounded px-2 py-1 text-xs"
          value={remarks} onChange={e => setRemarks(e.target.value)} />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
        <button type="button" disabled={isPending}
          onClick={() => onSubmit({ supplierReferenceNo, confirmedDeliveryDate, remarks })}
          className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
          {isPending ? 'Saving...' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
