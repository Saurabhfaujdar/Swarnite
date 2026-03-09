import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { purchaseAPI } from '../../lib/api';
import { formatIndianNumber, formatWeight, getToday } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

export default function PurchaseEntryList() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(getToday());
  const [dateTo, setDateTo] = useState(getToday());
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['purchase-list', dateFrom, dateTo, search],
    queryFn: () => purchaseAPI.list({ dateFrom, dateTo, search }).then((r) => r.data),
  });

  const vouchers = data?.vouchers || [];

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="panel">
        <div className="panel-header">Purchase Voucher List</div>
        <div className="panel-body flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">From Date</label>
            <input type="date" className="form-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label block text-xs">To Date</label>
            <input type="date" className="form-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="form-label block text-xs">Search</label>
            <input className="form-input w-48" placeholder="Voucher / Supplier..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button onClick={() => refetch()} className="btn-primary">🔍 Search</button>
          <button onClick={() => navigate('/purchase/new')} className="btn-success">+ New Purchase</button>
        </div>
      </div>

      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Voucher No</th>
              <th>Date</th>
              <th>Type</th>
              <th>Supplier/Customer</th>
              <th className="text-right">Items</th>
              <th className="text-right">Gross Wt</th>
              <th className="text-right">Net Wt</th>
              <th className="text-right">Fine Wt</th>
              <th className="text-right">Metal Amt</th>
              <th className="text-right">Total</th>
              <th className="text-right">Cash</th>
              <th className="text-right">Bank</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={14} className="text-center py-8">Loading...</td></tr>
            )}
            {!isLoading && vouchers.length === 0 && (
              <tr><td colSpan={14} className="text-center py-8 text-gray-400">No purchase vouchers found</td></tr>
            )}
            {vouchers.map((v: any, idx: number) => (
              <tr key={v.id} className="cursor-pointer hover:bg-blue-50">
                <td>{idx + 1}</td>
                <td className="font-medium text-blue-600">{v.voucherNo}</td>
                <td>{new Date(v.voucherDate).toLocaleDateString('en-IN')}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${v.purchaseType === 'OLD_GOLD' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                    {v.purchaseType || 'URD'}
                  </span>
                </td>
                <td>{v.account?.name || '-'}</td>
                <td className="text-right">{v.items?.length || 0}</td>
                <td className="text-right">{formatWeight(v.totalGrossWeight)}</td>
                <td className="text-right">{formatWeight(v.totalNetWeight)}</td>
                <td className="text-right">{formatWeight(v.totalFineWeight)}</td>
                <td className="text-right">{formatIndianNumber(v.metalAmount)}</td>
                <td className="text-right font-bold">{formatIndianNumber(v.voucherAmount)}</td>
                <td className="text-right">{formatIndianNumber(v.cashAmount)}</td>
                <td className="text-right">{formatIndianNumber(v.bankAmount)}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${v.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {v.status || 'DRAFT'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
