import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { layawayAPI, mastersAPI } from '../../lib/api';
import { formatIndianNumber, formatDate, getToday } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  PARTIALLY_PAID: 'bg-blue-100 text-blue-800',
  OVERDUE: 'bg-red-100 text-red-800',
  READY_FOR_CONVERSION: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-purple-100 text-purple-800',
  CONVERTED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-50 text-red-400',
  EXPIRED: 'bg-orange-100 text-orange-700',
};

export default function LayawayList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [customerFilter, setCustomerFilter] = useState('');
  const [salesmanFilter, setSalesmanFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(getToday());
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['layaways', customerFilter, salesmanFilter, dateFrom, dateTo, statusFilter],
    queryFn: () => layawayAPI.list({
      search: customerFilter || undefined,
      salesmanName: salesmanFilter !== 'All' ? salesmanFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      status: statusFilter !== 'ALL' ? statusFilter : undefined,
    }).then((r) => r.data),
  });

  const { data: salesmen } = useQuery({
    queryKey: ['salesmen'],
    queryFn: () => mastersAPI.salesmen().then((r) => r.data),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => layawayAPI.cancel(id, 'Cancelled from list'),
    onSuccess: () => {
      toast.success('Layaway cancelled. Items restored to stock.');
      queryClient.invalidateQueries({ queryKey: ['layaways'] });
      queryClient.invalidateQueries({ queryKey: ['labels-list'] });
      setSelectedId(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to cancel'),
  });

  const entries = data?.entries || [];
  const totalAmount = data?.totalAmount || 0;

  const selectedEntry = entries.find((e: any) => e.id === selectedId);

  const handleDelete = () => {
    if (!selectedId) return toast.error('Select a layaway entry first');
    if (selectedEntry?.status === 'CONVERTED') return toast.error('Cannot cancel a converted layaway');
    if (!confirm('Are you sure you want to cancel this layaway? Items will be restored to stock.')) return;
    cancelMutation.mutate(selectedId);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header & Filters */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <span>Layaway Register</span>
          <div className="flex gap-2">
            <button onClick={() => navigate('/layaway')} className="btn-success text-xs">+ New Layaway</button>
            <button
              onClick={() => selectedId && navigate(`/layaway/detail/${selectedId}`)}
              className="btn-secondary text-xs"
              disabled={!selectedId}
            >
              View Detail
            </button>
            <button
              onClick={handleDelete}
              className="btn-danger text-xs"
              disabled={!selectedId || cancelMutation.isPending}
            >
              Cancel Layaway
            </button>
          </div>
        </div>
        <div className="panel-body flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Customer / Voucher</label>
            <input
              className="form-input w-48"
              placeholder="Search..."
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Salesman</label>
            <select className="form-select w-36" value={salesmanFilter} onChange={(e) => setSalesmanFilter(e.target.value)}>
              <option value="All">All</option>
              {salesmen?.map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
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
            <select className="form-select w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="OVERDUE">Overdue</option>
              <option value="READY_FOR_CONVERSION">Ready for Conversion</option>
              <option value="CONVERTED">Converted</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="EXPIRED">Expired</option>
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
              <th>Voucher No</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Mobile</th>
              <th className="text-right">Booking Amt</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
              <th>Expiry</th>
              <th>Pricing Model</th>
              <th>Salesman</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="text-center py-8">Loading...</td></tr>}
            {!isLoading && entries.length === 0 && (
              <tr><td colSpan={11} className="text-center py-8 text-gray-400">No layaway entries found</td></tr>
            )}
            {entries.map((entry: any) => {
              const paid = Number(entry.paymentAmount);
              const balance = Number(entry.voucherAmount) - paid;
              const isExpiringSoon = entry.expiryDate && new Date(entry.expiryDate) <= new Date(Date.now() + 7 * 86400000);
              return (
                <tr
                  key={entry.id}
                  className={`cursor-pointer hover:bg-blue-50 ${selectedId === entry.id ? 'bg-blue-100' : ''} ${entry.status === 'OVERDUE' ? 'bg-red-50' : ''}`}
                  onClick={() => setSelectedId(entry.id)}
                  onDoubleClick={() => navigate(`/layaway/detail/${entry.id}`)}
                >
                  <td className="font-medium text-blue-600">{entry.voucherNo}</td>
                  <td>{formatDate(entry.voucherDate)}</td>
                  <td className="font-medium">{entry.account?.name || '-'}</td>
                  <td>{entry.account?.mobile || '-'}</td>
                  <td className="text-right">{formatIndianNumber(entry.voucherAmount)}</td>
                  <td className="text-right text-green-700 font-medium">{formatIndianNumber(paid)}</td>
                  <td className={`text-right font-medium ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatIndianNumber(balance)}
                  </td>
                  <td className={isExpiringSoon ? 'text-orange-600 font-medium' : ''}>
                    {entry.expiryDate ? formatDate(entry.expiryDate) : '-'}
                    {isExpiringSoon && <span className="ml-1 text-[10px] bg-orange-100 text-orange-700 px-1 rounded">Soon</span>}
                  </td>
                  <td>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      entry.pricingModel === 'LOCKED' ? 'bg-gray-100 text-gray-700' :
                      entry.pricingModel === 'HYBRID' ? 'bg-purple-100 text-purple-700' :
                      'bg-blue-50 text-blue-600'
                    }`}>
                      {entry.pricingModel || 'FLOATING'}
                    </span>
                  </td>
                  <td>{entry.salesmanName || '-'}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[entry.status] || 'bg-gray-100 text-gray-600'}`}>
                      {entry.status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom Total */}
      <div className="panel">
        <div className="panel-body py-2 px-4 flex justify-between items-center text-sm">
          <span className="text-gray-600">Total Entries: <strong>{entries.length}</strong></span>
          <span className="font-bold text-blue-700">Total Booking Value: {formatIndianNumber(totalAmount)}</span>
        </div>
      </div>

    </div>
  );
}
