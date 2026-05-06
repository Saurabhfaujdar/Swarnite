import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../lib/cartStore';
import { formatWeight } from '../lib/utils';

interface CartDrawerProps {
  onClose: () => void;
}

export default function CartDrawer({ onClose }: CartDrawerProps) {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);

  const totalGross = items.reduce((s, i) => s + i.grossWeight, 0);
  const totalNet = items.reduce((s, i) => s + i.netWeight, 0);
  const totalPcs = items.reduce((s, i) => s + i.pcsCount, 0);

  const handleProceed = (target: 'layaway' | 'sale') => {
    const cartLabels = items.map((item) => ({
      id: item.id,
      labelNo: item.labelNo,
      itemId: item.itemId,
      itemName: item.itemName,
      grossWeight: item.grossWeight,
      netWeight: item.netWeight,
      pcsCount: item.pcsCount,
      originalPcsCount: item.originalPcsCount ?? item.pcsCount,
      originalGrossWeight: item.originalGrossWeight ?? item.grossWeight,
      originalNetWeight: item.originalNetWeight ?? item.netWeight,
      perPcGross: item.perPcGross,
      perPcNet: item.perPcNet,
      metalType: item.metalType,
      purityCode: item.purityCode,
      purityPercentage: item.purityPercentage,
      labourRate: item.labourRate,
    }));

    clear();
    onClose();

    if (target === 'layaway') {
      navigate('/layaway', { state: { cartItems: cartLabels } });
    } else {
      navigate('/sales/retail', { state: { cartItems: cartLabels } });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="cart-drawer">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer panel */}
      <div className="relative bg-white w-full max-w-md shadow-xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <h2 className="text-lg font-semibold">🛒 Cart ({items.length} items)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" data-testid="cart-close">&times;</button>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-auto p-4">
          {items.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Cart is empty</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const isPartial =
                  item.originalPcsCount != null && item.originalPcsCount > item.pcsCount;
                return (
                  <div
                    key={item.id}
                    className="border rounded-lg p-3 flex justify-between items-start"
                    data-testid={`cart-item-${item.id}`}
                  >
                    <div>
                      <div className="font-medium text-sm">{item.labelNo}</div>
                      <div className="text-xs text-gray-600">{item.itemName}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.metalType} {item.purityCode && `• ${item.purityCode}`} • Gross:{' '}
                        {formatWeight(item.grossWeight)} • Net: {formatWeight(item.netWeight)} •{' '}
                        {item.pcsCount} pc{item.pcsCount > 1 ? 's' : ''}
                      </div>
                      {isPartial && (
                        <div
                          className="text-[11px] text-amber-700 mt-1"
                          data-testid={`cart-partial-${item.id}`}
                        >
                          Partial pick from {item.originalPcsCount} pcs (label total Gross{' '}
                          {formatWeight(item.originalGrossWeight ?? 0)}). Remaining on label after sale:{' '}
                          {(item.originalPcsCount ?? 0) - item.pcsCount} pc(s) • Gross{' '}
                          {formatWeight((item.originalGrossWeight ?? 0) - item.grossWeight)} • Net{' '}
                          {formatWeight((item.originalNetWeight ?? 0) - item.netWeight)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-red-400 hover:text-red-600 text-sm ml-2"
                      data-testid={`cart-remove-${item.id}`}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary & Actions */}
        {items.length > 0 && (
          <div className="border-t p-4 space-y-3 bg-gray-50">
            <div className="text-sm text-gray-600 flex justify-between">
              <span>Total: {items.length} items, {totalPcs} pcs</span>
              <span>Gross: {formatWeight(totalGross)} | Net: {formatWeight(totalNet)}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleProceed('layaway')}
                className="btn-outline flex-1 text-sm"
                data-testid="cart-to-layaway"
              >
                📋 Layaway
              </button>
              <button
                onClick={() => handleProceed('sale')}
                className="btn-primary flex-1 text-sm"
                data-testid="cart-to-sale"
              >
                💰 Sale
              </button>
            </div>
            <button
              onClick={clear}
              className="text-xs text-red-500 hover:text-red-700 w-full text-center"
              data-testid="cart-clear"
            >
              Clear Cart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
