/**
 * Repair Dashboard
 * ────────────────
 * At-a-glance counters + kariger workload + recent activity. Keeps the
 * jeweller counter staff productive without diving into the full list.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { repairAPI } from '../../lib/api';
import {
  Wrench, AlertTriangle, CalendarClock, CheckCircle2,
  IndianRupee, Users, Plus,
} from 'lucide-react';

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);
}

const statusColor: Record<string, string> = {
  RECEIVED: 'bg-gray-100 text-gray-700',
  UNDER_INSPECTION: 'bg-yellow-100 text-yellow-700',
  ESTIMATE_PENDING: 'bg-yellow-100 text-yellow-700',
  WAITING_CUSTOMER_APPROVAL: 'bg-orange-100 text-orange-700',
  ASSIGNED_TO_KARIGER: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  RETURNED_BY_KARIGER: 'bg-indigo-100 text-indigo-700',
  QUALITY_CHECK: 'bg-purple-100 text-purple-700',
  READY_FOR_DELIVERY: 'bg-green-100 text-green-700',
  DELIVERED: 'bg-gray-200 text-gray-600',
  REWORK_REQUIRED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-red-50 text-red-500 line-through',
};

export default function RepairDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['repairs', 'dashboard'],
    queryFn: () => repairAPI.dashboard().then(r => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="p-4 text-gray-500">Loading dashboard…</div>;
  const counters = data?.counters ?? {};
  const revenue = data?.revenue30d ?? {};
  const workload = data?.karigerWorkload ?? [];
  const recent = data?.recent ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Wrench size={18} /> Repair Dashboard
        </h1>
        <Link
          to="/repairs/new"
          className="bg-jewel-gold text-jewel-dark text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1 hover:opacity-90"
        >
          <Plus size={14} /> New Repair
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatCard label="Active" value={counters.totalActive ?? 0} icon={Wrench} tone="blue" />
        <StatCard label="Ready for Delivery" value={counters.readyForDelivery ?? 0} icon={CheckCircle2} tone="green" />
        <StatCard label="Delayed" value={counters.delayed ?? 0} icon={AlertTriangle} tone="red" />
        <StatCard label="Due Today" value={counters.dueToday ?? 0} icon={CalendarClock} tone="orange" />
        <StatCard label="Gold Discrepancy (30d)" value={counters.goldDiscrepancyAlerts ?? 0} icon={AlertTriangle} tone="yellow" />
      </div>

      {/* Revenue */}
      <div className="grid grid-cols-3 gap-2">
        <RevCard label="Invoiced (30d)" value={revenue.invoiced} />
        <RevCard label="Collected (30d)" value={revenue.collected} highlight />
        <RevCard label="Outstanding" value={revenue.outstanding} tone="red" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Kariger workload */}
        <div className="bg-white rounded shadow-sm p-3">
          <h2 className="font-semibold text-xs flex items-center gap-2 mb-2">
            <Users size={14} /> Kariger Workload
          </h2>
          {workload.length === 0 ? (
            <div className="text-gray-400 text-xs py-4 text-center">No active assignments</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-gray-500"><tr>
                <th className="text-left p-1">Kariger</th>
                <th className="text-right p-1">Active Jobs</th>
                <th className="text-right p-1">Gold Held (g)</th>
                <th className="text-right p-1">Owed (₹)</th>
              </tr></thead>
              <tbody>
                {workload.map((w: any) => (
                  <tr key={w.kariger?.id} className="border-t">
                    <td className="p-1">{w.kariger?.name} <span className="text-gray-400">({w.kariger?.code})</span></td>
                    <td className="p-1 text-right font-semibold">{w.jobCount}</td>
                    <td className="p-1 text-right">{Number(w.kariger?.metalBalance ?? 0).toFixed(3)}</td>
                    <td className="p-1 text-right">{formatINR(Number(w.kariger?.moneyBalance ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded shadow-sm p-3">
          <h2 className="font-semibold text-xs mb-2">Recent Activity</h2>
          {recent.length === 0 ? (
            <div className="text-gray-400 text-xs py-4 text-center">No repairs yet</div>
          ) : (
            <div className="space-y-1">
              {recent.map((r: any) => (
                <Link key={r.id} to={`/repairs/${r.id}`}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{r.repairNo}</span>
                    <span>{r.customerName}</span>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${statusColor[r.status] || 'bg-gray-100'}`}>
                    {r.status.replace(/_/g, ' ')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: any) {
  const toneCls = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
    yellow: 'bg-yellow-50 text-yellow-700',
  }[tone as string] || 'bg-gray-50 text-gray-700';
  return (
    <div className={`p-3 rounded ${toneCls}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-80">
        <Icon size={12} /> {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function RevCard({ label, value, highlight, tone }: any) {
  const cls = tone === 'red'
    ? 'bg-red-50 text-red-700'
    : highlight
      ? 'bg-green-50 text-green-700'
      : 'bg-gray-50 text-gray-700';
  return (
    <div className={`p-3 rounded ${cls}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-80">
        <IndianRupee size={12} /> {label}
      </div>
      <div className="text-xl font-bold">₹{formatINR(Number(value ?? 0))}</div>
    </div>
  );
}
