import { useEffect, useState } from 'react';
import { formatWeight } from '../lib/utils';

export interface PartialPickResult {
  selectedPcs: number;
  selectedGrossWeight: number;
  selectedNetWeight: number;
  perPcGross: number[];
  perPcNet: number[];
}

interface Props {
  labelNo: string;
  itemName: string;
  totalPcs: number;
  totalGrossWeight: number;
  totalNetWeight: number;
  onConfirm: (result: PartialPickResult) => void;
  onClose: () => void;
}

/**
 * Modal shown when adding a multi-pc label to the cart so the user can:
 *  - choose how many pieces from the label to put in cart
 *  - override per-piece gross & net weights (defaults to an even split of the
 *    label's totals)
 *
 * The cart entry stores the SELECTED pcs + summed weights as the effective
 * values for the sale; the remaining label weight after the sale equals
 * original_total - selected_total (computed live in the modal for preview,
 * applied server-side when the sale completes).
 */
export default function AddToCartPartialModal({
  labelNo,
  itemName,
  totalPcs,
  totalGrossWeight,
  totalNetWeight,
  onConfirm,
  onClose,
}: Props) {
  const defaultPerPcGross = totalPcs > 0 ? totalGrossWeight / totalPcs : 0;
  const defaultPerPcNet = totalPcs > 0 ? totalNetWeight / totalPcs : 0;

  const [selectedPcs, setSelectedPcs] = useState(1);
  const [rows, setRows] = useState<{ gross: number; net: number }[]>([
    { gross: defaultPerPcGross, net: defaultPerPcNet },
  ]);

  // Sync row count to selectedPcs.
  useEffect(() => {
    setRows((prev) => {
      const next = [...prev];
      while (next.length < selectedPcs) {
        next.push({ gross: defaultPerPcGross, net: defaultPerPcNet });
      }
      next.length = selectedPcs;
      return next;
    });
  }, [selectedPcs, defaultPerPcGross, defaultPerPcNet]);

  // Esc closes.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const sumGross = rows.reduce((s, r) => s + (Number(r.gross) || 0), 0);
  const sumNet = rows.reduce((s, r) => s + (Number(r.net) || 0), 0);
  const remGross = totalGrossWeight - sumGross;
  const remNet = totalNetWeight - sumNet;

  const errors: string[] = [];
  if (selectedPcs < 1) errors.push('Select at least 1 piece');
  if (selectedPcs > totalPcs) errors.push(`Only ${totalPcs} piece(s) available`);
  if (sumGross <= 0) errors.push('Gross weight must be greater than 0');
  if (sumGross > totalGrossWeight + 1e-6) errors.push('Selected gross exceeds label gross');
  if (sumNet > sumGross + 1e-6) errors.push('Net weight cannot exceed gross weight');
  if (sumNet > totalNetWeight + 1e-6) errors.push('Selected net exceeds label net');
  rows.forEach((r, i) => {
    if ((Number(r.net) || 0) > (Number(r.gross) || 0) + 1e-6) {
      errors.push(`Pc #${i + 1}: net cannot exceed gross`);
    }
  });
  const valid = errors.length === 0;

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm({
      selectedPcs,
      selectedGrossWeight: sumGross,
      selectedNetWeight: sumNet,
      perPcGross: rows.map((r) => Number(r.gross) || 0),
      perPcNet: rows.map((r) => Number(r.net) || 0),
    });
  };

  const updateRow = (idx: number, field: 'gross' | 'net', value: number) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      data-testid="partial-pick-modal"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[640px] max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <div className="font-semibold">Add to Cart — {labelNo}</div>
            <div className="text-xs text-gray-500">{itemName}</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-500">Available pcs</div>
              <div className="font-semibold">{totalPcs}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-500">Total gross</div>
              <div className="font-semibold">{formatWeight(totalGrossWeight)}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-500">Total net</div>
              <div className="font-semibold">{formatWeight(totalNetWeight)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="form-label text-sm">Pieces to add</label>
            <input
              type="number"
              min={1}
              max={totalPcs}
              className="form-input w-20 text-right"
              value={selectedPcs}
              onChange={(e) => setSelectedPcs(Math.max(1, Math.min(totalPcs, Number(e.target.value) || 1)))}
              data-testid="selected-pcs-input"
            />
            <span className="text-xs text-gray-500">of {totalPcs}</span>
          </div>

          <div className="border rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-1 w-12">Pc</th>
                  <th className="text-right px-2 py-1">Gross Wt (gm)</th>
                  <th className="text-right px-2 py-1">Net Wt (gm)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-2 py-1">#{idx + 1}</td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        step="0.001"
                        min={0}
                        className="form-input w-28 text-right"
                        value={r.gross}
                        onChange={(e) => updateRow(idx, 'gross', Number(e.target.value))}
                        data-testid={`pc-gross-${idx}`}
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        step="0.001"
                        min={0}
                        className="form-input w-28 text-right"
                        value={r.net}
                        onChange={(e) => updateRow(idx, 'net', Number(e.target.value))}
                        data-testid={`pc-net-${idx}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr className="border-t">
                  <td className="px-2 py-1">Total</td>
                  <td className="px-2 py-1 text-right" data-testid="sum-gross">{formatWeight(sumGross)}</td>
                  <td className="px-2 py-1 text-right" data-testid="sum-net">{formatWeight(sumNet)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-blue-50 rounded p-2">
              <div className="text-xs text-blue-700">Adding to cart</div>
              <div className="font-semibold">
                {selectedPcs} pc(s) · Gross {formatWeight(sumGross)} · Net {formatWeight(sumNet)}
              </div>
            </div>
            <div className="bg-amber-50 rounded p-2" data-testid="remaining-summary">
              <div className="text-xs text-amber-700">Remaining on label after sale</div>
              <div className="font-semibold">
                {totalPcs - selectedPcs} pc(s) · Gross {formatWeight(remGross)} · Net {formatWeight(remNet)}
              </div>
            </div>
          </div>

          {errors.length > 0 && (
            <ul className="text-sm text-red-600 list-disc pl-5" data-testid="errors">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline">Cancel</button>
          <button onClick={handleConfirm} disabled={!valid} className="btn-success" data-testid="confirm-add">
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
