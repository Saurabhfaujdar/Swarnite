import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsAPI } from '../../lib/api';
import { formatIndianNumber, formatWeight, getToday } from '../../lib/utils';
import { exportToExcel } from '../../lib/export';

export default function CounterWiseReport() {
  const [dateFrom, setDateFrom] = useState(getToday());
  const [dateTo, setDateTo] = useState(getToday());
  const [reportType, setReportType] = useState<'sales' | 'stock'>('sales');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report-counter', dateFrom, dateTo, reportType],
    queryFn: () => {
      if (reportType === 'stock') {
        return reportsAPI.stock({ groupBy: 'counter' }).then((r) => r.data);
      }
      return reportsAPI.dailySales({ dateFrom, dateTo, groupBy: 'counter' }).then((r) => r.data);
    },
  });

  const rows = data?.rows || [];
  const summary = data?.summary || {};

  const handleExport = () => {
    exportToExcel(rows.map((r: any, i: number) => ({
      'Sr.': i + 1,
      'Counter': r.counterCode || r.name,
      'Items/Vouchers': r.count || r.voucherCount || r.pcs,
      'Gross Wt': r.grossWeight || r.totalGrossWeight,
      'Net Wt': r.netWeight || r.totalNetWeight,
      'Amount': r.totalAmount || r.value,
    })), `CounterWise_${reportType}_Report`);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="panel">
        <div className="panel-header">Counter-Wise Report</div>
        <div className="panel-body flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Report Type</label>
            <select className="form-select w-40" value={reportType} onChange={(e) => setReportType(e.target.value as any)}>
              <option value="sales">Sales Report</option>
              <option value="stock">Stock Report</option>
            </select>
          </div>
          {reportType === 'sales' && (
            <>
              <div>
                <label className="form-label block text-xs">From Date</label>
                <input type="date" className="form-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="form-label block text-xs">To Date</label>
                <input type="date" className="form-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </>
          )}
          <button onClick={() => refetch()} className="btn-primary">🔍 Generate</button>
          <div className="ml-auto flex gap-2">
            <button onClick={handleExport} className="btn-outline text-xs">📊 Excel</button>
            <button className="btn-outline text-xs">🖨️ Print</button>
          </div>
        </div>
      </div>

      {/* Chart-like visual */}
      {rows.length > 0 && (
        <div className="panel">
          <div className="panel-header">Counter Distribution</div>
          <div className="panel-body">
            <div className="flex gap-4 items-end" style={{ height: '120px' }}>
              {rows.map((r: any, idx: number) => {
                const maxVal = Math.max(...rows.map((x: any) => Number(x.totalAmount || x.value || x.pcs || 0)));
                const val = Number(r.totalAmount || r.value || r.pcs || 0);
                const height = maxVal > 0 ? (val / maxVal) * 100 : 0;
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-amber-500', 'bg-purple-500', 'bg-red-500', 'bg-teal-500'];
                return (
                  <div key={idx} className="flex flex-col items-center flex-1">
                    <span className="text-xs font-bold mb-1">{formatIndianNumber(val)}</span>
                    <div
                      className={`w-full ${colors[idx % colors.length]} rounded-t transition-all`}
                      style={{ height: `${height}%`, minHeight: '4px' }}
                    />
                    <span className="text-xs mt-1">{r.counterCode || r.name || `C${idx + 1}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Counter</th>
              <th className="text-right">{reportType === 'sales' ? 'Vouchers' : 'Items'}</th>
              <th className="text-right">Gross Wt</th>
              <th className="text-right">Net Wt</th>
              {reportType === 'sales' && (
                <>
                  <th className="text-right">Metal Amt</th>
                  <th className="text-right">Labour</th>
                  <th className="text-right">GST</th>
                </>
              )}
              <th className="text-right">{reportType === 'sales' ? 'Total Sales' : 'Stock Value'}</th>
              <th className="text-right">% Share</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={10} className="text-center py-8">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={10} className="text-center py-8 text-gray-400">No data</td></tr>
            )}
            {rows.map((r: any, idx: number) => {
              const total = Number(r.totalAmount || r.value || 0);
              const grandTotal = Number(summary.totalAmount || summary.totalValue || 1);
              const share = (total / grandTotal) * 100;
              return (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td className="font-medium">{r.counterCode || r.name}</td>
                  <td className="text-right">{r.voucherCount || r.pcs || 0}</td>
                  <td className="text-right">{formatWeight(r.grossWeight || r.totalGrossWeight || 0)}</td>
                  <td className="text-right">{formatWeight(r.netWeight || r.totalNetWeight || 0)}</td>
                  {reportType === 'sales' && (
                    <>
                      <td className="text-right">{formatIndianNumber(r.metalAmount || 0)}</td>
                      <td className="text-right">{formatIndianNumber(r.labourAmount || 0)}</td>
                      <td className="text-right">{formatIndianNumber(r.gstAmount || 0)}</td>
                    </>
                  )}
                  <td className="text-right font-bold">{formatIndianNumber(total)}</td>
                  <td className="text-right">{share.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td colSpan={2}>Grand Total</td>
                <td className="text-right"></td>
                <td className="text-right">{formatWeight(summary.totalGrossWeight || 0)}</td>
                <td className="text-right">{formatWeight(summary.totalNetWeight || 0)}</td>
                {reportType === 'sales' && <td colSpan={3}></td>}
                <td className="text-right">{formatIndianNumber(summary.totalAmount || summary.totalValue || 0)}</td>
                <td className="text-right">100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
