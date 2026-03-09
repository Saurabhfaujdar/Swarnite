import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerPaymentsAPI, accountsAPI } from '../../lib/api';
import { formatIndianNumber, getToday, getFinancialYear } from '../../lib/utils';
import toast from 'react-hot-toast';
import AccountMasterModal from '../../components/AccountMasterModal';

// ============================================================
// Customer Payment Entry – Record advance / due payments
// ============================================================
export default function CustomerPaymentEntry() {
  const queryClient = useQueryClient();
  const cashRef = useRef<HTMLInputElement>(null);

  // Form state
  const [paymentDate, setPaymentDate] = useState(getToday());
  const [paymentType, setPaymentType] = useState<'ADVANCE' | 'DUE_PAYMENT'>('ADVANCE');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [cashAmount, setCashAmount] = useState(0);
  const [bankAmount, setBankAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [bankName, setBankName] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [narration, setNarration] = useState('');
  const [reference, setReference] = useState('');
  const [savedPaymentId, setSavedPaymentId] = useState<number | null>(null);

  // Totals
  const totalAmount = cashAmount + bankAmount + cardAmount;
  const currentBalance = customerData ? Number(customerData.closingBalance || 0) : 0;
  const balanceAfter = currentBalance - totalAmount;

  // Customer search / fetch
  const { data: customers } = useQuery({
    queryKey: ['accounts', 'customer-search', customerSearch],
    queryFn: () => accountsAPI.list({ search: customerSearch, type: 'CUSTOMER', limit: 10 }),
    enabled: customerSearch.length >= 2,
    select: (res: any) => res.data?.accounts || [],
  });

  useEffect(() => {
    if (customerId) {
      accountsAPI.get(customerId).then((res: any) => setCustomerData(res.data));
    }
  }, [customerId]);

  // Balance history for selected customer
  const { data: balanceHistory } = useQuery({
    queryKey: ['balance-history', customerId],
    queryFn: () => customerPaymentsAPI.balanceHistory(customerId!),
    enabled: !!customerId,
    select: (res: any) => res.data,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: any) => customerPaymentsAPI.create(data),
    onSuccess: (res: any) => {
      toast.success(`Payment ${res.data.receiptNo} recorded successfully`);
      setSavedPaymentId(res.data.id);
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
      queryClient.invalidateQueries({ queryKey: ['balance-history', customerId] });
      // Update customer data locally
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
      paymentType,
      accountId: customerId,
      cashAmount,
      bankAmount,
      cardAmount,
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
      if (e.key === 'F9') { e.preventDefault(); handleSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Customer Payment Entry</h2>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>F2: Customer</span>
          <span>F9: Save</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* Left: Form */}
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
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as any)}
                >
                  <option value="ADVANCE">Advance Payment</option>
                  <option value="DUE_PAYMENT">Due Payment</option>
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

          {/* Payment Details */}
          <div className="bg-white p-3 rounded shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Payment Sources</h3>
            <div className="grid grid-cols-3 gap-3">
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
            </div>

            {/* Bank details if bank amount entered */}
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

            {/* Total */}
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

          {/* Balance History Timeline */}
          {balanceHistory && balanceHistory.history && balanceHistory.history.length > 0 && (
            <div className="bg-white p-3 rounded shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Balance History</h3>
              <div className="max-h-60 overflow-auto">
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
                <span className={`font-medium ${paymentType === 'ADVANCE' ? 'text-green-700' : 'text-blue-700'}`}>
                  {paymentType === 'ADVANCE' ? '⬤ Advance' : '⬤ Due Payment'}
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

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSave}
              className="btn-success w-full"
              disabled={saveMutation.isPending || !customerId || totalAmount <= 0}
            >
              💾 {saveMutation.isPending ? 'Saving...' : 'Save Payment (F9)'}
            </button>
            <button
              onClick={() => { resetForm(); }}
              className="btn-danger w-full"
            >
              ✕ New / Clear
            </button>
          </div>

          {savedPaymentId && (
            <div className="bg-green-50 border border-green-200 p-3 rounded text-center text-xs">
              <div className="text-green-700 font-bold">✓ Payment Saved Successfully</div>
              <div className="text-gray-500 mt-1">Payment ID: {savedPaymentId}</div>
            </div>
          )}
        </div>
      </div>

      {/* Account Master Modal */}
      {showCustomerModal && (
        <AccountMasterModal
          onClose={() => setShowCustomerModal(false)}
          onSelect={(id: number) => {
            setCustomerId(id);
            setShowCustomerModal(false);
          }}
        />
      )}
    </div>
  );
}
