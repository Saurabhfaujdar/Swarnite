import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mastersAPI } from '../lib/api';
import { formatWeight, formatIndianNumber } from '../lib/utils';

export interface OldGoldData {
  grossWeight: number;
  lessWeight: number;
  netWeight: number;
  purityCode: string;
  purityPercent: number;
  fineWeight: number;
  metalRate: number;
  amount: number;
}

interface OldGoldPurchaseModalProps {
  currentAmount: number;
  onConfirm: (data: OldGoldData) => void;
  onClose: () => void;
}

export default function OldGoldPurchaseModal({ currentAmount, onConfirm, onClose }: OldGoldPurchaseModalProps) {
  const [grossWeight, setGrossWeight] = useState(0);
  const [lessWeight, setLessWeight] = useState(0);
  const [purityCode, setPurityCode] = useState('916');
  const [purityPercent, setPurityPercent] = useState(91.6);
  const [metalRate, setMetalRate] = useState(0);

  const { data: purities } = useQuery({
    queryKey: ['purities'],
    queryFn: () => mastersAPI.purities().then((r) => r.data),
  });

  const { data: rates } = useQuery({
    queryKey: ['latest-rates'],
    queryFn: () => mastersAPI.latestRates().then((r) => r.data),
  });

  // Auto-set metal rate from latest rates when purity changes
  const handlePurityChange = (code: string) => {
    const p = purities?.find((p: any) => p.code === code);
    setPurityCode(code);
    setPurityPercent(p ? Number(p.percentage) : 0);

    // Try to find matching gold rate
    const goldRate = rates?.find((r: any) => r.purityCode === code && r.metalType?.name === 'Gold');
    if (goldRate) setMetalRate(Number(goldRate.rate));
  };

  const netWeight = grossWeight - lessWeight;
  const fineWeight = (netWeight * purityPercent) / 100;
  const amount = Math.round(fineWeight * metalRate);

  const handleConfirm = () => {
    onConfirm({
      grossWeight,
      lessWeight,
      netWeight,
      purityCode,
      purityPercent,
      fineWeight,
      metalRate,
      amount,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="og-purchase-modal">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-50">
          <h2 className="text-lg font-semibold">Old Gold Purchase</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" data-testid="og-modal-close">&times;</button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Weight row */}
          <div className="flex gap-3 items-end">
            <div>
              <label className="form-label block text-xs">Gross Wt (g)</label>
              <input
                type="number"
                step="0.001"
                className="form-input w-28 text-right"
                value={grossWeight || ''}
                onChange={(e) => setGrossWeight(Number(e.target.value))}
                data-testid="og-gross-weight"
                autoFocus
              />
            </div>
            <div>
              <label className="form-label block text-xs">Less Wt (g)</label>
              <input
                type="number"
                step="0.001"
                className="form-input w-28 text-right"
                value={lessWeight || ''}
                onChange={(e) => setLessWeight(Number(e.target.value))}
                data-testid="og-less-weight"
              />
            </div>
            <div>
              <label className="form-label block text-xs">Net Wt (g)</label>
              <input
                className="form-input w-28 text-right bg-gray-100"
                value={formatWeight(netWeight)}
                readOnly
                data-testid="og-net-weight"
              />
            </div>
          </div>

          {/* Purity & Rate row */}
          <div className="flex gap-3 items-end">
            <div>
              <label className="form-label block text-xs">Purity</label>
              <select
                className="form-select w-32"
                value={purityCode}
                onChange={(e) => handlePurityChange(e.target.value)}
                data-testid="og-purity"
              >
                <option value="999">999 (99.9%)</option>
                <option value="916">916 (91.6%)</option>
                <option value="875">875 (87.5%)</option>
                <option value="750">750 (75.0%)</option>
                {purities?.filter((p: any) => !['999', '916', '875', '750'].includes(p.code)).map((p: any) => (
                  <option key={p.id} value={p.code}>
                    {p.code} ({p.percentage}%)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label block text-xs">Fine Wt (g)</label>
              <input
                className="form-input w-28 text-right bg-gray-100"
                value={formatWeight(fineWeight)}
                readOnly
                data-testid="og-fine-weight"
              />
            </div>
            <div>
              <label className="form-label block text-xs">Metal Rate (₹/g)</label>
              <input
                type="number"
                className="form-input w-28 text-right"
                value={metalRate || ''}
                onChange={(e) => setMetalRate(Number(e.target.value))}
                data-testid="og-metal-rate"
              />
            </div>
          </div>

          {/* Amount summary */}
          <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-gray-500">Old Gold Amount</div>
                <div className="text-xl font-bold text-amber-700" data-testid="og-amount">
                  ₹ {formatIndianNumber(amount)}
                </div>
              </div>
              <div className="text-xs text-gray-500 text-right">
                <div>{formatWeight(netWeight)} g net × {purityPercent}% = {formatWeight(fineWeight)} g fine</div>
                <div>{formatWeight(fineWeight)} g × ₹{formatIndianNumber(metalRate)} = ₹{formatIndianNumber(amount)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t bg-gray-50">
          <button
            onClick={handleConfirm}
            className="btn-success flex-1"
            disabled={amount <= 0}
            data-testid="og-confirm"
          >
            ✓ Apply ₹{formatIndianNumber(amount)} to Bill
          </button>
          {currentAmount > 0 && (
            <button
              onClick={() => onConfirm({ grossWeight: 0, lessWeight: 0, netWeight: 0, purityCode: '', purityPercent: 0, fineWeight: 0, metalRate: 0, amount: 0 })}
              className="btn-outline text-xs"
              data-testid="og-clear"
            >
              Clear OG
            </button>
          )}
          <button onClick={onClose} className="btn-outline">Cancel</button>
        </div>
      </div>
    </div>
  );
}
