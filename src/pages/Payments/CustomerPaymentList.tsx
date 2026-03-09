import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerPaymentsAPI } from '../../lib/api';
import { formatIndianNumber, getToday } from '../../lib/utils';
import toast from 'react-hot-toast';

export default function CustomerPaymentList() {
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState('');
  const [paymentType, setPaymentType] = useState('ALL');
  const [status, setStatus] = useState('ACTIVE');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [cancelId, setCancelId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-payments', search, paymentType, status, dateFrom, dateTo, page],
    queryFn: () =>
      customerPaymentsAPI.list({
        search: search || undefined,
        paymentType: paymentType !== 'ALL' ? paymentType : undefined,
        status: status !== 'ALL' ? status : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit: 50,
      }),
    select: (res: any) => res.data,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => customerPaymentsAPI.cancel(id),
    onSuccess: () => {
      toast.success('Payment cancelled successfully');
      setCancelId(null);
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to cancel');
    },
  });

  const payments = data?.payments || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Customer Payments</h2>
        <span className="text-xs text-gray-500">{total} records</span>
      </div>

      {/* Filters */}
      <div className="bg-white p-2 rounded shadow-sm flex flex-wrap items-end gap-2 text-xs">
        <div>
          <label className="text-gray-500 block">Search</label>
          <input
            type="text"
            className="form-input text-xs w-44"
            placeholder="Receipt, name, narration..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div>
          <label className="text-gray-500 block">Type</label>
          <select
            className="form-input text-xs w-32"
            value={paymentType}
            onChange={(e) => { setPaymentType(e.target.value); setPage(1); }}
          >
            <option value="ALL">All Types</option>
            <option value="ADVANCE">Advance</option>
            <option value="DUE_PAYMENT">Due Payment</option>
          </select>
        </div>
        <div>
          <label className="text-gray-500 block">Status</label>
          <select
            className="form-input text-xs w-28"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="text-gray-500 block">From</label>
          <input
            type="date"
            className="form-input text-xs w-32"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
        </div>
        <div>
          <label className="text-gray-500 block">To</label>
          <input
            type="date"
            className="form-input text-xs w-32"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>
        <button
          className="btn-outline text-xs px-2 py-1"
          onClick={() => { setSearch(''); setPaymentType('ALL'); setStatus('ACTIVE'); setDateFrom(''); setDateTo(''); setPage(1); }}
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow-sm overflow-hidden">
        <div className="max-h-[calc(100vh-220px)] overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="text-left p-2">Receipt No</th>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Customer</th>
                <th className="text-center p-2">Type</th>
                <th className="text-right p-2">Cash</th>
                <th className="text-right p-2">Bank</th>
                <th className="text-right p-2">Card</th>
                <th className="text-right p-2">Total</th>
                <th className="text-right p-2">Bal Before</th>
                <th className="text-right p-2">Bal After</th>
                <th className="text-center p-2">Status</th>
                <th className="text-center p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={12} className="p-8 text-center text-gray-400">Loading...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={12} className="p-8 text-center text-gray-400">No payments found</td></tr>
              ) : (
                payments.map((p: any) => (
                  <tr
                    key={p.id}
                    className={`border-b hover:bg-gray-50 ${p.status === 'CANCELLED' ? 'opacity-50 bg-red-50' : ''}`}
                  >
                    <td className="p-2 font-mono font-medium">{p.receiptNo}</td>
                    <td className="p-2">{new Date(p.paymentDate).toLocaleDateString('en-IN')}</td>
                    <td className="p-2">
                      <span className="font-medium">{p.account?.name}</span>
                      {p.account?.mobile && <span className="text-gray-400 ml-1">({p.account.mobile})</span>}
                    </td>
                    <td className="p-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        p.paymentType === 'ADVANCE' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {p.paymentType === 'ADVANCE' ? 'Advance' : 'Due Payment'}
                      </span>
                    </td>
                    <td className="p-2 text-right">{Number(p.cashAmount) > 0 ? formatIndianNumber(Number(p.cashAmount)) : '-'}</td>
                    <td className="p-2 text-right">{Number(p.bankAmount) > 0 ? formatIndianNumber(Number(p.bankAmount)) : '-'}</td>
                    <td className="p-2 text-right">{Number(p.cardAmount) > 0 ? formatIndianNumber(Number(p.cardAmount)) : '-'}</td>
                    <td className="p-2 text-right font-bold text-green-700">{formatIndianNumber(Number(p.totalAmount))}</td>
                    <td className={`p-2 text-right ${Number(p.balanceBefore) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatIndianNumber(Math.abs(Number(p.balanceBefore)))} {Number(p.balanceBefore) > 0 ? 'DR' : 'CR'}
                    </td>
                    <td className={`p-2 text-right ${Number(p.balanceAfter) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatIndianNumber(Math.abs(Number(p.balanceAfter)))} {Number(p.balanceAfter) > 0 ? 'DR' : 'CR'}
                    </td>
                    <td className="p-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      {p.status === 'ACTIVE' && (
                        <button
                          onClick={() => setCancelId(p.id)}
                          className="text-red-500 hover:text-red-700 font-bold"
                          title="Cancel payment"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t p-2 flex items-center justify-between text-xs">
            <span className="text-gray-500">
              Page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="btn-outline px-2 py-0.5 text-xs disabled:opacity-30"
              >
                ← Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="btn-outline px-2 py-0.5 text-xs disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      {cancelId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-sm font-bold text-gray-800 mb-2">Cancel Payment</h3>
            <p className="text-xs text-gray-600 mb-4">
              Are you sure you want to cancel this payment? The customer's balance will be reversed.
            </p>
            <div className="flex gap-2 justify-end">
              <button className="btn-outline text-xs px-3 py-1" onClick={() => setCancelId(null)}>
                No, Keep
              </button>
              <button
                className="btn-danger text-xs px-3 py-1"
                onClick={() => cancelMutation.mutate(cancelId)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
