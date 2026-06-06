/**
 * SupplierLedgerView
 * ──────────────────
 * Shows metal and money balance for a supplier.
 */
import { Scale, IndianRupee } from 'lucide-react';

interface MetalBalance {
  metalTypeId: number;
  metalType?: { name: string; code: string };
  balance: number;
}

interface Props {
  balance: {
    metalBalance?: MetalBalance[];
    moneyBalance?: number;
  } | null;
}

export default function SupplierLedgerView({ balance }: Props) {
  if (!balance) return null;

  const metalEntries = balance.metalBalance || [];
  const money = balance.moneyBalance ?? 0;

  return (
    <div className="space-y-3">
      {/* Money Balance */}
      <div className="flex items-center gap-2 p-2 rounded bg-gray-50">
        <IndianRupee size={14} className="text-gray-500" />
        <span className="text-xs text-gray-600">Money Balance:</span>
        <span className={`text-xs font-semibold ${money < 0 ? 'text-red-600' : money > 0 ? 'text-green-600' : 'text-gray-600'}`}>
          ₹{Math.abs(money).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          {money < 0 ? ' (Payable)' : money > 0 ? ' (Receivable)' : ''}
        </span>
      </div>

      {/* Metal Balance */}
      {metalEntries.length > 0 && (
        <div className="p-2 rounded bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            <Scale size={14} className="text-gray-500" />
            <span className="text-xs text-gray-600">Metal Balance:</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {metalEntries.map((m, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs px-2 py-1 rounded border border-gray-200">
                <span className="text-gray-600">{m.metalType?.name || `Metal #${m.metalTypeId}`}</span>
                <span className={`font-medium ${Number(m.balance) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {Number(m.balance).toFixed(3)}g
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
