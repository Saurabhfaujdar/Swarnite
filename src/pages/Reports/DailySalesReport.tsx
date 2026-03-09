import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsAPI } from '../../lib/api';
import { formatIndianNumber, formatWeight, getToday } from '../../lib/utils';
import { exportToExcel, exportToPDF } from '../../lib/export';

export default function DailySalesReport() {
  const [dateFrom, setDateFrom] = useState(getToday());
  const [dateTo, setDateTo] = useState(getToday());
  const [groupBy, setGroupBy] = useState('date');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report-daily-sales', dateFrom, dateTo],
    queryFn: () => reportsAPI.dailySales({ dateFrom, dateTo }).then((r) => r.data),
  });

  const report = data || {};
  const rows = report.rows || [];
  const summary = report.summary || {};

  const handleExportExcel = () => {
    exportToExcel(rows.map((r: any, i: number) => ({
      'Sr.': i + 1,
      'Date': r.date,
      'Vouchers': r.voucherCount,
      'Gross Wt': r.totalGrossWeight,
      'Net Wt': r.totalNetWeight,
      'Metal Amt': r.metalAmount,
      'Labour Amt': r.labourAmount,
      'CGST': r.cgstAmount,
      'SGST': r.sgstAmount,
      'Total': r.totalAmount,
      'Cash': r.cashAmount,
      'Bank': r.bankAmount,
      'Due': r.dueAmount,
    })), 'DailySalesReport');
  };

  const handleExportPDF = () => {
    exportToPDF(
      'Daily Sales Report',
      ['Date', 'Vouchers', 'Gross Wt', 'Net Wt', 'Metal Amt', 'Labour', 'GST', 'Total', 'Cash', 'Bank', 'Due'],
      rows.map((r: any) => [
        r.date, r.voucherCount, formatWeight(r.totalGrossWeight),
        formatWeight(r.totalNetWeight), formatIndianNumber(r.metalAmount),
        formatIndianNumber(r.labourAmount), formatIndianNumber(r.gstAmount),
        formatIndianNumber(r.totalAmount), formatIndianNumber(r.cashAmount),
        formatIndianNumber(r.bankAmount), formatIndianNumber(r.dueAmount),
      ]),
      'DailySalesReport'
    );
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="panel">
        <div className="panel-header">Daily Sales Report</div>
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
            <label className="form-label block text-xs">Group By</label>
            <select className="form-select w-32" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="date">Date</option>
              <option value="salesman">Salesman</option>
              <option value="counter">Counter</option>
            </select>
          </div>
          <button onClick={() => refetch()} className="btn-primary">🔍 Generate</button>
          <div className="ml-auto flex gap-2">
            <button onClick={handleExportExcel} className="btn-outline text-xs">📊 Excel</button>
            <button onClick={handleExportPDF} className="btn-outline text-xs">📄 PDF</button>
            <button className="btn-outline text-xs">🖨️ Print</button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-3">
        <div className="bg-blue-50 p-3 rounded border text-center">
          <div className="text-xs text-blue-600">Total Vouchers</div>
          <div className="text-xl font-bold">{summary.totalVouchers || 0}</div>
        </div>
        <div className="bg-yellow-50 p-3 rounded border text-center">
          <div className="text-xs text-yellow-700">Total Weight</div>
          <div className="text-xl font-bold">{formatWeight(summary.totalGrossWeight || 0)}</div>
        </div>
        <div className="bg-green-50 p-3 rounded border text-center">
          <div className="text-xs text-green-700">Total Sales</div>
          <div className="text-xl font-bold">{formatIndianNumber(summary.totalAmount || 0)}</div>
        </div>
        <div className="bg-emerald-50 p-3 rounded border text-center">
          <div className="text-xs text-emerald-700">Cash Collected</div>
          <div className="text-xl font-bold">{formatIndianNumber(summary.cashAmount || 0)}</div>
        </div>
        <div className="bg-purple-50 p-3 rounded border text-center">
          <div className="text-xs text-purple-700">Bank Amount</div>
          <div className="text-xl font-bold">{formatIndianNumber(summary.bankAmount || 0)}</div>
        </div>
        <div className="bg-red-50 p-3 rounded border text-center">
          <div className="text-xs text-red-600">Total Due</div>
          <div className="text-xl font-bold text-red-600">{formatIndianNumber(summary.dueAmount || 0)}</div>
        </div>
      </div>

      {/* Data Table */}
      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Date</th>
              <th className="text-right">Vouchers</th>
              <th className="text-right">Gross Wt</th>
              <th className="text-right">Net Wt</th>
              <th className="text-right">Metal Amt</th>
              <th className="text-right">Labour</th>
              <th className="text-right">CGST</th>
              <th className="text-right">SGST</th>
              <th className="text-right">Total Amt</th>
              <th className="text-right">Cash</th>
              <th className="text-right">Bank</th>
              <th className="text-right">Card</th>
              <th className="text-right">Due</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={14} className="text-center py-8">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={14} className="text-center py-8 text-gray-400">No data for selected period</td></tr>
            )}
            {rows.map((r: any, idx: number) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{r.date}</td>
                <td className="text-right">{r.voucherCount}</td>
                <td className="text-right">{formatWeight(r.totalGrossWeight)}</td>
                <td className="text-right">{formatWeight(r.totalNetWeight)}</td>
                <td className="text-right">{formatIndianNumber(r.metalAmount)}</td>
                <td className="text-right">{formatIndianNumber(r.labourAmount)}</td>
                <td className="text-right">{formatIndianNumber(r.cgstAmount)}</td>
                <td className="text-right">{formatIndianNumber(r.sgstAmount)}</td>
                <td className="text-right font-bold">{formatIndianNumber(r.totalAmount)}</td>
                <td className="text-right">{formatIndianNumber(r.cashAmount)}</td>
                <td className="text-right">{formatIndianNumber(r.bankAmount)}</td>
                <td className="text-right">{formatIndianNumber(r.cardAmount)}</td>
                <td className="text-right text-red-600">{formatIndianNumber(r.dueAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
