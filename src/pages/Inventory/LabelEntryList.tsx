import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryAPI } from '../../lib/api';
import { formatWeight, getToday } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

export default function LabelEntryList() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(getToday());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['labels-list', dateFrom, dateTo, search, statusFilter],
    queryFn: () =>
      inventoryAPI.labels({ dateFrom, dateTo, search, status: statusFilter !== 'ALL' ? statusFilter : undefined }).then((r) => r.data),
  });

  const labels = data?.labels || [];
  const totalGrossWt = labels.reduce((s: number, l: any) => s + Number(l.grossWeight || 0), 0);
  const totalNetWt = labels.reduce((s: number, l: any) => s + Number(l.netWeight || 0), 0);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="panel">
        <div className="panel-header">Label / SKU List</div>
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
            <input className="form-input w-48" placeholder="Label No / Item..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="form-label block text-xs">Status</label>
            <select className="form-select w-32" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="SOLD">Sold</option>
              <option value="ON_APPROVAL">On Approval</option>
              <option value="TRANSFERRED">Transferred</option>
            </select>
          </div>
          <button onClick={() => refetch()} className="btn-primary">🔍 Search</button>
          <button onClick={() => navigate('/inventory/labels/new')} className="btn-success">+ New Label</button>
        </div>
      </div>

      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Label No</th>
              <th>Item Name</th>
              <th>Metal</th>
              <th>Purity</th>
              <th className="text-right">Gross Wt</th>
              <th className="text-right">Net Wt</th>
              <th className="text-right">Pcs</th>
              <th>HUID</th>
              <th>Size</th>
              <th>Counter</th>
              <th>Branch</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={14} className="text-center py-8">Loading...</td></tr>
            )}
            {!isLoading && labels.length === 0 && (
              <tr><td colSpan={14} className="text-center py-8 text-gray-400">No labels found</td></tr>
            )}
            {labels.map((l: any, idx: number) => (
              <tr key={l.id}>
                <td>{idx + 1}</td>
                <td className="font-medium text-blue-600">{l.labelNo}</td>
                <td>{l.item?.name || '-'}</td>
                <td>{l.item?.metalType?.name || '-'}</td>
                <td>{l.item?.purity?.code || '-'}</td>
                <td className="text-right">{formatWeight(l.grossWeight)}</td>
                <td className="text-right">{formatWeight(l.netWeight)}</td>
                <td className="text-right">{l.pcsCount || 1}</td>
                <td>{l.huid || '-'}</td>
                <td>{l.size || '-'}</td>
                <td>{l.counterCode || '-'}</td>
                <td>{l.branch?.name || '-'}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    l.status === 'IN_STOCK' ? 'bg-green-100 text-green-800' :
                    l.status === 'SOLD' ? 'bg-red-100 text-red-800' :
                    l.status === 'ON_APPROVAL' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {l.status}
                  </span>
                </td>
                <td className="text-xs">{new Date(l.createdAt).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
          {labels.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td colSpan={5}>Total ({labels.length} labels)</td>
                <td className="text-right">{formatWeight(totalGrossWt)}</td>
                <td className="text-right">{formatWeight(totalNetWt)}</td>
                <td colSpan={7}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center text-sm text-gray-600">
        <span>
          {labels.length} labels | Gross: {formatWeight(totalGrossWt)} | Net: {formatWeight(totalNetWt)}
        </span>
        <div className="flex gap-2">
          <button className="btn-outline text-xs">📋 Export Excel</button>
          <button className="btn-outline text-xs">🖨️ Print</button>
        </div>
      </div>
    </div>
  );
}
