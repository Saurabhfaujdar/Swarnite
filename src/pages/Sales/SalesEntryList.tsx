import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesAPI, mastersAPI } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatWeight, formatIndianNumber, getToday } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import VoucherPrintDialog from '../../components/VoucherPrintDialog';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'VOID', label: 'Void' },
];

const PAYMENT_MODE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK', label: 'Bank' },
  { value: 'CARD', label: 'Card' },
  { value: 'OLD_GOLD', label: 'Old Gold' },
  { value: 'DUE', label: 'Due Only' },
];

const SORT_OPTIONS = [
  { value: 'voucherDate', label: 'Date' },
  { value: 'voucherNo', label: 'Voucher No' },
  { value: 'voucherAmount', label: 'Amount' },
  { value: 'dueAmount', label: 'Due' },
  { value: 'totalGrossWeight', label: 'Gross Wt' },
  { value: 'totalNetWeight', label: 'Net Wt' },
  { value: 'metalAmount', label: 'Metal Amt' },
  { value: 'createdAt', label: 'Created' },
];

export default function SalesEntryList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Filter state ──────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(getToday());
  const [search, setSearch] = useState('');
  const [voucherNo, setVoucherNo] = useState('');
  const [status, setStatus] = useState('ALL');
  const [salesmanName, setSalesmanName] = useState('');
  const [narration, setNarration] = useState('');
  const [reference, setReference] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [minDue, setMinDue] = useState('');
  const [maxDue, setMaxDue] = useState('');
  const [minGrossWeight, setMinGrossWeight] = useState('');
  const [maxGrossWeight, setMaxGrossWeight] = useState('');
  const [minNetWeight, setMinNetWeight] = useState('');
  const [maxNetWeight, setMaxNetWeight] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [labelNo, setLabelNo] = useState('');
  const [itemName, setItemName] = useState('');
  const [sortBy, setSortBy] = useState('voucherDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(1);
  const [printVoucherId, setPrintVoucherId] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: number; voucherNo: string } | null>(null);
  const limit = 50;

  // ── Salesmen for dropdown ─────────────────────────────────
  const { data: salesmenData } = useQuery({
    queryKey: ['salesmen'],
    queryFn: () => mastersAPI.salesmen().then((r) => r.data),
  });
  const salesmen = salesmenData || [];

  // ── Build query params ────────────────────────────────────
  const buildParams = useCallback(() => {
    const params: Record<string, any> = { page, limit };
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (search) params.search = search;
    if (voucherNo) params.voucherNo = voucherNo;
    if (status !== 'ALL') params.status = status;
    if (salesmanName) params.salesmanName = salesmanName;
    if (narration) params.narration = narration;
    if (reference) params.reference = reference;
    if (minAmount) params.minAmount = minAmount;
    if (maxAmount) params.maxAmount = maxAmount;
    if (minDue) params.minDue = minDue;
    if (maxDue) params.maxDue = maxDue;
    if (minGrossWeight) params.minGrossWeight = minGrossWeight;
    if (maxGrossWeight) params.maxGrossWeight = maxGrossWeight;
    if (minNetWeight) params.minNetWeight = minNetWeight;
    if (maxNetWeight) params.maxNetWeight = maxNetWeight;
    if (paymentMode) params.paymentMode = paymentMode;
    if (labelNo) params.labelNo = labelNo;
    if (itemName) params.itemName = itemName;
    params.sortBy = sortBy;
    params.sortOrder = sortOrder;
    return params;
  }, [
    dateFrom, dateTo, search, voucherNo, status, salesmanName,
    narration, reference, minAmount, maxAmount, minDue, maxDue,
    minGrossWeight, maxGrossWeight, minNetWeight, maxNetWeight,
    paymentMode, labelNo, itemName, sortBy, sortOrder, page, limit,
  ]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sales-list', buildParams()],
    queryFn: () => salesAPI.list(buildParams()).then((r) => r.data),
  });

  const vouchers = data?.vouchers || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  // ── Footer totals ─────────────────────────────────────────
  const totals = useMemo(() => {
    return vouchers.reduce(
      (acc: any, v: any) => ({
        amount: acc.amount + Number(v.voucherAmount || 0),
        grossWt: acc.grossWt + Number(v.totalGrossWeight || 0),
        netWt: acc.netWt + Number(v.totalNetWeight || 0),
        cash: acc.cash + Number(v.cashAmount || 0),
        bank: acc.bank + Number(v.bankAmount || 0),
        due: acc.due + Number(v.dueAmount || 0),
      }),
      { amount: 0, grossWt: 0, netWt: 0, cash: 0, bank: 0, due: 0 },
    );
  }, [vouchers]);

  // ── Cancel mutation ────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: (id: number) => salesAPI.cancel(id),
    onSuccess: () => {
      toast.success('Voucher cancelled successfully');
      queryClient.invalidateQueries({ queryKey: ['sales-list'] });
      setCancelTarget(null);
    },
    onError: () => {
      toast.error('Failed to cancel voucher');
    },
  });

  // ── Active filter count ───────────────────────────────────
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (dateFrom) count++;
    if (dateTo && dateTo !== getToday()) count++;
    if (search) count++;
    if (voucherNo) count++;
    if (status !== 'ALL') count++;
    if (salesmanName) count++;
    if (narration) count++;
    if (reference) count++;
    if (minAmount) count++;
    if (maxAmount) count++;
    if (minDue) count++;
    if (maxDue) count++;
    if (minGrossWeight) count++;
    if (maxGrossWeight) count++;
    if (minNetWeight) count++;
    if (maxNetWeight) count++;
    if (paymentMode) count++;
    if (labelNo) count++;
    if (itemName) count++;
    return count;
  }, [
    dateFrom, dateTo, search, voucherNo, status, salesmanName,
    narration, reference, minAmount, maxAmount, minDue, maxDue,
    minGrossWeight, maxGrossWeight, minNetWeight, maxNetWeight,
    paymentMode, labelNo, itemName,
  ]);

  const clearFilters = () => {
    setDateFrom('');
    setDateTo(getToday());
    setSearch('');
    setVoucherNo('');
    setStatus('ALL');
    setSalesmanName('');
    setNarration('');
    setReference('');
    setMinAmount('');
    setMaxAmount('');
    setMinDue('');
    setMaxDue('');
    setMinGrossWeight('');
    setMaxGrossWeight('');
    setMinNetWeight('');
    setMaxNetWeight('');
    setPaymentMode('');
    setLabelNo('');
    setItemName('');
    setSortBy('voucherDate');
    setSortOrder('desc');
    setPage(1);
  };

  const handleSearch = () => {
    setPage(1);
    refetch();
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getSortIndicator = (field: string) => {
    if (sortBy !== field) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* ── Primary Filter Bar ─────────────────────────────── */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <span>Sales Voucher List</span>
          <div className="flex gap-2">
            <button
              data-testid="toggle-advanced"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="btn-secondary text-xs"
            >
              {showAdvanced ? '▲ Hide Filters' : '▼ More Filters'}
              {activeFilterCount > 0 && (
                <span className="ml-1 bg-blue-600 text-white rounded-full px-1.5 text-[10px]">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button onClick={() => navigate('/sales/new')} className="btn-success text-xs">+ New Sale</button>
          </div>
        </div>

        <div className="panel-body flex gap-4 items-end flex-wrap">
          {/* Quick search */}
          <div>
            <label className="form-label block text-xs">Search</label>
            <input
              type="text"
              className="form-input w-52"
              placeholder="Voucher / Customer / Narration..."
              data-testid="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div>
            <label className="form-label block text-xs">From Date</label>
            <input
              type="date"
              className="form-input w-36"
              data-testid="date-from"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label block text-xs">To Date</label>
            <input
              type="date"
              className="form-input w-36"
              data-testid="date-to"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Status</label>
            <select
              className="form-select w-28"
              data-testid="status-filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label block text-xs">Salesman</label>
            <select
              className="form-select w-36"
              data-testid="salesman-filter"
              value={salesmanName}
              onChange={(e) => setSalesmanName(e.target.value)}
            >
              <option value="">All</option>
              {salesmen.map((s: any) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <button onClick={handleSearch} className="btn-primary text-xs" data-testid="search-btn">Search</button>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="btn-danger text-xs" data-testid="clear-filters">
              Clear ({activeFilterCount})
            </button>
          )}
        </div>

        {/* ── Advanced Filters (collapsible) ─────────────── */}
        {showAdvanced && (
          <div className="panel-body border-t border-gray-200 flex gap-4 items-end flex-wrap pt-3" data-testid="advanced-filters">
            {/* Voucher No */}
            <div>
              <label className="form-label block text-xs">Voucher No</label>
              <input
                type="text"
                className="form-input w-32"
                placeholder="JGI/..."
                data-testid="filter-voucherNo"
                value={voucherNo}
                onChange={(e) => setVoucherNo(e.target.value)}
              />
            </div>
            {/* Narration */}
            <div>
              <label className="form-label block text-xs">Narration</label>
              <input
                type="text"
                className="form-input w-40"
                placeholder="Contains..."
                data-testid="filter-narration"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
              />
            </div>
            {/* Reference */}
            <div>
              <label className="form-label block text-xs">Reference</label>
              <input
                type="text"
                className="form-input w-36"
                placeholder="Contains..."
                data-testid="filter-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            {/* Payment Mode */}
            <div>
              <label className="form-label block text-xs">Payment Mode</label>
              <select
                className="form-select w-28"
                data-testid="filter-paymentMode"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                {PAYMENT_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* Label No */}
            <div>
              <label className="form-label block text-xs">Label No</label>
              <input
                type="text"
                className="form-input w-28"
                placeholder="GB/13..."
                data-testid="filter-labelNo"
                value={labelNo}
                onChange={(e) => setLabelNo(e.target.value)}
              />
            </div>
            {/* Item Name */}
            <div>
              <label className="form-label block text-xs">Item Name</label>
              <input
                type="text"
                className="form-input w-36"
                placeholder="Necklace..."
                data-testid="filter-itemName"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
            </div>
            {/* Amount Range */}
            <div>
              <label className="form-label block text-xs">Amount Range</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  className="form-input w-24"
                  placeholder="Min"
                  data-testid="filter-minAmount"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                />
                <input
                  type="number"
                  className="form-input w-24"
                  placeholder="Max"
                  data-testid="filter-maxAmount"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                />
              </div>
            </div>
            {/* Due Range */}
            <div>
              <label className="form-label block text-xs">Due Range</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  className="form-input w-24"
                  placeholder="Min"
                  data-testid="filter-minDue"
                  value={minDue}
                  onChange={(e) => setMinDue(e.target.value)}
                />
                <input
                  type="number"
                  className="form-input w-24"
                  placeholder="Max"
                  data-testid="filter-maxDue"
                  value={maxDue}
                  onChange={(e) => setMaxDue(e.target.value)}
                />
              </div>
            </div>
            {/* Gross Weight Range */}
            <div>
              <label className="form-label block text-xs">Gross Wt Range</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  className="form-input w-20"
                  placeholder="Min"
                  data-testid="filter-minGrossWeight"
                  value={minGrossWeight}
                  onChange={(e) => setMinGrossWeight(e.target.value)}
                  step="0.01"
                />
                <input
                  type="number"
                  className="form-input w-20"
                  placeholder="Max"
                  data-testid="filter-maxGrossWeight"
                  value={maxGrossWeight}
                  onChange={(e) => setMaxGrossWeight(e.target.value)}
                  step="0.01"
                />
              </div>
            </div>
            {/* Net Weight Range */}
            <div>
              <label className="form-label block text-xs">Net Wt Range</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  className="form-input w-20"
                  placeholder="Min"
                  data-testid="filter-minNetWeight"
                  value={minNetWeight}
                  onChange={(e) => setMinNetWeight(e.target.value)}
                  step="0.01"
                />
                <input
                  type="number"
                  className="form-input w-20"
                  placeholder="Max"
                  data-testid="filter-maxNetWeight"
                  value={maxNetWeight}
                  onChange={(e) => setMaxNetWeight(e.target.value)}
                  step="0.01"
                />
              </div>
            </div>
            {/* Sort */}
            <div>
              <label className="form-label block text-xs">Sort By</label>
              <div className="flex gap-1">
                <select
                  className="form-select w-28"
                  data-testid="sort-by"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button
                  className="btn-secondary text-xs px-2"
                  data-testid="sort-order"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  {sortOrder === 'asc' ? '▲ Asc' : '▼ Desc'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Data Grid ──────────────────────────────────────── */}
      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('voucherNo')}>
                Voucher No{getSortIndicator('voucherNo')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('voucherDate')}>
                Date{getSortIndicator('voucherDate')}
              </th>
              <th>Customer</th>
              <th>Salesman</th>
              <th className="text-right">Items</th>
              <th className="text-right cursor-pointer select-none" onClick={() => toggleSort('totalGrossWeight')}>
                Gross Wt{getSortIndicator('totalGrossWeight')}
              </th>
              <th className="text-right cursor-pointer select-none" onClick={() => toggleSort('totalNetWeight')}>
                Net Wt{getSortIndicator('totalNetWeight')}
              </th>
              <th className="text-right cursor-pointer select-none" onClick={() => toggleSort('metalAmount')}>
                Metal Amt{getSortIndicator('metalAmount')}
              </th>
              <th className="text-right">Labour</th>
              <th className="text-right">CGST</th>
              <th className="text-right">SGST</th>
              <th className="text-right cursor-pointer select-none" onClick={() => toggleSort('voucherAmount')}>
                Total{getSortIndicator('voucherAmount')}
              </th>
              <th className="text-right cursor-pointer select-none" onClick={() => toggleSort('cashAmount')}>
                Cash{getSortIndicator('cashAmount')}
              </th>
              <th className="text-right cursor-pointer select-none" onClick={() => toggleSort('bankAmount')}>
                Bank{getSortIndicator('bankAmount')}
              </th>
              <th className="text-right cursor-pointer select-none" onClick={() => toggleSort('dueAmount')}>
                Due{getSortIndicator('dueAmount')}
              </th>
              <th>Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={18} className="text-center py-8">Loading...</td>
              </tr>
            )}
            {!isLoading && vouchers.length === 0 && (
              <tr>
                <td colSpan={18} className="text-center py-8 text-gray-400">No sales vouchers found</td>
              </tr>
            )}
            {vouchers.map((v: any, idx: number) => (
              <tr key={v.id} className="cursor-pointer hover:bg-blue-50" onClick={() => navigate(`/sales/${v.id}`)}>
                <td>{(page - 1) * limit + idx + 1}</td>
                <td className="font-medium text-blue-600">{v.voucherNo}</td>
                <td>{new Date(v.voucherDate).toLocaleDateString('en-IN')}</td>
                <td>{v.account?.name || '-'}</td>
                <td>{v.salesman?.name || '-'}</td>
                <td className="text-right">{v.items?.length || 0}</td>
                <td className="text-right">{formatWeight(v.totalGrossWeight)}</td>
                <td className="text-right">{formatWeight(v.totalNetWeight)}</td>
                <td className="text-right">{formatIndianNumber(v.metalAmount)}</td>
                <td className="text-right">{formatIndianNumber(v.labourAmount)}</td>
                <td className="text-right">{formatIndianNumber(v.cgstAmount)}</td>
                <td className="text-right">{formatIndianNumber(v.sgstAmount)}</td>
                <td className="text-right font-bold">{formatIndianNumber(v.voucherAmount)}</td>
                <td className="text-right">{formatIndianNumber(v.cashAmount)}</td>
                <td className="text-right">{formatIndianNumber(v.bankAmount)}</td>
                <td className="text-right text-red-600">{formatIndianNumber(v.dueAmount)}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    v.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                    v.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {v.status}
                  </span>
                </td>
                <td className="text-center">
                  <div className="flex gap-1 justify-center">
                    <button
                      className="btn-outline text-xs px-2 py-0.5"
                      onClick={(e) => { e.stopPropagation(); setPrintVoucherId(v.id); }}
                      title="Print Voucher"
                    >
                      🖨️
                    </button>
                    {v.status === 'ACTIVE' && (
                      <button
                        className="btn-outline text-xs px-2 py-0.5 text-red-600 border-red-300 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); setCancelTarget({ id: v.id, voucherNo: v.voucherNo }); }}
                        title="Cancel Voucher"
                        data-testid={`cancel-btn-${v.id}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {vouchers.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td colSpan={6}>Total ({vouchers.length} of {total} vouchers)</td>
                <td className="text-right">{formatWeight(totals.grossWt)}</td>
                <td className="text-right">{formatWeight(totals.netWt)}</td>
                <td colSpan={4}></td>
                <td className="text-right">{formatIndianNumber(totals.amount)}</td>
                <td className="text-right">{formatIndianNumber(totals.cash)}</td>
                <td className="text-right">{formatIndianNumber(totals.bank)}</td>
                <td className="text-right text-red-600">{formatIndianNumber(totals.due)}</td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Pagination ─────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="panel">
          <div className="panel-body py-2 px-4 flex justify-between items-center text-sm">
            <span className="text-gray-600">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} total vouchers)
            </span>
            <div className="flex gap-1">
              <button
                className="btn-secondary text-xs"
                disabled={page <= 1}
                onClick={() => setPage(1)}
              >
                First
              </button>
              <button
                className="btn-secondary text-xs"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Prev
              </button>
              <button
                className="btn-secondary text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
              <button
                className="btn-secondary text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                Last
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Voucher Print Dialog ────────────────────────────── */}
      {printVoucherId && (
        <VoucherPrintDialog
          voucherId={printVoucherId}
          onClose={() => setPrintVoucherId(null)}
        />
      )}

      {/* ── Cancel Confirmation Dialog ──────────────────────── */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" data-testid="cancel-dialog">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel Voucher</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to cancel voucher <strong>{cancelTarget.voucherNo}</strong>?
              This will restore all labels to stock and reverse the customer balance.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="btn-secondary"
                onClick={() => setCancelTarget(null)}
                disabled={cancelMutation.isPending}
                data-testid="cancel-dialog-no"
              >
                No, Keep It
              </button>
              <button
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
                onClick={() => cancelMutation.mutate(cancelTarget.id)}
                disabled={cancelMutation.isPending}
                data-testid="cancel-dialog-yes"
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
