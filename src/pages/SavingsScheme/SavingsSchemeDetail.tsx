import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savingsSchemeAPI } from '../../lib/api';
import { formatIndianNumber, formatDate } from '../../lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function SavingsSchemeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Payment form state
  const [payInstNo, setPayInstNo] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Cash');
  const [payRef, setPayRef] = useState('');

  const { data: scheme, isLoading } = useQuery({
    queryKey: ['savings-scheme', id],
    queryFn: () => savingsSchemeAPI.get(Number(id)).then((r) => r.data),
    enabled: !!id,
  });

  const payMutation = useMutation({
    mutationFn: (data: any) => savingsSchemeAPI.payInstallment(Number(id), data),
    onSuccess: (res) => {
      toast.success('Installment paid successfully!');
      queryClient.invalidateQueries({ queryKey: ['savings-scheme', id] });
      queryClient.invalidateQueries({ queryKey: ['savings-schemes'] });
      setPayInstNo(null);
      setPayAmount('');
      setPayRef('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to pay installment'),
  });

  const markMissedMutation = useMutation({
    mutationFn: () => savingsSchemeAPI.markMissed(Number(id)),
    onSuccess: (res) => {
      toast.success(res.data.message);
      queryClient.invalidateQueries({ queryKey: ['savings-scheme', id] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed'),
  });

  const redeemMutation = useMutation({
    mutationFn: () => savingsSchemeAPI.redeem(Number(id)),
    onSuccess: () => {
      toast.success('Scheme redeemed! Maturity value credited to customer account.');
      queryClient.invalidateQueries({ queryKey: ['savings-scheme', id] });
      queryClient.invalidateQueries({ queryKey: ['savings-schemes'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to redeem'),
  });

  const handlePay = () => {
    if (!payInstNo) return toast.error('Select an installment');
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return toast.error('Enter payment amount');

    payMutation.mutate({
      installmentNo: payInstNo,
      amount,
      paymentMode: payMode,
      reference: payRef || undefined,
    });
  };

  const handleRedeem = () => {
    if (!confirm('Redeem this scheme? Maturity value will be credited as advance to customer account.')) return;
    redeemMutation.mutate();
  };

  if (isLoading) return <div className="p-4">Loading...</div>;
  if (!scheme) return <div className="p-4">Scheme not found</div>;

  const installments = scheme.installments || [];
  const paidCount = installments.filter((i: any) => i.status === 'PAID').length;
  const missedCount = installments.filter((i: any) => i.status === 'MISSED').length;
  const pendingCount = installments.filter((i: any) => i.status === 'PENDING').length;

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ACTIVE: 'bg-green-100 text-green-800',
      MATURED: 'bg-blue-100 text-blue-800',
      REDEEMED: 'bg-purple-100 text-purple-800',
      CANCELLED: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getInstStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PAID: 'bg-green-100 text-green-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      MISSED: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>Savings Scheme Detail - {scheme.schemeNo}</span>
            <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(scheme.status)}`}>
              {scheme.status}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/savings-scheme/list')} className="btn-primary text-xs">Back to List</button>
            {scheme.status === 'ACTIVE' && (
              <button onClick={() => markMissedMutation.mutate()} className="btn-secondary text-xs">
                Mark Missed
              </button>
            )}
            {scheme.status === 'MATURED' && (
              <button onClick={handleRedeem} className="btn-success text-xs" disabled={redeemMutation.isPending}>
                Redeem Scheme
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scheme Info */}
      <div className="panel">
        <div className="panel-body">
          <div className="grid grid-cols-6 gap-3 text-xs">
            <div>
              <div className="text-gray-500">Customer</div>
              <div className="font-medium">{scheme.account?.name}</div>
            </div>
            <div>
              <div className="text-gray-500">Scheme Name</div>
              <div className="font-medium">{scheme.schemeName}</div>
            </div>
            <div>
              <div className="text-gray-500">Start Date</div>
              <div className="font-medium">{formatDate(scheme.startDate)}</div>
            </div>
            <div>
              <div className="text-gray-500">Maturity Date</div>
              <div className="font-medium">{formatDate(scheme.maturityDate)}</div>
            </div>
            <div>
              <div className="text-gray-500">Duration</div>
              <div className="font-medium">{scheme.durationMonths} months</div>
            </div>
            <div>
              <div className="text-gray-500">Monthly Amount</div>
              <div className="font-medium">₹ {formatIndianNumber(scheme.monthlyAmount)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Summary */}
      <div className="panel">
        <div className="panel-body">
          <div className="grid grid-cols-6 gap-3 text-sm">
            <div className="bg-green-50 p-3 rounded text-center">
              <div className="text-xs text-gray-500">Paid</div>
              <div className="font-bold text-green-700">{paidCount} / {scheme.durationMonths}</div>
            </div>
            <div className="bg-yellow-50 p-3 rounded text-center">
              <div className="text-xs text-gray-500">Pending</div>
              <div className="font-bold text-yellow-700">{pendingCount}</div>
            </div>
            <div className="bg-red-50 p-3 rounded text-center">
              <div className="text-xs text-gray-500">Missed</div>
              <div className="font-bold text-red-700">{missedCount}</div>
            </div>
            <div className="bg-blue-50 p-3 rounded text-center">
              <div className="text-xs text-gray-500">Total Paid</div>
              <div className="font-bold text-blue-700">₹ {formatIndianNumber(scheme.totalPaidAmount)}</div>
            </div>
            <div className="bg-purple-50 p-3 rounded text-center">
              <div className="text-xs text-gray-500">Bonus ({scheme.bonusMonths} mo)</div>
              <div className="font-bold text-purple-700">₹ {formatIndianNumber(scheme.bonusAmount)}</div>
            </div>
            <div className="bg-emerald-50 p-3 rounded text-center">
              <div className="text-xs text-gray-500">Maturity Value</div>
              <div className="font-bold text-emerald-700">₹ {formatIndianNumber(scheme.maturityValue)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-1 overflow-hidden">
        {/* Installments Table */}
        <div className="panel flex-1 overflow-auto">
          <div className="panel-header">Installments</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Due Date</th>
                <th>Paid Date</th>
                <th className="text-right">Amount</th>
                <th>Mode</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {installments.map((inst: any) => (
                <tr key={inst.id} className={payInstNo === inst.installmentNo ? 'bg-blue-50' : ''}>
                  <td>{inst.installmentNo}</td>
                  <td>{formatDate(inst.dueDate)}</td>
                  <td>{inst.paidDate ? formatDate(inst.paidDate) : '-'}</td>
                  <td className="text-right">{inst.status === 'PAID' ? formatIndianNumber(inst.amount) : '-'}</td>
                  <td>{inst.paymentMode || '-'}</td>
                  <td>{inst.reference || '-'}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs ${getInstStatusBadge(inst.status)}`}>
                      {inst.status}
                    </span>
                  </td>
                  <td>
                    {(inst.status === 'PENDING' || inst.status === 'MISSED') && scheme.status === 'ACTIVE' && (
                      <button
                        className="text-blue-600 hover:underline text-xs"
                        onClick={() => {
                          setPayInstNo(inst.installmentNo);
                          setPayAmount(String(scheme.monthlyAmount));
                        }}
                      >
                        Pay
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment Form (side panel) */}
        {payInstNo && scheme.status === 'ACTIVE' && (
          <div className="panel w-72 flex-shrink-0">
            <div className="panel-header">Pay Installment #{payInstNo}</div>
            <div className="panel-body flex flex-col gap-3">
              <div>
                <label className="form-label block text-xs">Amount (₹)</label>
                <input
                  type="number"
                  className="form-input w-full"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label block text-xs">Payment Mode</label>
                <select className="form-select w-full" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                  <option>Cash</option>
                  <option>Bank</option>
                  <option>Card</option>
                  <option>UPI</option>
                </select>
              </div>
              <div>
                <label className="form-label block text-xs">Reference</label>
                <input className="form-input w-full" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPayInstNo(null)} className="btn-secondary text-xs flex-1">Cancel</button>
                <button
                  onClick={handlePay}
                  className="btn-success text-xs flex-1"
                  disabled={payMutation.isPending}
                >
                  {payMutation.isPending ? 'Paying...' : 'Pay'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
