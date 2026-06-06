/**
 * Repair List
 * ───────────
 * Filter by status / kariger / search; click through to detail.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { repairAPI, karigerAPI } from '../../lib/api';
import { Plus, Search } from 'lucide-react';

const STATUSES = [
  'RECEIVED', 'UNDER_INSPECTION', 'ESTIMATE_PENDING', 'WAITING_CUSTOMER_APPROVAL',
  'ASSIGNED_TO_KARIGER', 'IN_PROGRESS', 'RETURNED_BY_KARIGER', 'QUALITY_CHECK',
  'READY_FOR_DELIVERY', 'DELIVERED', 'REWORK_REQUIRED', 'CANCELLED',
];

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
  CANCELLED: 'bg-red-50 text-red-500',
};

export default function RepairList() {
  const [status, setStatus] = useState<string>('');
  const [karigerId, setKarigerId] = useState<string>('');
  const [q, setQ] = useState('');

  const { data: karigersData } = useQuery({
    queryKey: ['karigers', { active: true }],
    queryFn: () => karigerAPI.list({ active: 'true' }).then(r => r.data),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['repairs', 'list', { status, karigerId, q }],
    queryFn: () => repairAPI.list({
      status: status || undefined,
      karigerId: karigerId || undefined,
      q: q || undefined,
    }).then(r => r.data),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Repairs</h1>
        <Link to="/repairs/new" className="bg-jewel-gold text-jewel-dark text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1">
          <Plus size={14}/> New Repair
        </Link>
      </div>

      <div className="bg-white rounded shadow-sm p-3 grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
        <div className="relative md:col-span-2">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search repair no / customer / mobile…"
            className="w-full border rounded pl-7 pr-2 py-1.5"
            onKeyDown={e => e.key === 'Enter' && refetch()}
          />
        </div>
        <select className="border rounded px-2 py-1.5" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="border rounded px-2 py-1.5" value={karigerId} onChange={e => setKarigerId(e.target.value)}>
          <option value="">All karigers</option>
          {(karigersData?.karigers || []).map((k: any) => (
            <option key={k.id} value={k.id}>{k.name} ({k.code})</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Repair No</th>
              <th className="text-left p-2">Customer</th>
              <th className="text-left p-2">Branch</th>
              <th className="text-left p-2">Kariger</th>
              <th className="text-center p-2">Items</th>
              <th className="text-left p-2">Intake</th>
              <th className="text-left p-2">Expected</th>
              <th className="text-center p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="p-6 text-center text-gray-400">Loading…</td></tr>
            ) : (data?.rows ?? []).length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-gray-400">No repairs match your filters</td></tr>
            ) : (
              data.rows.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 font-mono">
                    <Link to={`/repairs/${r.id}`} className="text-blue-600 hover:underline">{r.repairNo}</Link>
                  </td>
                  <td className="p-2">
                    <div>{r.customerName}</div>
                    {r.customerMobile && <div className="text-[10px] text-gray-500">{r.customerMobile}</div>}
                  </td>
                  <td className="p-2">{r.branch?.name}</td>
                  <td className="p-2">{r.assignedKariger?.name || <span className="text-gray-400">—</span>}</td>
                  <td className="p-2 text-center">{r._count?.items}</td>
                  <td className="p-2">{new Date(r.intakeDate).toLocaleDateString('en-IN')}</td>
                  <td className="p-2">{r.expectedDeliveryDate ? new Date(r.expectedDeliveryDate).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="p-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${statusColor[r.status] || 'bg-gray-100'}`}>
                      {r.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-500">{data?.total ?? 0} repair(s)</div>
    </div>
  );
}
