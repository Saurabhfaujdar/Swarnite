import { useState, useRef, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerPaymentsAPI, accountsAPI } from '../../lib/api';
import { formatIndianNumber, getToday, getFinancialYear } from '../../lib/utils';
import toast from 'react-hot-toast';
import AccountMasterModal from '../../components/AccountMasterModal';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';

export default function CustomerPaymentList() {
  const queryClient = useQueryClient();

  // --- List state ---
  const [search, setSearch] = useState('');
  const [paymentType, setPaymentType] = useState('ALL');
  const [status, setStatus] = useState('ACTIVE');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [cancelId, setCancelId] = useState<number | null>(null);
  // Tracks which consolidated scheme rows are currently expanded.
  // Default = all collapsed (per requirement: "by default it should be hidden").
  const [expandedSchemes, setExpandedSchemes] = useState<Set<string>>(new Set());

  const toggleScheme = (rowId: string) => {
    setExpandedSchemes((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  // --- Entry form state ---
  const [showForm, setShowForm] = useState(false);
  const cashRef = useRef<HTMLInputElement>(null);
  const [paymentDate, setPaymentDate] = useState(getToday());
  const [entryPaymentType, setEntryPaymentType] = useState<'ADVANCE' | 'DUE_PAYMENT' | 'REFUND'>('ADVANCE');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [cashAmount, setCashAmount] = useState(0);
  const [bankAmount, setBankAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [upiAmount, setUpiAmount] = useState(0);
  const [bankName, setBankName] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [narration, setNarration] = useState('');
  const [reference, setReference] = useState('');
  const [savedPaymentId, setSavedPaymentId] = useState<number | null>(null);

  const totalAmount = cashAmount + bankAmount + cardAmount + upiAmount;
  const currentBalance = customerData ? Number(customerData.closingBalance || 0) : 0;
  const balanceAfter = entryPaymentType === 'REFUND'
    ? currentBalance + totalAmount
    : currentBalance - totalAmount;

  // --- Queries ---
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

  const { data: customers } = useQuery({
    queryKey: ['accounts', 'customer-search', customerSearch],
    queryFn: () => accountsAPI.list({ search: customerSearch, type: 'CUSTOMER', limit: 10 }),
    enabled: customerSearch.length >= 2 && showForm,
    select: (res: any) => res.data?.accounts || [],
  });

  useEffect(() => {
    if (customerId) {
      accountsAPI.get(customerId).then((res: any) => setCustomerData(res.data));
    }
  }, [customerId]);

  const { data: balanceHistory } = useQuery({
    queryKey: ['balance-history', customerId],
    queryFn: () => customerPaymentsAPI.balanceHistory(customerId!),
    enabled: !!customerId,
    select: (res: any) => res.data,
  });

  // --- Mutations ---
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

  const saveMutation = useMutation({
    mutationFn: (data: any) => customerPaymentsAPI.create(data),
    onSuccess: (res: any) => {
      toast.success(`Payment ${res.data.receiptNo} recorded successfully`);
      setSavedPaymentId(res.data.id);
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
      queryClient.invalidateQueries({ queryKey: ['balance-history', customerId] });
      setCustomerData((prev: any) => ({
        ...prev,
        closingBalance: res.data.account?.closingBalance,
        balanceType: res.data.account?.balanceType,
      }));
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to save payment');
    },
  });

  const handleSave = () => {
    if (!customerId) return toast.error('Select a customer');
    if (totalAmount <= 0) return toast.error('Enter a payment amount');

    saveMutation.mutate({
      paymentDate,
      paymentType: entryPaymentType,
      accountId: customerId,
      cashAmount,
      bankAmount,
      cardAmount,
      upiAmount,
      bankName: bankName || undefined,
      chequeNo: chequeNo || undefined,
      narration: narration || undefined,
      reference: reference || undefined,
      financialYear: getFinancialYear(),
    });
  };

  const resetForm = () => {
    setCustomerId(null);
    setCustomerData(null);
    setCustomerSearch('');
    setCashAmount(0);
    setBankAmount(0);
    setCardAmount(0);
    setUpiAmount(0);
    setBankName('');
    setChequeNo('');
    setNarration('');
    setReference('');
    setSavedPaymentId(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); setShowCustomerModal(true); }
      if (e.key === 'F9' && showForm) { e.preventDefault(); handleSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const payments = data?.payments || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Customer Payments</h2>
        <div className="flex items-center gap-3">
          {showForm && (
            <span className="text-xs text-gray-500">F2: Customer | F9: Save</span>
          )}
          <button
            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded font-medium transition-colors ${
              showForm
                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            onClick={() => { setShowForm(!showForm); if (!showForm) resetForm(); }}
          >
            {showForm ? <ChevronUp size={14} /> : <Plus size={14} />}
            {showForm ? 'Hide Form' : 'New Payment'}
          </button>
        </div>
      </div>

      {/* ===== ENTRY FORM (collapsible) ===== */}
      {showForm && (
        <div className="border border-blue-200 rounded-lg bg-blue-50/30 p-3 space-y-3">
          <div className="grid grid-cols-12 gap-3">
            {/* Left: Form fields */}
            <div className="col-span-8 space-y-3">
              {/* Voucher Info Row */}
              <div className="bg-white p-3 rounded shadow-sm">
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">Date</label>
                    <input
                      type="date"
                      className="form-input w-full text-xs"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Payment Type</label>
                    <select
                      className="form-input w-full text-xs"
                      value={entryPaymentType}
                      onChange={(e) => setEntryPaymentType(e.target.value as any)}
                    >
                      <option value="ADVANCE">Advance Payment</option>
                      <option value="DUE_PAYMENT">Due Payment</option>
                      <option value="REFUND">Refund (Store → Customer)</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-600">Customer (F2)</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="form-input w-full text-xs"
                        placeholder="Search customer by name/mobile..."
                        value={customerData ? customerData.name : customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setCustomerId(null);
                          setCustomerData(null);
                        }}
                        onFocus={() => { if (customerData) { setCustomerSearch(customerData.name); setCustomerId(null); setCustomerData(null); } }}
                      />
                      {customers && customers.length > 0 && !customerId && customerSearch.length >= 2 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-lg max-h-48 overflow-auto">
                          {customers.map((c: any) => (
                            <div
                              key={c.id}
                              className="px-3 py-1.5 hover:bg-blue-50 cursor-pointer text-xs border-b"
                              onClick={() => {
                                setCustomerId(c.id);
                                setCustomerSearch('');
                              }}
                            >
                              <span className="font-medium">{c.name}</span>
                              {c.mobile && <span className="text-gray-400 ml-2">{c.mobile}</span>}
                              <span className={`float-right ${Number(c.closingBalance) > 0 ? 'text-red-600' : Number(c.closingBalance) < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                ₹{formatIndianNumber(Math.abs(Number(c.closingBalance || 0)))}
                                {Number(c.closingBalance) > 0 ? ' DR' : Number(c.closingBalance) < 0 ? ' CR' : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Info + Balance Card */}
              {customerData && (
                <div className="bg-white p-3 rounded shadow-sm">
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-gray-500">Customer:</span>
                      <span className="font-medium ml-1">{customerData.name}</span>
                      {customerData.mobile && <span className="text-gray-400 ml-2">({customerData.mobile})</span>}
                    </div>
                    <div>
                      <span className="text-gray-500">Current Balance:</span>
                      <span className={`font-bold ml-1 ${currentBalance > 0 ? 'text-red-600' : currentBalance < 0 ? 'text-green-600' : ''}`}>
                        ₹{formatIndianNumber(Math.abs(currentBalance))}
                        {currentBalance > 0 ? ' (Debit – Customer Owes)' : currentBalance < 0 ? ' (Credit – Advance)' : ' (No Dues)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">After Payment:</span>
                      <span className={`font-bold ml-1 ${balanceAfter > 0 ? 'text-red-600' : balanceAfter < 0 ? 'text-green-600' : ''}`}>
                        ₹{formatIndianNumber(Math.abs(balanceAfter))}
                        {balanceAfter > 0 ? ' DR' : balanceAfter < 0 ? ' CR' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Sources */}
              <div className="bg-white p-3 rounded shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Payment Sources</h3>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">Cash Amount</label>
                    <input
                      ref={cashRef}
                      type="number"
                      className="form-input w-full text-xs text-right"
                      value={cashAmount || ''}
                      onChange={(e) => setCashAmount(Number(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Bank Amount</label>
                    <input
                      type="number"
                      className="form-input w-full text-xs text-right"
                      value={bankAmount || ''}
                      onChange={(e) => setBankAmount(Number(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Card Amount</label>
                    <input
                      type="number"
                      className="form-input w-full text-xs text-right"
                      value={cardAmount || ''}
                      onChange={(e) => setCardAmount(Number(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">UPI Amount</label>
                    <input
                      type="number"
                      className="form-input w-full text-xs text-right"
                      value={upiAmount || ''}
                      onChange={(e) => setUpiAmount(Number(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                </div>

                {bankAmount > 0 && (
                  <div className="grid grid-cols-2 gap-3 mt-2 border-t pt-2">
                    <div>
                      <label className="text-xs text-gray-600">Bank Name</label>
                      <input
                        type="text"
                        className="form-input w-full text-xs"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="Enter bank name"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Cheque/Ref No</label>
                      <input
                        type="text"
                        className="form-input w-full text-xs"
                        value={chequeNo}
                        onChange={(e) => setChequeNo(e.target.value)}
                        placeholder="Cheque or reference number"
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-2 border-t flex justify-between items-center">
                  <div className="text-xs text-gray-500">
                    <input
                      type="text"
                      className="form-input w-full text-xs"
                      value={narration}
                      onChange={(e) => setNarration(e.target.value)}
                      placeholder="Narration / remarks"
                    />
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500 mr-2">Total Payment:</span>
                    <span className="text-lg font-bold text-green-700">₹{formatIndianNumber(totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Balance History */}
              {balanceHistory && balanceHistory.history && balanceHistory.history.length > 0 && (
                <div className="bg-white p-3 rounded shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Balance History</h3>
                  <div className="max-h-40 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left p-1.5">Date</th>
                          <th className="text-left p-1.5">Type</th>
                          <th className="text-left p-1.5">Voucher</th>
                          <th className="text-right p-1.5">Debit</th>
                          <th className="text-right p-1.5">Credit</th>
                          <th className="text-right p-1.5">Balance</th>
                          <th className="text-left p-1.5">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balanceHistory.history.map((h: any, i: number) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="p-1.5">{new Date(h.date).toLocaleDateString('en-IN')}</td>
                            <td className="p-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                h.type === 'SALE' ? 'bg-orange-100 text-orange-700' :
                                h.type === 'ADVANCE' ? 'bg-green-100 text-green-700' :
                                h.type === 'DUE_PAYMENT' ? 'bg-blue-100 text-blue-700' :
                                h.type === 'ADVANCE_USED' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {h.type.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="p-1.5 font-mono">{h.voucherNo}</td>
                            <td className="p-1.5 text-right text-red-600">{h.debit > 0 ? formatIndianNumber(h.debit) : ''}</td>
                            <td className="p-1.5 text-right text-green-600">{h.credit > 0 ? formatIndianNumber(h.credit) : ''}</td>
                            <td className={`p-1.5 text-right font-medium ${h.balance > 0 ? 'text-red-600' : h.balance < 0 ? 'text-green-600' : ''}`}>
                              {formatIndianNumber(Math.abs(h.balance))} {h.balance > 0 ? 'DR' : h.balance < 0 ? 'CR' : ''}
                            </td>
                            <td className="p-1.5 text-gray-500 truncate max-w-[200px]">{h.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Summary + Actions */}
            <div className="col-span-4 space-y-3">
              <div className="bg-white p-3 rounded shadow-sm text-xs space-y-2">
                <h3 className="font-semibold text-gray-700">Payment Summary</h3>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Type:</span>
                    <span className={`font-medium ${entryPaymentType === 'ADVANCE' ? 'text-green-700' : entryPaymentType === 'REFUND' ? 'text-red-700' : 'text-blue-700'}`}>
                      {entryPaymentType === 'ADVANCE' ? '⬤ Advance' : entryPaymentType === 'REFUND' ? '⬤ Refund (Out)' : '⬤ Due Payment'}
                    </span>
                  </div>
                  {customerData && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Customer:</span>
                        <span className="font-medium">{customerData.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Current Bal:</span>
                        <span className={`font-bold ${currentBalance > 0 ? 'text-red-600' : currentBalance < 0 ? 'text-green-600' : ''}`}>
                          ₹{formatIndianNumber(Math.abs(currentBalance))} {currentBalance > 0 ? 'DR' : currentBalance < 0 ? 'CR' : ''}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div className="border-t pt-2 space-y-1">
                  {cashAmount > 0 && (
                    <div className="flex justify-between">
                      <span>Cash:</span>
                      <span className="text-green-700">₹{formatIndianNumber(cashAmount)}</span>
                    </div>
                  )}
                  {bankAmount > 0 && (
                    <div className="flex justify-between">
                      <span>Bank:</span>
                      <span className="text-green-700">₹{formatIndianNumber(bankAmount)}</span>
                    </div>
                  )}
                  {cardAmount > 0 && (
                    <div className="flex justify-between">
                      <span>Card:</span>
                      <span className="text-green-700">₹{formatIndianNumber(cardAmount)}</span>
                    </div>
                  )}
                  {upiAmount > 0 && (
                    <div className="flex justify-between">
                      <span>UPI:</span>
                      <span className="text-green-700">₹{formatIndianNumber(upiAmount)}</span>
                    </div>
                  )}
                </div>
                <div className="border-t pt-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span>Total:</span>
                    <span className="text-green-700">₹{formatIndianNumber(totalAmount)}</span>
                  </div>
                  {customerData && (
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-500">Balance After:</span>
                      <span className={`font-bold ${balanceAfter > 0 ? 'text-red-600' : balanceAfter < 0 ? 'text-green-600' : ''}`}>
                        ₹{formatIndianNumber(Math.abs(balanceAfter))} {balanceAfter > 0 ? 'DR' : balanceAfter < 0 ? 'CR' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSave}
                  className="btn-success w-full"
                  disabled={saveMutation.isPending || !customerId || totalAmount <= 0}
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save Payment (F9)'}
                </button>
                <button onClick={resetForm} className="btn-outline w-full text-xs">
                  Clear Form
                </button>
              </div>

              {savedPaymentId && (
                <div className="bg-green-50 border border-green-200 p-3 rounded text-center text-xs">
                  <div className="text-green-700 font-bold">Payment Saved Successfully</div>
                  <div className="text-gray-500 mt-1">Payment ID: {savedPaymentId}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== FILTERS ===== */}
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
            <option value="REFUND">Refund (Out)</option>
            <option value="SALE">Sale Payment</option>
            <option value="LAYAWAY">Layaway Payment</option>
            <option value="SCHEME">Scheme Payment</option>
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
        <span className="ml-auto text-xs text-gray-500">{total} records</span>
      </div>

      {/* ===== TABLE ===== */}
      <div className="bg-white rounded shadow-sm overflow-hidden">
        <div className={`overflow-auto ${showForm ? 'max-h-[calc(100vh-680px)]' : 'max-h-[calc(100vh-220px)]'}`}>
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
                payments.map((p: any) => {
                  const isExpanded = p.isConsolidated && expandedSchemes.has(String(p.id));
                  return (
                  <Fragment key={p.id}>
                  <tr
                    data-testid={p.isConsolidated ? (p.source === 'SCHEME' ? `scheme-consolidated-${p.schemeId}` : `sale-consolidated-${p.id}`) : undefined}
                    onClick={p.isConsolidated ? () => toggleScheme(String(p.id)) : undefined}
                    className={`border-b hover:bg-gray-50 ${p.status === 'CANCELLED' ? 'opacity-50 bg-red-50' : ''} ${p.isConsolidated ? 'cursor-pointer bg-teal-50/40' : ''}`}
                  >
                    <td className="p-2 font-mono font-medium">
                      {p.isConsolidated && (
                        <span
                          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                          className="inline-block w-3 mr-1 text-gray-500"
                        >
                          {isExpanded ? '▾' : '▸'}
                        </span>
                      )}
                      {p.receiptNo}
                      {p.isConsolidated && p.schemeStatus && (
                        <span
                          className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            p.schemeStatus === 'REDEEMED'
                              ? 'bg-purple-100 text-purple-700'
                              : p.schemeStatus === 'CANCELLED'
                              ? 'bg-red-100 text-red-700'
                              : p.schemeStatus === 'MATURED'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {p.schemeStatus}
                        </span>
                      )}
                      {p.isConsolidated && (
                        <span className="ml-1 text-[10px] text-gray-500">
                          ({p.installmentCount} {p.consolidationLabel || 'inst.'})
                        </span>
                      )}
                    </td>
                    <td className="p-2">{new Date(p.paymentDate).toLocaleDateString('en-IN')}</td>
                    <td className="p-2">
                      <span className="font-medium">{p.account?.name}</span>
                      {p.account?.mobile && <span className="text-gray-400 ml-1">({p.account.mobile})</span>}
                    </td>
                    <td className="p-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        p.source === 'SALE' ? 'bg-orange-100 text-orange-700' :
                        p.source === 'LAYAWAY' ? 'bg-purple-100 text-purple-700' :
                        p.source === 'SCHEME' ? 'bg-teal-100 text-teal-700' :
                        p.paymentType === 'REFUND' ? 'bg-red-100 text-red-700' :
                        p.paymentType === 'ADVANCE' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {p.source === 'SALE' ? 'Sale' : p.source === 'LAYAWAY' ? 'Layaway' : p.source === 'SCHEME' ? 'Scheme' : p.paymentType === 'REFUND' ? 'Refund (Out)' : p.paymentType === 'ADVANCE' ? 'Advance' : 'Due Payment'}
                      </span>
                    </td>
                    <td className="p-2 text-right">{Number(p.cashAmount) > 0 ? formatIndianNumber(Number(p.cashAmount)) : '-'}</td>
                    <td className="p-2 text-right">{Number(p.bankAmount) > 0 ? formatIndianNumber(Number(p.bankAmount)) : '-'}</td>
                    <td className="p-2 text-right">{Number(p.cardAmount) > 0 ? formatIndianNumber(Number(p.cardAmount)) : '-'}</td>
                    <td className={`p-2 text-right font-bold ${p.paymentType === 'REFUND' ? 'text-red-700' : 'text-green-700'}`}>
                      {p.paymentType === 'REFUND' ? '−' : ''}{formatIndianNumber(Number(p.totalAmount))}
                    </td>
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
                      {p.status === 'ACTIVE' && p.source === 'PAYMENT' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setCancelId(p.id); }}
                          className="text-red-500 hover:text-red-700 font-bold"
                          title="Cancel payment"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && Array.isArray(p.children) && p.children.map((c: any) => (
                    <tr
                      key={`${p.id}-child-${c.id}`}
                      data-testid={p.source === 'SCHEME' ? `scheme-child-${p.schemeId}-${c.installmentNo}` : `sale-child-${p.id}-${c.id}`}
                      className="border-b bg-gray-50/60 text-gray-700"
                    >
                      <td className="p-2 pl-8 font-mono text-[11px]">
                        ┗ {c.childLabel || (c.installmentNo != null ? `#${c.installmentNo}` : c.receiptNo)}
                      </td>
                      <td className="p-2">{new Date(c.paymentDate).toLocaleDateString('en-IN')}</td>
                      <td className="p-2 text-gray-500 italic">{c.narration}</td>
                      <td className="p-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          c.source === 'LAYAWAY' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                        }`}>
                          {c.source === 'LAYAWAY' ? 'Layaway' : 'Installment'}
                        </span>
                      </td>
                      <td className="p-2 text-right">{Number(c.cashAmount) > 0 ? formatIndianNumber(Number(c.cashAmount)) : '-'}</td>
                      <td className="p-2 text-right">{Number(c.bankAmount) > 0 ? formatIndianNumber(Number(c.bankAmount)) : '-'}</td>
                      <td className="p-2 text-right">{Number(c.cardAmount) > 0 ? formatIndianNumber(Number(c.cardAmount)) : '-'}</td>
                      <td className="p-2 text-right text-green-700">{formatIndianNumber(Number(c.totalAmount))}</td>
                      <td className="p-2 text-right text-gray-400">-</td>
                      <td className="p-2 text-right text-gray-400">-</td>
                      <td className="p-2 text-center text-gray-400">-</td>
                      <td className="p-2"></td>
                    </tr>
                  ))}
                  </Fragment>
                  );
                })
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

      {/* Account Master Modal */}
      <AccountMasterModal
        open={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        onSaved={(account: any) => {
          setCustomerId(account.id);
          setShowCustomerModal(false);
        }}
      />
    </div>
  );
}
