import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsAPI } from '../../lib/api';
import { formatIndianNumber, formatWeight, getToday } from '../../lib/utils';
import { exportToExcel, exportToPDF } from '../../lib/export';
import BranchFilter from '../../components/BranchFilter';
import ReportTabs from '../../components/ReportTabs';

type SortKey = 'totalSales' | 'qtySold' | 'avgPrice' | 'avgWeight' | 'totalWeight' | 'labourPercent' | 'name';

export default function ItemWiseSalesReport() {
  const [dateFrom, setDateFrom] = useState(getToday());
  const [dateTo, setDateTo] = useState(getToday());
  const [groupBy, setGroupBy] = useState('item');
  const [category, setCategory] = useState('ALL');
  const [metal, setMetal] = useState('ALL');
  const [branchId, setBranchId] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('totalSales');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showDeadStock, setShowDeadStock] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report-item-wise-sales', dateFrom, dateTo, groupBy, category, metal, branchId],
    queryFn: () =>
      reportsAPI
        .itemWiseSales({
          dateFrom,
          dateTo,
          groupBy,
          ...(category !== 'ALL' ? { category } : {}),
          ...(metal !== 'ALL' ? { metal } : {}),
          ...(branchId ? { branchId } : {}),
        })
        .then((r) => r.data),
  });

  const report = data || {};
  const filters = report.filters || { categories: [], metals: [] };
  const summary = report.summary || {};
  const deadStock: any[] = report.deadStock || [];

  // Sort rows
  const rows = [...(report.rows || [])].sort((a: any, b: any) => {
    const av = typeof a[sortBy] === 'string' ? a[sortBy].toLowerCase() : a[sortBy];
    const bv = typeof b[sortBy] === 'string' ? b[sortBy].toLowerCase() : b[sortBy];
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortBy !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const isItemView = groupBy === 'item';
  const colCount = isItemView ? 12 : 10;

  const handleExportExcel = () => {
    const salesRows = rows.map((r: any, i: number) => ({
      'Sr.': i + 1,
      Name: r.name,
      ...(isItemView ? { Category: r.category, Metal: r.metal } : {}),
      'Qty Sold': r.qtySold,
      'Total Wt': r.totalWeight,
      'Total Sales': r.totalSales,
      'Metal Amt': r.metalAmount,
      'Labour Amt': r.labourAmount,
      'Labour %': Number(r.labourPercent).toFixed(1) + '%',
      'Avg Price': r.avgPrice,
      'Avg Wt': r.avgWeight,
    }));
    const deadRows = deadStock.map((d: any, i: number) => ({
      'Sr.': i + 1,
      Name: d.name,
      Category: d.category,
      Metal: d.metal,
      'Stock Qty': d.stockQty,
      'Stock Weight': d.stockWeight,
    }));
    exportToExcel([...salesRows, {}, { 'Sr.': '--- DEAD STOCK ---' }, ...deadRows], 'ItemWiseSalesReport');
  };

  const handleExportPDF = () => {
    exportToPDF(
      'Item-Wise Sales Report',
      ['Name', 'Qty', 'Total Wt', 'Total Sales', 'Metal Amt', 'Labour', 'Lab%', 'Avg Price'],
      rows.map((r: any) => [
        r.name, r.qtySold, formatWeight(r.totalWeight), formatIndianNumber(r.totalSales),
        formatIndianNumber(r.metalAmount), formatIndianNumber(r.labourAmount),
        Number(r.labourPercent).toFixed(1) + '%', formatIndianNumber(r.avgPrice),
      ]),
      'ItemWiseSalesReport',
    );
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <ReportTabs />
      {/* Filters */}
      <div className="panel">
        <div className="panel-header">Item-Wise Sales Report</div>
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
            <select className="form-select w-36" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="item">Item Name</option>
              <option value="category">Category</option>
              <option value="metal">Metal Type</option>
              <option value="salesman">Salesman</option>
            </select>
          </div>
          <div>
            <label className="form-label block text-xs">Category</label>
            <select className="form-select w-36" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="ALL">All Categories</option>
              {filters.categories.map((c: string) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label block text-xs">Metal</label>
            <select className="form-select w-32" value={metal} onChange={(e) => setMetal(e.target.value)}>
              <option value="ALL">All Metals</option>
              {filters.metals.map((m: string) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <BranchFilter value={branchId} onChange={setBranchId} />
          <button onClick={() => refetch()} className="btn-primary">🔍 Generate</button>
          <div className="ml-auto flex gap-2">
            <button onClick={handleExportExcel} className="btn-outline text-xs">📊 Excel</button>
            <button onClick={handleExportPDF} className="btn-outline text-xs">📄 PDF</button>
            <button onClick={() => window.print()} className="btn-outline text-xs">🖨️ Print</button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-green-50 p-3 rounded border text-center">
          <div className="text-xs text-green-700">Total Sales</div>
          <div className="text-xl font-bold">{formatIndianNumber(summary.totalSales || 0)}</div>
        </div>
        <div className="bg-blue-50 p-3 rounded border text-center">
          <div className="text-xs text-blue-600">Total Qty Sold</div>
          <div className="text-xl font-bold">{summary.totalQty || 0}</div>
        </div>
        <div className="bg-yellow-50 p-3 rounded border text-center">
          <div className="text-xs text-yellow-700">Total Weight</div>
          <div className="text-xl font-bold">{formatWeight(summary.totalWeight || 0)}</div>
        </div>
        <div className="bg-amber-50 p-3 rounded border text-center">
          <div className="text-xs text-amber-700">Metal Value</div>
          <div className="text-xl font-bold">{formatIndianNumber(summary.totalMetal || 0)}</div>
        </div>
        <div className="bg-purple-50 p-3 rounded border text-center">
          <div className="text-xs text-purple-700">Making Charges</div>
          <div className="text-xl font-bold">{formatIndianNumber(summary.totalLabour || 0)}</div>
        </div>
      </div>

      {/* Sort buttons + Dead Stock toggle */}
      <div className="flex gap-2 items-center text-xs">
        <span className="text-gray-500 font-medium">Sort by:</span>
        {[
          { key: 'totalSales' as SortKey, label: 'Sales ₹', desc: 'Top revenue items' },
          { key: 'qtySold' as SortKey, label: 'Qty', desc: 'Fast movers' },
          { key: 'avgPrice' as SortKey, label: 'Avg Price', desc: 'Premium items' },
          { key: 'labourPercent' as SortKey, label: 'Making %', desc: 'High margin items' },
          { key: 'totalWeight' as SortKey, label: 'Weight', desc: 'Heavy movers' },
          { key: 'name' as SortKey, label: 'Name', desc: 'Alphabetical' },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => handleSort(s.key)}
            title={s.desc}
            className={`px-2 py-1 rounded border text-xs ${
              sortBy === s.key ? 'bg-jewel-royal text-white border-jewel-royal' : 'bg-white hover:bg-gray-50'
            }`}
          >
            {s.label}{sortIcon(s.key)}
          </button>
        ))}
        <div className="ml-auto">
          {deadStock.length > 0 && (
            <button
              onClick={() => setShowDeadStock(!showDeadStock)}
              className={`px-3 py-1 rounded border text-xs font-medium ${
                showDeadStock
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
              }`}
            >
              🚨 Dead Stock ({deadStock.length})
            </button>
          )}
        </div>
      </div>

      {/* Dead Stock Panel */}
      {showDeadStock && deadStock.length > 0 && (
        <div className="panel border-red-200">
          <div className="panel-header bg-red-50 text-red-800">
            Dead Stock — Items in inventory with ZERO sales in selected period
          </div>
          <div className="max-h-60 overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sr.</th>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Metal</th>
                  <th className="text-right">Stock Qty</th>
                  <th className="text-right">Stock Weight</th>
                </tr>
              </thead>
              <tbody>
                {deadStock.map((d: any, idx: number) => (
                  <tr key={idx} className="text-red-700">
                    <td>{idx + 1}</td>
                    <td className="font-medium">{d.name}</td>
                    <td>{d.category}</td>
                    <td>{d.metal}</td>
                    <td className="text-right">{d.stockQty}</td>
                    <td className="text-right">{formatWeight(d.stockWeight)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-red-50">
                  <td colSpan={4}>Total Dead Stock</td>
                  <td className="text-right">{deadStock.reduce((s: number, d: any) => s + d.stockQty, 0)}</td>
                  <td className="text-right">{formatWeight(deadStock.reduce((s: number, d: any) => s + d.stockWeight, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Main Data Table */}
      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th className="cursor-pointer" onClick={() => handleSort('name')}>
                {groupBy === 'category' ? 'Category' : groupBy === 'metal' ? 'Metal Type' : groupBy === 'salesman' ? 'Salesman' : 'Item Name'}{sortIcon('name')}
              </th>
              {isItemView && <th>Category</th>}
              {isItemView && <th>Metal</th>}
              <th className="text-right cursor-pointer" onClick={() => handleSort('qtySold')}>Qty Sold{sortIcon('qtySold')}</th>
              <th className="text-right cursor-pointer" onClick={() => handleSort('totalWeight')}>Total Wt{sortIcon('totalWeight')}</th>
              <th className="text-right cursor-pointer" onClick={() => handleSort('totalSales')}>Total Sales{sortIcon('totalSales')}</th>
              <th className="text-right">Metal Amt</th>
              <th className="text-right">Making Amt</th>
              <th className="text-right cursor-pointer" onClick={() => handleSort('labourPercent')}>Making %{sortIcon('labourPercent')}</th>
              <th className="text-right cursor-pointer" onClick={() => handleSort('avgPrice')}>Avg Price{sortIcon('avgPrice')}</th>
              <th className="text-right cursor-pointer" onClick={() => handleSort('avgWeight')}>Avg Wt{sortIcon('avgWeight')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={colCount} className="text-center py-8">Loading...</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={colCount} className="text-center py-8 text-gray-400">No data for selected period</td></tr>
            )}
            {rows.map((r: any, idx: number) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td className="font-medium">{r.name}</td>
                {isItemView && <td className="text-gray-500">{r.category}</td>}
                {isItemView && <td className="text-gray-500">{r.metal}</td>}
                <td className="text-right">{r.qtySold}</td>
                <td className="text-right">{formatWeight(r.totalWeight)}</td>
                <td className="text-right font-bold">{formatIndianNumber(r.totalSales)}</td>
                <td className="text-right">{formatIndianNumber(r.metalAmount)}</td>
                <td className="text-right">{formatIndianNumber(r.labourAmount)}</td>
                <td className="text-right">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    r.labourPercent >= 15 ? 'bg-green-100 text-green-800' :
                    r.labourPercent >= 8 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {Number(r.labourPercent).toFixed(1)}%
                  </span>
                </td>
                <td className="text-right">{formatIndianNumber(r.avgPrice)}</td>
                <td className="text-right">{formatWeight(r.avgWeight)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td colSpan={isItemView ? 4 : 2}>Grand Total</td>
                <td className="text-right">{summary.totalQty || 0}</td>
                <td className="text-right">{formatWeight(summary.totalWeight || 0)}</td>
                <td className="text-right">{formatIndianNumber(summary.totalSales || 0)}</td>
                <td className="text-right">{formatIndianNumber(summary.totalMetal || 0)}</td>
                <td className="text-right">{formatIndianNumber(summary.totalLabour || 0)}</td>
                <td className="text-right">
                  {summary.totalMetal > 0
                    ? ((summary.totalLabour / summary.totalMetal) * 100).toFixed(1) + '%'
                    : '-'}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
