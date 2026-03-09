import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { branchAPI } from '../../lib/api';
import { formatWeight, getToday } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

export default function BranchReceiptList() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(getToday());
  const [dateTo, setDateTo] = useState(getToday());
  const [typeFilter, setTypeFilter] = useState('ALL');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['branch-transfers', dateFrom, dateTo, typeFilter],
    queryFn: () => branchAPI.list({ dateFrom, dateTo, type: typeFilter !== 'ALL' ? typeFilter : undefined }).then((r) => r.data),
  });

  const transfers = data?.transfers || [];

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="panel">
        <div className="panel-header">Branch Transfer List</div>
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
            <label className="form-label block text-xs">Type</label>
            <select className="form-select w-32" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="ISSUE">Issue</option>
              <option value="RECEIPT">Receipt</option>
            </select>
          </div>
          <button onClick={() => refetch()} className="btn-primary">🔍 Search</button>
          <button onClick={() => navigate('/branch/issue')} className="btn-success">+ New Issue</button>
          <button onClick={() => navigate('/branch/receipt')} className="btn-primary">+ New Receipt</button>
        </div>
      </div>

      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Transfer No</th>
              <th>Date</th>
              <th>Type</th>
              <th>From Branch</th>
              <th>To Branch</th>
              <th className="text-right">Items</th>
              <th className="text-right">Gross Wt</th>
              <th className="text-right">Net Wt</th>
              <th>Status</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="text-center py-8">Loading...</td></tr>}
            {!isLoading && transfers.length === 0 && (
              <tr><td colSpan={11} className="text-center py-8 text-gray-400">No transfers found</td></tr>
            )}
            {transfers.map((t: any, idx: number) => (
              <tr key={t.id}>
                <td>{idx + 1}</td>
                <td className="font-medium text-blue-600">{t.transferNo}</td>
                <td>{new Date(t.transferDate).toLocaleDateString('en-IN')}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${t.transferType === 'ISSUE' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                    {t.transferType}
                  </span>
                </td>
                <td>{t.fromBranch?.name || '-'}</td>
                <td>{t.toBranch?.name || '-'}</td>
                <td className="text-right">{t.items?.length || t.totalPcs || 0}</td>
                <td className="text-right">{formatWeight(t.totalGrossWeight)}</td>
                <td className="text-right">{formatWeight(t.totalNetWeight)}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    t.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    t.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {t.status || 'PENDING'}
                  </span>
                </td>
                <td className="text-xs">{t.remarks || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
