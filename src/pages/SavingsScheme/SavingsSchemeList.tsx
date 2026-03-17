import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savingsSchemeAPI } from '../../lib/api';
import { formatIndianNumber, formatDate, getToday } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function SavingsSchemeList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [customerFilter, setCustomerFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(getToday());
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['savings-schemes', customerFilter, dateFrom, dateTo, statusFilter],
    queryFn: () => savingsSchemeAPI.list({
      search: customerFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      status: statusFilter !== 'ALL' ? statusFilter : undefined,
    }).then((r) => r.data),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => savingsSchemeAPI.cancel(id),
    onSuccess: () => {
      toast.success('Scheme cancelled. Paid amount credited to customer.');
      queryClient.invalidateQueries({ queryKey: ['savings-schemes'] });
      setSelectedId(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to cancel'),
  });

  const schemes = data?.schemes || [];
  const totalMaturityValue = data?.totalMaturityValue || 0;

  const handleCancel = () => {
    if (!selectedId) return toast.error('Select a scheme first');
    if (!confirm('Are you sure you want to cancel this savings scheme?')) return;
    cancelMutation.mutate(selectedId);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ACTIVE: 'bg-green-100 text-green-800',
      MATURED: 'bg-blue-100 text-blue-800',
      REDEEMED: 'bg-purple-100 text-purple-800',
      CANCELLED: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header & Filters */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <span>Savings Scheme List</span>
          <div className="flex gap-2">
            <button onClick={() => navigate('/savings-scheme')} className="btn-success text-xs">+ New Scheme</button>
            <button onClick={handleCancel} className="btn-danger text-xs" disabled={!selectedId || cancelMutation.isPending}>
              Cancel Scheme
            </button>
          </div>
        </div>
        <div className="panel-body flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Customer</label>
            <input
              className="form-input w-48"
              placeholder="Search by name or scheme no"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Date From</label>
            <input type="date" className="form-input w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label block text-xs">Date To</label>
            <input type="date" className="form-input w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="form-label block text-xs">Status</label>
            <select className="form-select w-32" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="MATURED">Matured</option>
              <option value="REDEEMED">Redeemed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <button onClick={() => refetch()} className="btn-primary text-xs">Search</button>
        </div>
      </div>

      {/* Table */}
      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Scheme No</th>
              <th>Start Date</th>
              <th>Customer</th>
              <th>Duration</th>
              <th className="text-right">Monthly Amt</th>
              <th>Paid / Total</th>
              <th className="text-right">Total Paid</th>
              <th className="text-right">Maturity Value</th>
              <th>Maturity Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="text-center py-8">Loading...</td></tr>
            )}
            {!isLoading && schemes.length === 0 && (
              <tr><td colSpan={10} className="text-center py-8 text-gray-400">No savings schemes found</td></tr>
            )}
            {schemes.map((scheme: any) => (
              <tr
                key={scheme.id}
                className={`cursor-pointer hover:bg-blue-50 ${selectedId === scheme.id ? 'bg-blue-100' : ''}`}
                onClick={() => setSelectedId(scheme.id)}
                onDoubleClick={() => navigate(`/savings-scheme/detail/${scheme.id}`)}
              >
                <td className="font-medium text-blue-600">{scheme.schemeNo}</td>
                <td>{formatDate(scheme.startDate)}</td>
                <td>{scheme.account?.name || '-'}</td>
                <td>{scheme.durationMonths} months</td>
                <td className="text-right">{formatIndianNumber(scheme.monthlyAmount)}</td>
                <td>{scheme.paidInstallments}/{scheme.durationMonths}</td>
                <td className="text-right">{formatIndianNumber(scheme.totalPaidAmount)}</td>
                <td className="text-right font-medium">{formatIndianNumber(scheme.maturityValue)}</td>
                <td>{formatDate(scheme.maturityDate)}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(scheme.status)}`}>
                    {scheme.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Total */}
      <div className="panel">
        <div className="panel-body py-2 px-4 flex justify-between items-center text-sm">
          <span className="text-gray-600">
            Total Schemes: <strong>{schemes.length}</strong>
          </span>
          <span className="font-bold text-blue-700">
            Total Maturity Value: {formatIndianNumber(totalMaturityValue)}
          </span>
        </div>
      </div>
    </div>
  );
}
