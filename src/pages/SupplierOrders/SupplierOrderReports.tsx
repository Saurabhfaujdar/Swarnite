/**
 * Supplier Order Reports
 * ──────────────────────
 * Filterable report viewer for all supplier order report types.
 * Supports: branch, date range, and supplier filters.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supplierOrderAPI } from '../../lib/api';
import {
  BarChart3, ArrowLeft, AlertTriangle, Clock, FileText,
  IndianRupee, Scale, Users, Package, Truck,
} from 'lucide-react';
import SupplierOrderStatusBadge from './SupplierOrderStatusBadge';

type ReportType =
  | 'pending-orders'
  | 'delayed-orders'
  | 'pending-qc'
  | 'pending-invoice'
  | 'pending-payment'
  | 'supplier-performance'
  | 'short-excess-report'
  | 'supplier-money-balance'
  | 'supplier-metal-balance';

const REPORT_OPTIONS: { key: ReportType; label: string; icon: any; description: string }[] = [
  { key: 'pending-orders', label: 'Pending Orders', icon: Package, description: 'Orders not yet closed/cancelled' },
  { key: 'delayed-orders', label: 'Delayed Orders', icon: Clock, description: 'Past expected delivery date' },
  { key: 'pending-qc', label: 'Pending QC', icon: AlertTriangle, description: 'Received but QC incomplete' },
  { key: 'pending-invoice', label: 'Pending Invoice', icon: FileText, description: 'QC done but no invoice' },
  { key: 'pending-payment', label: 'Pending Payment', icon: IndianRupee, description: 'Invoice received, amount due' },
  { key: 'supplier-performance', label: 'Supplier Performance', icon: Users, description: 'On-time, delays, rejections' },
  { key: 'short-excess-report', label: 'Short / Excess Report', icon: Scale, description: 'Weight adjustments' },
  { key: 'supplier-money-balance', label: 'Supplier Money Balance', icon: IndianRupee, description: 'Payable/advance status' },
  { key: 'supplier-metal-balance', label: 'Supplier Metal Balance', icon: Truck, description: 'Metal movement by type/purity' },
];

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);
}

function formatWeight(n: number) {
  return Number(n || 0).toFixed(3);
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function SupplierOrderReports() {
  const [activeReport, setActiveReport] = useState<ReportType>('pending-orders');

  const { data, isLoading, error } = useQuery({
    queryKey: ['supplier-orders', 'reports', activeReport],
    queryFn: () => supplierOrderAPI.report(activeReport).then(r => r.data),
  });

  const rows = data?.rows || [];

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/supplier-orders/dashboard" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <BarChart3 size={18} /> Supplier Order Reports
        </h1>
      </div>

      {/* Report type selector */}
      <div className="flex flex-wrap gap-2">
        {REPORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setActiveReport(opt.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ${
              activeReport === opt.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <opt.icon size={12} />
            {opt.label}
          </button>
        ))}
      </div>

      {/* Report description */}
      <p className="text-xs text-gray-500">
        {REPORT_OPTIONS.find(o => o.key === activeReport)?.description}
      </p>

      {/* Content */}
      {isLoading && (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 bg-gray-100 rounded" />)}
        </div>
      )}

      {error && (
        <div className="text-red-600 text-sm p-4 bg-red-50 rounded">
          <AlertTriangle size={16} className="inline mr-2" />
          Failed to load report. Please try again.
        </div>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Package size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No data for this report.</p>
        </div>
      )}

      {!isLoading && !error && rows.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            {activeReport === 'pending-orders' && <PendingOrdersTable rows={rows} />}
            {activeReport === 'delayed-orders' && <DelayedOrdersTable rows={rows} />}
            {activeReport === 'pending-qc' && <PendingQcTable rows={rows} />}
            {activeReport === 'pending-invoice' && <PendingInvoiceTable rows={rows} />}
            {activeReport === 'pending-payment' && <PendingPaymentTable rows={rows} />}
            {activeReport === 'supplier-performance' && <SupplierPerformanceTable rows={rows} />}
            {activeReport === 'short-excess-report' && <ShortExcessTable rows={rows} />}
            {activeReport === 'supplier-money-balance' && <MoneyBalanceTable rows={rows} />}
            {activeReport === 'supplier-metal-balance' && <MetalBalanceTable rows={rows} />}
          </div>
          <div className="px-3 py-2 text-xs text-gray-400 border-t bg-gray-50">
            {rows.length} row{rows.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Report Tables ─────────────────────────────────────────────────

function PendingOrdersTable({ rows }: { rows: any[] }) {
  const today = new Date();
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="text-left p-2">Order No</th>
          <th className="text-left p-2">Supplier</th>
          <th className="text-left p-2">Order Date</th>
          <th className="text-left p-2">Expected Delivery</th>
          <th className="text-left p-2">Status</th>
          <th className="text-right p-2">Est. Amount</th>
          <th className="text-right p-2">Weight (g)</th>
          <th className="text-right p-2">Delay Days</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o: any) => {
          const delayDays = o.expectedDeliveryDate && new Date(o.expectedDeliveryDate) < today
            ? Math.ceil((today.getTime() - new Date(o.expectedDeliveryDate).getTime()) / (24 * 60 * 60 * 1000))
            : 0;
          return (
            <tr key={o.id} className="border-t hover:bg-gray-50">
              <td className="p-2">
                <Link to={`/supplier-orders/${o.id}`} className="text-blue-600 hover:underline font-medium">
                  {o.orderNo}
                </Link>
              </td>
              <td className="p-2">{o.supplier?.name}</td>
              <td className="p-2">{formatDate(o.orderDate)}</td>
              <td className="p-2">{formatDate(o.expectedDeliveryDate)}</td>
              <td className="p-2"><SupplierOrderStatusBadge status={o.status} /></td>
              <td className="p-2 text-right">₹{formatINR(Number(o.estimatedAmount))}</td>
              <td className="p-2 text-right">{formatWeight(Number(o.totalOrderedNetWeight))}</td>
              <td className="p-2 text-right">
                {delayDays > 0 ? <span className="text-red-600 font-medium">{delayDays}d</span> : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DelayedOrdersTable({ rows }: { rows: any[] }) {
  const today = new Date();
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="text-left p-2">Order No</th>
          <th className="text-left p-2">Supplier</th>
          <th className="text-left p-2">Expected Delivery</th>
          <th className="text-right p-2">Delay Days</th>
          <th className="text-left p-2">Status</th>
          <th className="text-left p-2">Branch</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o: any) => {
          const delayDays = Math.ceil((today.getTime() - new Date(o.expectedDeliveryDate).getTime()) / (24 * 60 * 60 * 1000));
          return (
            <tr key={o.id} className="border-t hover:bg-gray-50">
              <td className="p-2">
                <Link to={`/supplier-orders/${o.id}`} className="text-blue-600 hover:underline font-medium">
                  {o.orderNo}
                </Link>
              </td>
              <td className="p-2">{o.supplier?.name}</td>
              <td className="p-2">{formatDate(o.expectedDeliveryDate)}</td>
              <td className="p-2 text-right">
                <span className={`font-medium ${delayDays > 7 ? 'text-red-600' : 'text-orange-600'}`}>
                  {delayDays}d
                </span>
              </td>
              <td className="p-2"><SupplierOrderStatusBadge status={o.status} /></td>
              <td className="p-2">{o.branch?.name}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PendingQcTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="text-left p-2">Order No</th>
          <th className="text-left p-2">Supplier</th>
          <th className="text-left p-2">Receipts</th>
          <th className="text-left p-2">Last Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o: any) => (
          <tr key={o.id} className="border-t hover:bg-gray-50">
            <td className="p-2">
              <Link to={`/supplier-orders/${o.id}`} className="text-blue-600 hover:underline font-medium">
                {o.orderNo}
              </Link>
            </td>
            <td className="p-2">{o.supplier?.name}</td>
            <td className="p-2">
              {(o.receipts || []).map((r: any) => (
                <span key={r.id} className="inline-block bg-gray-100 px-1.5 py-0.5 rounded mr-1 text-[10px]">
                  {r.receiptNo} ({formatDate(r.receivedDate)})
                </span>
              ))}
            </td>
            <td className="p-2 text-gray-500">{formatDate(o.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PendingInvoiceTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="text-left p-2">Order No</th>
          <th className="text-left p-2">Supplier</th>
          <th className="text-left p-2">Status</th>
          <th className="text-right p-2">Est. Amount</th>
          <th className="text-left p-2">Last Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o: any) => (
          <tr key={o.id} className="border-t hover:bg-gray-50">
            <td className="p-2">
              <Link to={`/supplier-orders/${o.id}`} className="text-blue-600 hover:underline font-medium">
                {o.orderNo}
              </Link>
            </td>
            <td className="p-2">{o.supplier?.name}</td>
            <td className="p-2"><SupplierOrderStatusBadge status={o.status} /></td>
            <td className="p-2 text-right">₹{formatINR(Number(o.estimatedAmount))}</td>
            <td className="p-2 text-gray-500">{formatDate(o.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PendingPaymentTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="text-left p-2">Order No</th>
          <th className="text-left p-2">Supplier</th>
          <th className="text-right p-2">Invoice Total</th>
          <th className="text-right p-2">Due Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o: any) => {
          const totalInvoice = (o.invoices || []).reduce((s: number, i: any) => s + Number(i.totalAmount || 0), 0);
          const totalDue = (o.invoices || []).reduce((s: number, i: any) => s + Number(i.dueAmount || 0), 0);
          return (
            <tr key={o.id} className="border-t hover:bg-gray-50">
              <td className="p-2">
                <Link to={`/supplier-orders/${o.id}`} className="text-blue-600 hover:underline font-medium">
                  {o.orderNo}
                </Link>
              </td>
              <td className="p-2">{o.supplier?.name}</td>
              <td className="p-2 text-right">₹{formatINR(totalInvoice)}</td>
              <td className="p-2 text-right text-red-600 font-medium">₹{formatINR(totalDue)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SupplierPerformanceTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="text-left p-2">Supplier</th>
          <th className="text-right p-2">Total Orders</th>
          <th className="text-right p-2">On-Time</th>
          <th className="text-right p-2">Delayed</th>
          <th className="text-right p-2">Avg Delay</th>
          <th className="text-right p-2">Short</th>
          <th className="text-right p-2">Excess</th>
          <th className="text-right p-2">Rejected</th>
          <th className="text-right p-2">Total Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any, idx: number) => (
          <tr key={idx} className="border-t hover:bg-gray-50">
            <td className="p-2 font-medium">{r.supplier?.name || 'Unknown'}</td>
            <td className="p-2 text-right">{r.totalOrders}</td>
            <td className="p-2 text-right text-green-600">{r.onTimeDeliveries}</td>
            <td className="p-2 text-right text-red-600">{r.delayedDeliveries}</td>
            <td className="p-2 text-right">
              {r.averageDelayDays > 0
                ? <span className="text-orange-600">{r.averageDelayDays}d</span>
                : '—'}
            </td>
            <td className="p-2 text-right">{r.shortCount || 0}</td>
            <td className="p-2 text-right">{r.excessCount || 0}</td>
            <td className="p-2 text-right">{r.rejectionCount || 0}</td>
            <td className="p-2 text-right font-medium">₹{formatINR(r.totalOrderValue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ShortExcessTable({ rows }: { rows: any[] }) {
  const typeLabel: Record<string, string> = {
    SHORT_RECEIVED: 'Short',
    EXCESS_RECEIVED: 'Excess',
    PURITY_DIFFERENCE: 'Purity Diff',
    STONE_WEIGHT_DIFFERENCE: 'Stone Diff',
  };
  const typeColor: Record<string, string> = {
    SHORT_RECEIVED: 'text-red-600 bg-red-50',
    EXCESS_RECEIVED: 'text-green-600 bg-green-50',
    PURITY_DIFFERENCE: 'text-orange-600 bg-orange-50',
    STONE_WEIGHT_DIFFERENCE: 'text-purple-600 bg-purple-50',
  };
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="text-left p-2">Order</th>
          <th className="text-left p-2">Supplier</th>
          <th className="text-left p-2">Type</th>
          <th className="text-left p-2">Metal</th>
          <th className="text-right p-2">Net Delta (g)</th>
          <th className="text-right p-2">Fine Wt Delta</th>
          <th className="text-right p-2">Est. Value</th>
          <th className="text-left p-2">Reason</th>
          <th className="text-left p-2">Date</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any) => (
          <tr key={r.id} className="border-t hover:bg-gray-50">
            <td className="p-2 font-medium">{r.supplierOrder?.orderNo}</td>
            <td className="p-2">{r.supplierOrder?.supplier?.name}</td>
            <td className="p-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${typeColor[r.adjustmentType] || ''}`}>
                {typeLabel[r.adjustmentType] || r.adjustmentType}
              </span>
            </td>
            <td className="p-2">{r.metalType?.name || r.metalType?.code}</td>
            <td className="p-2 text-right font-medium">
              <span className={Number(r.netDelta) < 0 ? 'text-red-600' : 'text-green-600'}>
                {Number(r.netDelta) > 0 ? '+' : ''}{formatWeight(Number(r.netDelta))}
              </span>
            </td>
            <td className="p-2 text-right">{formatWeight(Number(r.fineWeightDelta))}</td>
            <td className="p-2 text-right">₹{formatINR(Number(r.estimatedValue))}</td>
            <td className="p-2 text-gray-500 max-w-[150px] truncate">{r.reason || '—'}</td>
            <td className="p-2">{formatDate(r.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MoneyBalanceTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="text-left p-2">Supplier</th>
          <th className="text-right p-2">Balance</th>
          <th className="text-left p-2">Type</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any, idx: number) => {
          const balance = Number(r.balanceAfterTransaction ?? 0);
          return (
            <tr key={idx} className="border-t hover:bg-gray-50">
              <td className="p-2 font-medium">{r.supplier?.name || 'Unknown'}</td>
              <td className="p-2 text-right">
                <span className={balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : ''}>
                  ₹{formatINR(Math.abs(balance))}
                </span>
              </td>
              <td className="p-2">
                {balance > 0 ? (
                  <span className="text-red-600 text-[10px] bg-red-50 px-1.5 py-0.5 rounded">Payable</span>
                ) : balance < 0 ? (
                  <span className="text-green-600 text-[10px] bg-green-50 px-1.5 py-0.5 rounded">Advance</span>
                ) : (
                  <span className="text-gray-400 text-[10px]">Settled</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MetalBalanceTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="text-left p-2">Supplier</th>
          <th className="text-left p-2">Metal Type</th>
          <th className="text-right p-2">Purity</th>
          <th className="text-right p-2">Balance (g)</th>
          <th className="text-right p-2">Fine Weight (g)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any, idx: number) => (
          <tr key={idx} className="border-t hover:bg-gray-50">
            <td className="p-2 font-medium">{r.supplier?.name || 'Unknown'}</td>
            <td className="p-2">{r.metalType?.name || r.metalType?.code}</td>
            <td className="p-2 text-right">{Number(r.purity || 0).toFixed(2)}%</td>
            <td className="p-2 text-right font-medium">{formatWeight(Number(r.balanceAfterTransaction))}</td>
            <td className="p-2 text-right">{formatWeight(Number(r.fineWeight || 0))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
