import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchAPI } from '../../lib/api';
import { formatWeight, getToday } from '../../lib/utils';
import toast from 'react-hot-toast';

export default function BranchReceipt() {
  const queryClient = useQueryClient();
  const [receiptDate, setReceiptDate] = useState(getToday());
  const [transferNo, setTransferNo] = useState('');
  const [transferData, setTransferData] = useState<any>(null);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  const fetchTransfer = async () => {
    if (!transferNo.trim()) return;
    try {
      const res = await branchAPI.getByTransferNo(transferNo.trim());
      setTransferData(res.data);
      setCheckedItems(new Set(res.data.items?.map((_: any, i: number) => i) || []));
    } catch {
      toast.error('Transfer not found');
    }
  };

  const receiveMutation = useMutation({
    mutationFn: (data: any) => branchAPI.receiveTransfer(data),
    onSuccess: () => {
      toast.success('Branch receipt confirmed!');
      queryClient.invalidateQueries({ queryKey: ['branch-transfers'] });
      setTransferData(null);
      setTransferNo('');
    },
    onError: () => toast.error('Failed to receive'),
  });

  const toggleItem = (idx: number) => {
    const next = new Set(checkedItems);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setCheckedItems(next);
  };

  const handleReceive = () => {
    if (!transferData) return;
    receiveMutation.mutate({
      transferId: transferData.id,
      receiptDate,
      receivedItems: Array.from(checkedItems).map((idx) => ({
        itemId: transferData.items[idx].id,
      })),
    });
  };

  const items = transferData?.items || [];

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="panel">
        <div className="panel-header">Branch Receipt</div>
        <div className="panel-body flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Receipt Date</label>
            <input type="date" className="form-input" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
          </div>
          <div>
            <label className="form-label block text-xs">Transfer / Issue No</label>
            <div className="flex gap-1">
              <input
                className="form-input w-48"
                value={transferNo}
                onChange={(e) => setTransferNo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchTransfer()}
                placeholder="Enter transfer no..."
              />
              <button onClick={fetchTransfer} className="btn-primary text-xs">🔍 Fetch</button>
            </div>
          </div>
          {transferData && (
            <>
              <div className="text-sm">
                <span className="text-gray-500">From:</span>{' '}
                <span className="font-medium">{transferData.fromBranch?.name || 'Branch'}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">Date:</span>{' '}
                <span>{new Date(transferData.transferDate).toLocaleDateString('en-IN')}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8">✓</th>
              <th>Sr.</th>
              <th>Label No</th>
              <th>Item Name</th>
              <th className="text-right">Gross Wt</th>
              <th className="text-right">Net Wt</th>
              <th className="text-right">Pcs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={idx} className={checkedItems.has(idx) ? 'bg-green-50' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={checkedItems.has(idx)}
                    onChange={() => toggleItem(idx)}
                  />
                </td>
                <td>{idx + 1}</td>
                <td className="font-medium">{item.labelNo}</td>
                <td>{item.itemName}</td>
                <td className="text-right">{formatWeight(item.grossWeight)}</td>
                <td className="text-right">{formatWeight(item.netWeight)}</td>
                <td className="text-right">{item.pcs || 1}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${checkedItems.has(idx) ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {checkedItems.has(idx) ? 'Received' : 'Pending'}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Enter a transfer number to load items</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">
          {checkedItems.size} of {items.length} items checked for receipt
        </span>
        <div className="flex gap-2">
          <button onClick={handleReceive} className="btn-success" disabled={receiveMutation.isPending || !transferData}>
            ✅ Confirm Receipt
          </button>
          <button className="btn-primary">🖨️ Print</button>
        </div>
      </div>
    </div>
  );
}
