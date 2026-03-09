import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsAPI } from '../../lib/api';
import { formatIndianNumber, formatWeight } from '../../lib/utils';
import { exportToExcel, exportToPDF } from '../../lib/export';

export default function StockReport() {
  const [groupBy, setGroupBy] = useState('item');
  const [metalFilter, setMetalFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('IN_STOCK');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report-stock', groupBy, metalFilter, statusFilter],
    queryFn: () => reportsAPI.stock({ groupBy, metal: metalFilter !== 'ALL' ? metalFilter : undefined, status: statusFilter !== 'ALL' ? statusFilter : undefined }).then((r) => r.data),
  });

  const report = data || {};
  const rows = report.rows || [];
  const summary = report.summary || {};

  const handleExportExcel = () => {
    exportToExcel(rows.map((r: any, i: number) => ({
      'Sr.': i + 1,
      'Item / Group': r.name,
      'Metal': r.metalType,
      'Purity': r.purity,
      'Pcs': r.pcs,
      'Gross Wt': r.grossWeight,
      'Net Wt': r.netWeight,
      'Fine Wt': r.fineWeight,
      'Value': r.value,
    })), 'StockReport');
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="panel">
        <div className="panel-header">Stock Summary Report</div>
        <div className="panel-body flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Group By</label>
            <select className="form-select w-32" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="item">Item</option>
              <option value="group">Item Group</option>
              <option value="metal">Metal Type</option>
              <option value="counter">Counter</option>
              <option value="branch">Branch</option>
            </select>
          </div>
          <div>
            <label className="form-label block text-xs">Metal</label>
            <select className="form-select w-32" value={metalFilter} onChange={(e) => setMetalFilter(e.target.value)}>
              <option value="ALL">All Metals</option>
              <option value="GOLD">Gold</option>
              <option value="SILVER">Silver</option>
              <option value="DIAMOND">Diamond</option>
              <option value="PLATINUM">Platinum</option>
            </select>
          </div>
          <div>
            <label className="form-label block text-xs">Status</label>
            <select className="form-select w-32" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="SOLD">Sold</option>
              <option value="ON_APPROVAL">On Approval</option>
            </select>
          </div>
          <button onClick={() => refetch()} className="btn-primary">🔍 Generate</button>
          <div className="ml-auto flex gap-2">
            <button onClick={handleExportExcel} className="btn-outline text-xs">📊 Excel</button>
            <button className="btn-outline text-xs">📄 PDF</button>
            <button className="btn-outline text-xs">🖨️ Print</button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-amber-50 p-3 rounded border text-center">
          <div className="text-xs text-amber-700">Total Items</div>
          <div className="text-xl font-bold">{summary.totalItems || 0}</div>
        </div>
        <div className="bg-blue-50 p-3 rounded border text-center">
          <div className="text-xs text-blue-600">Total Pcs</div>
          <div className="text-xl font-bold">{summary.totalPcs || 0}</div>
        </div>
        <div className="bg-yellow-50 p-3 rounded border text-center">
          <div className="text-xs text-yellow-700">Gross Weight</div>
          <div className="text-xl font-bold">{formatWeight(summary.totalGrossWeight || 0)}</div>
        </div>
        <div className="bg-green-50 p-3 rounded border text-center">
          <div className="text-xs text-green-700">Net Weight</div>
          <div className="text-xl font-bold">{formatWeight(summary.totalNetWeight || 0)}</div>
        </div>
        <div className="bg-purple-50 p-3 rounded border text-center">
          <div className="text-xs text-purple-700">Fine Weight</div>
          <div className="text-xl font-bold">{formatWeight(summary.totalFineWeight || 0)}</div>
        </div>
      </div>

      {/* Data Table */}
      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Item / Group</th>
              <th>Metal</th>
              <th>Purity</th>
              <th className="text-right">Pcs</th>
              <th className="text-right">Gross Wt</th>
              <th className="text-right">Net Wt</th>
              <th className="text-right">Fine Wt</th>
              <th className="text-right">Avg Rate</th>
              <th className="text-right">Value</th>
              <th className="text-right">% of Stock</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="text-center py-8">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={11} className="text-center py-8 text-gray-400">No stock data</td></tr>
            )}
            {rows.map((r: any, idx: number) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td className="font-medium">{r.name}</td>
                <td>{r.metalType || '-'}</td>
                <td>{r.purity || '-'}</td>
                <td className="text-right">{r.pcs}</td>
                <td className="text-right">{formatWeight(r.grossWeight)}</td>
                <td className="text-right">{formatWeight(r.netWeight)}</td>
                <td className="text-right">{formatWeight(r.fineWeight)}</td>
                <td className="text-right">{formatIndianNumber(r.avgRate || 0)}</td>
                <td className="text-right font-medium">{formatIndianNumber(r.value || 0)}</td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-amber-500 rounded-full h-2"
                        style={{ width: `${Math.min(100, (r.pcs / (summary.totalPcs || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs">{((r.pcs / (summary.totalPcs || 1)) * 100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td colSpan={4}>Grand Total</td>
                <td className="text-right">{summary.totalPcs}</td>
                <td className="text-right">{formatWeight(summary.totalGrossWeight)}</td>
                <td className="text-right">{formatWeight(summary.totalNetWeight)}</td>
                <td className="text-right">{formatWeight(summary.totalFineWeight)}</td>
                <td></td>
                <td className="text-right">{formatIndianNumber(summary.totalValue || 0)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
