/**
 * Supplier Order List
 * ───────────────────
 * Filter by status / supplier / search / date range; paginated; quick actions.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supplierOrderAPI, accountsAPI } from '../../lib/api';
import { Plus, Search, Filter, Eye, Package, FileText, IndianRupee, CheckCircle2 } from 'lucide-react';
import SupplierOrderStatusBadge from './SupplierOrderStatusBadge';

const ALL_STATUSES = [
  'DRAFT', 'SENT_TO_SUPPLIER', 'SUPPLIER_ACKNOWLEDGED', 'ADVANCE_PAID',
  'IN_PRODUCTION', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED_PENDING_QC',
  'QC_COMPLETED', 'SHORT_DELIVERED', 'EXCESS_DELIVERED', 'PURCHASE_POSTED',
  'INVOICE_RECEIVED', 'PAYMENT_PENDING', 'CLOSED', 'CANCELLED', 'DISPUTED',
];

export default function SupplierOrderList() {
  const [status, setStatus] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data: suppliersData } = useQuery({
    queryKey: ['accounts', 'suppliers'],
    queryFn: () => accountsAPI.list({ type: 'SUPPLIER', active: true }).then(r => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-orders', 'list', { status, supplierId, q, fromDate, toDate, delayedOnly, page }],
    queryFn: () => supplierOrderAPI.list({
      status: status || undefined,
      supplierId: supplierId || undefined,
      q: q || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      page,
      limit,
    }).then(r => r.data),
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);
  const suppliers = suppliersData?.rows || suppliersData?.accounts || [];

  // Filter delayed client-side if toggled
  const displayRows = delayedOnly
    ? rows.filter((o: any) => o.expectedDeliveryDate && new Date(o.expectedDeliveryDate) < new Date())
    : rows;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Supplier Orders</h1>
        <div className="flex gap-2">
          <Link to="/supplier-orders/dashboard" className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50">
            Dashboard
          </Link>
          <Link to="/supplier-orders/new"
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <Plus size={12} /> New Order
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-7 pr-2 py-1.5 border rounded text-xs"
            placeholder="Search order no, supplier, reference..."
            value={q} onChange={e => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <select className="border rounded px-2 py-1.5 text-xs"
          value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="border rounded px-2 py-1.5 text-xs"
          value={supplierId} onChange={e => { setSupplierId(e.target.value); setPage(1); }}>
          <option value="">All Suppliers</option>
          {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" className="border rounded px-2 py-1.5 text-xs"
          value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }}
          title="From date" />
        <input type="date" className="border rounded px-2 py-1.5 text-xs"
          value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }}
          title="To date" />
        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={delayedOnly} onChange={e => setDelayedOnly(e.target.checked)}
            className="rounded border-gray-300" />
          Delayed only
        </label>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-600">
              <th className="text-left px-3 py-2">Order No</th>
              <th className="text-left px-3 py-2">Supplier</th>
              <th className="text-left px-3 py-2">Branch</th>
              <th className="text-right px-3 py-2">Items</th>
              <th className="text-right px-3 py-2">Est. Amount</th>
              <th className="text-left px-3 py-2">Order Date</th>
              <th className="text-left px-3 py-2">Expected</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-center px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : displayRows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">No orders found.</td></tr>
            ) : (
              displayRows.map((order: any) => {
                const isDelayed = order.expectedDeliveryDate && new Date(order.expectedDeliveryDate) < new Date()
                  && !['CLOSED', 'CANCELLED'].includes(order.status);
                return (
                  <tr key={order.id} className={`border-b border-gray-100 hover:bg-gray-50 ${isDelayed ? 'bg-red-50/30' : ''}`}>
                    <td className="px-3 py-2">
                      <Link to={`/supplier-orders/${order.id}`} className="text-blue-600 hover:underline font-medium">
                        {order.orderNo}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{order.supplier?.name || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{order.branch?.code || order.branch?.name || '—'}</td>
                    <td className="px-3 py-2 text-right">{order._count?.items ?? '—'}</td>
                    <td className="px-3 py-2 text-right">₹{Number(order.estimatedAmount || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">
                      {order.orderDate && new Date(order.orderDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-3 py-2">
                      {order.expectedDeliveryDate ? (
                        <span className={isDelayed ? 'text-red-600 font-medium' : ''}>
                          {new Date(order.expectedDeliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2"><SupplierOrderStatusBadge status={order.status} /></td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <Link to={`/supplier-orders/${order.id}`} title="View"
                          className="p-1 rounded hover:bg-gray-200"><Eye size={13} /></Link>
                        {order.status === 'SENT_TO_SUPPLIER' && (
                          <Link to={`/supplier-orders/${order.id}?action=acknowledge`} title="Acknowledge"
                            className="p-1 rounded hover:bg-blue-100 text-blue-600"><CheckCircle2 size={13} /></Link>
                        )}
                        {['DISPATCHED', 'PARTIALLY_RECEIVED', 'SUPPLIER_ACKNOWLEDGED', 'ADVANCE_PAID'].includes(order.status) && (
                          <Link to={`/supplier-orders/${order.id}?action=receipt`} title="Receive"
                            className="p-1 rounded hover:bg-green-100 text-green-600"><Package size={13} /></Link>
                        )}
                        {['QC_COMPLETED', 'RECEIVED_PENDING_QC', 'PURCHASE_POSTED'].includes(order.status) && (
                          <Link to={`/supplier-orders/${order.id}?action=invoice`} title="Invoice"
                            className="p-1 rounded hover:bg-sky-100 text-sky-600"><FileText size={13} /></Link>
                        )}
                        {['INVOICE_RECEIVED', 'PURCHASE_POSTED', 'PAYMENT_PENDING'].includes(order.status) && (
                          <Link to={`/supplier-orders/${order.id}?action=payment`} title="Payment"
                            className="p-1 rounded hover:bg-rose-100 text-rose-600"><IndianRupee size={13} /></Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-2 py-1 border rounded disabled:opacity-40">Prev</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 border rounded disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
