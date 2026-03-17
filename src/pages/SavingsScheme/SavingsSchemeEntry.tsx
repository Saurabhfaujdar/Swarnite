import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savingsSchemeAPI, accountsAPI } from '../../lib/api';
import { formatIndianNumber, formatDate, getToday, getFinancialYear } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function SavingsSchemeEntry() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // Form state
  const [accountId, setAccountId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [schemeName, setSchemeName] = useState('Gold Savings Scheme');
  const [startDate, setStartDate] = useState(getToday());
  const [durationMonths, setDurationMonths] = useState(11);
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [bonusMonths, setBonusMonths] = useState(1);
  const [narration, setNarration] = useState('');
  const [reference, setReference] = useState('');

  // Customer search
  const { data: customers } = useQuery({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => accountsAPI.list({ search: customerSearch, type: 'CUSTOMER' }).then((r) => r.data),
    enabled: customerSearch.length >= 2,
  });

  const selectedCustomer = customers?.find((c: any) => c.id === accountId);

  // Computed values
  const monthly = Number(monthlyAmount) || 0;
  const totalSchemeAmount = durationMonths * monthly;
  const bonusAmount = bonusMonths * monthly;
  const maturityValue = totalSchemeAmount + bonusAmount;

  // Maturity date
  const maturityDate = (() => {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + durationMonths);
    return d.toISOString().split('T')[0];
  })();

  const createMutation = useMutation({
    mutationFn: (data: any) => savingsSchemeAPI.create(data),
    onSuccess: (res) => {
      toast.success(`Savings Scheme ${res.data.schemeNo} created successfully!`);
      queryClient.invalidateQueries({ queryKey: ['savings-schemes'] });
      navigate('/savings-scheme/list');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to create scheme'),
  });

  const handleSubmit = () => {
    if (!accountId) return toast.error('Please select a customer');
    if (!monthly || monthly <= 0) return toast.error('Please enter monthly amount');
    if (!durationMonths || durationMonths <= 0) return toast.error('Please enter duration');

    createMutation.mutate({
      accountId,
      schemeName,
      startDate,
      durationMonths,
      monthlyAmount: monthly,
      bonusMonths,
      narration: narration || undefined,
      reference: reference || undefined,
      branchId: user?.branchId,
      financialYear: getFinancialYear(),
    });
  };

  const handleReset = () => {
    setAccountId(null);
    setCustomerSearch('');
    setSchemeName('Gold Savings Scheme');
    setStartDate(getToday());
    setDurationMonths(11);
    setMonthlyAmount('');
    setBonusMonths(1);
    setNarration('');
    setReference('');
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <span>New Savings Scheme</span>
          <div className="flex gap-2">
            <button onClick={() => navigate('/savings-scheme/list')} className="btn-primary text-xs">View All Schemes</button>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="panel">
        <div className="panel-body">
          <div className="grid grid-cols-4 gap-4">
            {/* Customer Selection */}
            <div className="col-span-2">
              <label className="form-label block text-xs">Customer *</label>
              <div className="relative">
                <input
                  className="form-input w-full"
                  placeholder="Search customer by name or mobile..."
                  value={accountId ? selectedCustomer?.name || '' : customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setAccountId(null);
                  }}
                />
                {customerSearch.length >= 2 && !accountId && customers && customers.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
                    {customers.map((c: any) => (
                      <div
                        key={c.id}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-xs"
                        onClick={() => {
                          setAccountId(c.id);
                          setCustomerSearch('');
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.mobile && <span className="text-gray-400 ml-2">{c.mobile}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Scheme Name */}
            <div>
              <label className="form-label block text-xs">Scheme Name</label>
              <select className="form-select w-full" value={schemeName} onChange={(e) => setSchemeName(e.target.value)}>
                <option>Gold Savings Scheme</option>
                <option>Diamond Savings Scheme</option>
                <option>Silver Savings Scheme</option>
                <option>Custom Scheme</option>
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="form-label block text-xs">Start Date</label>
              <input type="date" className="form-input w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            {/* Duration */}
            <div>
              <label className="form-label block text-xs">Duration (Months) *</label>
              <input
                type="number"
                className="form-input w-full"
                value={durationMonths}
                min={1}
                max={36}
                onChange={(e) => setDurationMonths(Number(e.target.value))}
              />
            </div>

            {/* Monthly Amount */}
            <div>
              <label className="form-label block text-xs">Monthly Amount (₹) *</label>
              <input
                type="number"
                className="form-input w-full"
                placeholder="e.g. 5000"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(e.target.value)}
              />
            </div>

            {/* Bonus Months */}
            <div>
              <label className="form-label block text-xs">Bonus Months (by Shop)</label>
              <input
                type="number"
                className="form-input w-full"
                value={bonusMonths}
                min={0}
                max={12}
                onChange={(e) => setBonusMonths(Number(e.target.value))}
              />
            </div>

            {/* Maturity Date */}
            <div>
              <label className="form-label block text-xs">Maturity Date</label>
              <input type="date" className="form-input w-full bg-gray-50" value={maturityDate} readOnly />
            </div>

            {/* Reference */}
            <div>
              <label className="form-label block text-xs">Reference</label>
              <input className="form-input w-full" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>

            {/* Narration */}
            <div className="col-span-3">
              <label className="form-label block text-xs">Narration</label>
              <input className="form-input w-full" value={narration} onChange={(e) => setNarration(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="panel">
        <div className="panel-header">Scheme Summary</div>
        <div className="panel-body">
          <div className="grid grid-cols-5 gap-4 text-sm">
            <div className="bg-blue-50 p-3 rounded text-center">
              <div className="text-xs text-gray-500">Monthly Amount</div>
              <div className="font-bold text-blue-700">₹ {formatIndianNumber(monthly)}</div>
            </div>
            <div className="bg-green-50 p-3 rounded text-center">
              <div className="text-xs text-gray-500">Total Installments</div>
              <div className="font-bold text-green-700">{durationMonths} months</div>
            </div>
            <div className="bg-yellow-50 p-3 rounded text-center">
              <div className="text-xs text-gray-500">Customer Pays</div>
              <div className="font-bold text-yellow-700">₹ {formatIndianNumber(totalSchemeAmount)}</div>
            </div>
            <div className="bg-purple-50 p-3 rounded text-center">
              <div className="text-xs text-gray-500">Shop Bonus ({bonusMonths} months)</div>
              <div className="font-bold text-purple-700">₹ {formatIndianNumber(bonusAmount)}</div>
            </div>
            <div className="bg-emerald-50 p-3 rounded text-center">
              <div className="text-xs text-gray-500">Maturity Value</div>
              <div className="font-bold text-emerald-700 text-lg">₹ {formatIndianNumber(maturityValue)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="panel">
        <div className="panel-body py-2 px-4 flex justify-end gap-2">
          <button onClick={handleReset} className="btn-secondary text-xs">Reset</button>
          <button
            onClick={handleSubmit}
            className="btn-success text-xs"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Scheme'}
          </button>
        </div>
      </div>
    </div>
  );
}
