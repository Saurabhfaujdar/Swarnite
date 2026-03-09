import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { layawayAPI, accountsAPI, mastersAPI } from '../../lib/api';
import { formatIndianNumber, formatDate, getToday } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

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
    mutationFn: (id: number) => layawayAPI.cancel(id),
    onSuccess: () => {
      toast.success('Layaway cancelled. Items restored to stock.');
      queryClient.invalidateQueries({ queryKey: ['layaways'] });
      setSelectedId(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to cancel'),
  });

  const entries = data?.entries || [];
  const totalAmount = data?.totalAmount || 0;

  const handleDelete = () => {
    if (!selectedId) return toast.error('Select a layaway entry first');
    if (!confirm('Are you sure you want to cancel this layaway? Items will be restored to stock.')) return;
    cancelMutation.mutate(selectedId);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header & Filters */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <span>LayAway Entry List</span>
          <div className="flex gap-2">
            <button onClick={() => navigate('/layaway')} className="btn-success text-xs">+ Add</button>
            <button onClick={handleDelete} className="btn-danger text-xs" disabled={!selectedId || cancelMutation.isPending}>
              Delete Layaway Item
            </button>
          </div>
        </div>
        <div className="panel-body flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Customer</label>
            <input
              className="form-input w-48"
              placeholder="All"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Salesman</label>
            <select
              className="form-select w-36"
              value={salesmanFilter}
              onChange={(e) => setSalesmanFilter(e.target.value)}
            >
              <option value="All">All</option>
              {salesmen?.map((s: any) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label block text-xs">Date From</label>
            <input
              type="date"
              className="form-input w-36"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Date To</label>
            <input
              type="date"
              className="form-input w-36"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Status</label>
            <select
              className="form-select w-28"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
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
              <th>Voucher No</th>
              <th>Voucher Date</th>
              <th>Account Name</th>
              <th className="text-right">Total Voucher Amt.</th>
              <th>Sales-Man Name</th>
              <th>Reference</th>
              <th>DueDate</th>
              <th>Book Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="text-center py-8">Loading...</td></tr>
            )}
            {!isLoading && entries.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">No layaway entries found</td></tr>
            )}
            {entries.map((entry: any) => (
              <tr
                key={entry.id}
                className={`cursor-pointer hover:bg-blue-50 ${selectedId === entry.id ? 'bg-blue-100' : ''}`}
                onClick={() => setSelectedId(entry.id)}
                onDoubleClick={() => navigate(`/layaway?id=${entry.id}`)}
              >
                <td className="font-medium text-blue-600">{entry.voucherNo}</td>
                <td>{formatDate(entry.voucherDate)}</td>
                <td>{entry.account?.name || '-'}</td>
                <td className="text-right font-medium">{formatIndianNumber(entry.voucherAmount)}</td>
                <td>{entry.salesmanName || '-'}</td>
                <td>{entry.reference || '-'}</td>
                <td>{entry.dueDate ? formatDate(entry.dueDate) : '-'}</td>
                <td>{entry.bookName || '-'}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    entry.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                    entry.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {entry.status}
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
            Total Entries: <strong>{entries.length}</strong>
          </span>
          <span className="font-bold text-blue-700">
            Total: {formatIndianNumber(totalAmount)} Cr
          </span>
        </div>
      </div>
    </div>
  );
}
