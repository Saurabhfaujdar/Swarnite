/**
 * SupplierOrderItemTable
 * ──────────────────────
 * Read-only display of ordered items with delivery progress.
 */

interface OrderItem {
  id: number;
  category: string;
  ornamentType?: string | null;
  metalType?: { name: string; code: string } | null;
  purity?: string | null;
  orderedQty: number;
  orderedGrossWeight: number;
  orderedNetWeight: number;
  expectedWastagePercent?: number;
  makingChargeType?: string | null;
  makingChargeValue?: number;
  designReference?: string | null;
  stoneDetails?: string | null;
  size?: string | null;
  remarks?: string | null;
}

interface Props {
  items: OrderItem[];
  receipts?: any[];
  showProgress?: boolean;
}

export default function SupplierOrderItemTable({ items, receipts, showProgress = false }: Props) {
  // Calculate received quantities per item
  const receivedByItem: Record<number, { qty: number; gross: number; net: number }> = {};
  if (showProgress && receipts) {
    for (const r of receipts) {
      for (const ri of (r.items || [])) {
        const key = ri.supplierOrderItemId || ri.supplierOrderItem?.id;
        if (!key) continue;
        if (!receivedByItem[key]) receivedByItem[key] = { qty: 0, gross: 0, net: 0 };
        receivedByItem[key].qty += Number(ri.receivedQty) || 0;
        receivedByItem[key].gross += Number(ri.receivedGrossWeight) || 0;
        receivedByItem[key].net += Number(ri.receivedNetWeight) || 0;
      }
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-gray-50 text-gray-600">
            <th className="text-left px-2 py-1.5">#</th>
            <th className="text-left px-2 py-1.5">Category / Type</th>
            <th className="text-left px-2 py-1.5">Metal</th>
            <th className="text-left px-2 py-1.5">Purity</th>
            <th className="text-right px-2 py-1.5">Qty</th>
            <th className="text-right px-2 py-1.5">Gross Wt</th>
            <th className="text-right px-2 py-1.5">Net Wt</th>
            <th className="text-right px-2 py-1.5">Wastage %</th>
            <th className="text-left px-2 py-1.5">Making</th>
            {showProgress && <th className="text-right px-2 py-1.5">Received</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const rcvd = receivedByItem[item.id];
            const pct = item.orderedNetWeight > 0 && rcvd
              ? Math.round((rcvd.net / item.orderedNetWeight) * 100)
              : 0;
            return (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-2 py-1.5 text-gray-400">{idx + 1}</td>
                <td className="px-2 py-1.5">
                  <span className="font-medium">{item.category}</span>
                  {item.ornamentType && <span className="text-gray-500 ml-1">/ {item.ornamentType}</span>}
                  {item.designReference && (
                    <span className="block text-[10px] text-gray-400">Ref: {item.designReference}</span>
                  )}
                </td>
                <td className="px-2 py-1.5">{item.metalType?.name || '—'}</td>
                <td className="px-2 py-1.5">{item.purity || '—'}</td>
                <td className="px-2 py-1.5 text-right">{item.orderedQty}</td>
                <td className="px-2 py-1.5 text-right">{Number(item.orderedGrossWeight).toFixed(2)}g</td>
                <td className="px-2 py-1.5 text-right">{Number(item.orderedNetWeight).toFixed(2)}g</td>
                <td className="px-2 py-1.5 text-right">{item.expectedWastagePercent || 0}%</td>
                <td className="px-2 py-1.5">
                  {item.makingChargeType && (
                    <span className="text-gray-600">
                      {item.makingChargeType === 'PER_GRAM' ? `₹${item.makingChargeValue}/g` : `₹${item.makingChargeValue} flat`}
                    </span>
                  )}
                </td>
                {showProgress && (
                  <td className="px-2 py-1.5 text-right">
                    {rcvd ? (
                      <span className={pct >= 95 ? 'text-green-600' : pct > 0 ? 'text-amber-600' : 'text-gray-400'}>
                        {rcvd.net.toFixed(2)}g ({pct}%)
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
