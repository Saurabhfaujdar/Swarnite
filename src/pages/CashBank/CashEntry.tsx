import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cashBankAPI, accountsAPI } from '../../lib/api';
import { formatIndianNumber, getToday, getFinancialYear } from '../../lib/utils';
import toast from 'react-hot-toast';

interface EntryLine {
  accountId: number;
  accountName: string;
  amount: number;
  narration: string;
}

export default function CashEntry() {
  const queryClient = useQueryClient();
  const [voucherType, setVoucherType] = useState<'RECEIPT' | 'PAYMENT'>('RECEIPT');
  const [voucherDate, setVoucherDate] = useState(getToday());
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(0);
  const [amount, setAmount] = useState(0);
  const [narration, setNarration] = useState('');

  const { data: accounts } = useQuery({
    queryKey: ['accounts-cash-search', accountSearch],
    queryFn: () => accountsAPI.list({ search: accountSearch }).then((r) => r.data.accounts),
    enabled: accountSearch.length >= 2,
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => cashBankAPI.createCash(data),
    onSuccess: (res) => {
      toast.success(`Cash ${voucherType.toLowerCase()} saved!`);
      queryClient.invalidateQueries({ queryKey: ['cash-entries'] });
      resetForm();
    },
    onError: () => toast.error('Failed to save'),
  });

  const addLine = () => {
    if (!selectedAccountId) return toast.error('Select an account');
    if (!amount) return toast.error('Enter amount');

    const acc = accounts?.find((a: any) => a.id === selectedAccountId);
    setLines([...lines, {
      accountId: selectedAccountId,
      accountName: acc?.name || '',
      amount,
      narration,
    }]);
    setSelectedAccountId(0);
    setAccountSearch('');
    setAmount(0);
    setNarration('');
  };

  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));
  const totalAmount = lines.reduce((s, l) => s + l.amount, 0);

  const handleSave = () => {
    if (lines.length === 0) return toast.error('Add at least one entry');
    saveMutation.mutate({
      voucherType,
      voucherDate,
      financialYear: getFinancialYear(),
      branchId: 1,
      userId: 1,
      totalAmount,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        amount: l.amount,
        narration: l.narration,
      })),
    });
  };

  const resetForm = () => {
    setLines([]);
    setSelectedAccountId(0);
    setAccountSearch('');
    setAmount(0);
    setNarration('');
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <span>Cash {voucherType === 'RECEIPT' ? 'Receipt' : 'Payment'} Voucher</span>
          <div className="flex gap-2">
            <button
              onClick={() => setVoucherType('RECEIPT')}
              className={voucherType === 'RECEIPT' ? 'btn-success text-xs' : 'btn-outline text-xs'}
            >
              💰 Receipt
            </button>
            <button
              onClick={() => setVoucherType('PAYMENT')}
              className={voucherType === 'PAYMENT' ? 'btn-danger text-xs' : 'btn-outline text-xs'}
            >
              💸 Payment
            </button>
          </div>
        </div>
        <div className="panel-body flex gap-4 items-end">
          <div>
            <label className="form-label block text-xs">Date</label>
            <input type="date" className="form-input" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Add Entry */}
      <div className="panel">
        <div className="panel-header">Add Entry Line</div>
        <div className="panel-body flex gap-3 items-end flex-wrap">
          <div className="relative flex-1">
            <label className="form-label block text-xs">Account</label>
            <input
              className="form-input w-full"
              placeholder="Search account..."
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
            />
            {accounts && accounts.length > 0 && accountSearch.length >= 2 && (
              <div className="absolute bg-white border shadow-lg z-10 max-h-40 overflow-auto w-full top-full">
                {accounts.map((a: any) => (
                  <div
                    key={a.id}
                    className="px-3 py-1 hover:bg-blue-50 cursor-pointer text-sm"
                    onClick={() => {
                      setSelectedAccountId(a.id);
                      setAccountSearch(a.name);
                    }}
                  >
                    {a.name} <span className="text-gray-400">({a.type})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="form-label block text-xs">Amount</label>
            <input
              type="number"
              className="form-input w-32 text-right"
              value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div className="flex-1">
            <label className="form-label block text-xs">Narration</label>
            <input
              className="form-input w-full"
              placeholder="Description..."
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
            />
          </div>
          <button onClick={addLine} className="btn-primary">+ Add</button>
        </div>
      </div>

      {/* Lines Table */}
      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Account Name</th>
              <th className="text-right">Amount</th>
              <th>Narration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{line.accountName}</td>
                <td className="text-right font-medium">{formatIndianNumber(line.amount)}</td>
                <td>{line.narration || '-'}</td>
                <td>
                  <button onClick={() => removeLine(idx)} className="text-red-500 hover:text-red-700">✕</button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No entries added</td></tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td colSpan={2}>Total</td>
                <td className="text-right">{formatIndianNumber(totalAmount)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center">
        <div className="text-sm">
          <span className={`font-bold ${voucherType === 'RECEIPT' ? 'text-green-700' : 'text-red-700'}`}>
            {voucherType === 'RECEIPT' ? 'Total Receipt' : 'Total Payment'}: {formatIndianNumber(totalAmount)}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="btn-success" disabled={saveMutation.isPending}>💾 Save</button>
          <button className="btn-primary">🖨️ Print</button>
          <button onClick={resetForm} className="btn-outline">Clear</button>
        </div>
      </div>
    </div>
  );
}
