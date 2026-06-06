/**
 * Supplier Order Dashboard
 * ────────────────────────
 * At-a-glance counters + delayed orders + recent receipts + supplier payable + performance.
 * Auto-refreshes every 60s. Respects branch scoping from the backend.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supplierOrderAPI } from '../../lib/api';
import {
  Package, AlertTriangle, CalendarClock, CheckCircle2,
  IndianRupee, Truck, FileText, Plus, Clock, ShieldAlert,
  TrendingUp, BarChart3,
} from 'lucide-react';
import SupplierOrderStatusBadge from './SupplierOrderStatusBadge';

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);
}

export default function SupplierOrderDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['supplier-orders', 'dashboard'],
    queryFn: () => supplierOrderAPI.dashboard().then(r => r.data),
    refetchInterval: 60_000,
  });

  const { data: delayedData } = useQuery({
    queryKey: ['supplier-orders', 'reports', 'delayed-orders'],
    queryFn: () => supplierOrderAPI.report('delayed-orders').then(r => r.data),
    refetchInterval: 120_000,
  });

  const { data: pendingPaymentData } = useQuery({
    queryKey: ['supplier-orders', 'reports', 'pending-payment'],
    queryFn: () => supplierOrderAPI.report('pending-payment').then(r => r.data),
  });

  if (isLoading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-24 bg-gray-200 rounded" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-600">
        <AlertTriangle size={20} className="inline mr-2" />
        Failed to load dashboard. Please try again.
      </div>
    );
  }

  const c = data?.counters || {};
  const topSuppliers = data?.topSuppliers || [];
  const topDelayedSuppliers = data?.topDelayedSuppliers || [];
  const recentReceipts = data?.recentReceipts || [];
  const delayedOrders = delayedData?.rows || [];
  const pendingPayments = pendingPaymentData?.rows || [];

  const cards = [
    { label: 'Open Orders', value: c.openOrders ?? 0, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Delayed', value: c.delayedOrders ?? 0, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Expected Today', value: c.expectedToday ?? 0, icon: CalendarClock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Pending QC', value: c.pendingQC ?? 0, icon: CheckCircle2, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Pending Invoice', value: c.pendingInvoice ?? 0, icon: FileText, color: 'text-sky-600', bg: 'bg-sky-50' },
    { label: 'Pending Payment', value: c.pendingPayment ?? 0, icon: IndianRupee, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Supplier Orders</h1>
        <div className="flex gap-2">
          <Link to="/supplier-orders/reports" className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50 flex items-center gap-1">
            <BarChart3 size={12} /> Reports
          </Link>
          <Link to="/supplier-orders" className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50">
            View All
          </Link>
          <Link to="/supplier-orders/new"
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <Plus size={12} /> New Order
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(card => (
          <div key={card.label} className={`${card.bg} rounded-lg p-3`}>
            <div className="flex items-center gap-2 mb-1">
              <card.icon size={14} className={card.color} />
              <span className="text-[10px] text-gray-600 uppercase tracking-wide">{card.label}</span>
            </div>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Financial summary row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-indigo-50 rounded-lg p-3">
          <div className="flex items-center gap-1 text-[10px] text-gray-600 uppercase mb-1">
            <TrendingUp size={12} className="text-indigo-600" /> Monthly Orders (30d)
          </div>
          <p className="text-lg font-bold text-indigo-700">₹{formatINR(c.monthlyOrderValue ?? 0)}</p>
        </div>
        <div className="bg-rose-50 rounded-lg p-3">
          <div className="flex items-center gap-1 text-[10px] text-gray-600 uppercase mb-1">
            <IndianRupee size={12} className="text-rose-600" /> Payment Due
          </div>
          <p className="text-lg font-bold text-rose-700">₹{formatINR(c.pendingPaymentAmount ?? 0)}</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-3">
          <div className="flex items-center gap-1 text-[10px] text-gray-600 uppercase mb-1">
            <IndianRupee size={12} className="text-amber-600" /> Supplier Payable
          </div>
          <p className="text-lg font-bold text-amber-700">₹{formatINR(c.supplierPayable ?? 0)}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-3">
          <div className="flex items-center gap-1 text-[10px] text-gray-600 uppercase mb-1">
            <ShieldAlert size={12} className="text-purple-600" /> Pending Approvals
          </div>
          <p className="text-lg font-bold text-purple-700">{c.pendingApprovals ?? 0}</p>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Delayed Orders */}
        <div className="border rounded-lg p-3">
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500" /> Delayed Supplier Orders
          </h3>
          {delayedOrders.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No delayed orders 🎉</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {delayedOrders.slice(0, 10).map((o: any) => (
                <Link key={o.id} to={`/supplier-orders/${o.id}`}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 text-xs">
                  <div>
                    <span className="font-medium">{o.orderNo}</span>
                    <span className="text-gray-500 ml-2">{o.supplier?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 text-[10px]">
                      Due: {new Date(o.expectedDeliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </span>
                    <SupplierOrderStatusBadge status={o.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Receipts */}
        <div className="border rounded-lg p-3">
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Truck size={14} className="text-green-500" /> Recent Receipts
          </h3>
          {recentReceipts.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No recent receipts.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {recentReceipts.map((r: any) => (
                <Link key={r.id} to={`/supplier-orders/${r.supplierOrder?.id}`}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 text-xs">
                  <div>
                    <span className="font-medium">{r.receiptNo}</span>
                    <span className="text-gray-500 ml-2">{r.supplierOrder?.supplier?.name}</span>
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {new Date(r.receivedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Top Delayed Suppliers */}
        <div className="border rounded-lg p-3">
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Clock size={14} className="text-orange-500" /> Top Delayed Suppliers
          </h3>
          {topDelayedSuppliers.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No delayed suppliers.</p>
          ) : (
            <div className="space-y-1.5">
              {topDelayedSuppliers.map((s: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-gray-50">
                  <span>{s.supplier?.name || 'Unknown'}</span>
                  <span className="text-red-600 font-medium">{s.delayedCount} delayed</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Suppliers (Open Orders) */}
        <div className="border rounded-lg p-3">
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Package size={14} className="text-indigo-500" /> Top Suppliers (Open Orders)
          </h3>
          {topSuppliers.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No data.</p>
          ) : (
            <div className="space-y-1.5">
              {topSuppliers.map((s: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-gray-50">
                  <span>{s.supplier?.name || 'Unknown'}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500">{s.orderCount} orders</span>
                    <span className="font-medium">₹{formatINR(Number(s.totalValue || 0))}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Payments */}
        <div className="border rounded-lg p-3 lg:col-span-2">
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <IndianRupee size={14} className="text-rose-500" /> Pending Payments
          </h3>
          {pendingPayments.length === 0 ? (
            <p className="text-xs text-gray-400 italic">All payments clear.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {pendingPayments.slice(0, 12).map((o: any) => {
                const totalDue = (o.invoices || []).reduce((s: number, inv: any) => s + Number(inv.dueAmount || 0), 0);
                return (
                  <Link key={o.id} to={`/supplier-orders/${o.id}`}
                    className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 text-xs">
                    <div>
                      <span className="font-medium">{o.orderNo}</span>
                      <span className="text-gray-500 ml-2">{o.supplier?.name}</span>
                    </div>
                    <span className="text-red-600 font-medium">₹{formatINR(totalDue)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
