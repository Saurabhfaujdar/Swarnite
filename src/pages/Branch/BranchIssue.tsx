import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchAPI, inventoryAPI, mastersAPI } from '../../lib/api';
import { formatWeight, getToday, getFinancialYear } from '../../lib/utils';
import toast from 'react-hot-toast';

interface TransferItem {
  labelNo: string;
  labelId?: number;
  itemName: string;
  grossWeight: number;
  netWeight: number;
  pcs: number;
}

export default function BranchIssue() {
  const queryClient = useQueryClient();
  const [issueDate, setIssueDate] = useState(getToday());
  const [toBranchId, setToBranchId] = useState<number>(0);
  const [labelNo, setLabelNo] = useState('');
  const [items, setItems] = useState<TransferItem[]>([]);
  const [remarks, setRemarks] = useState('');

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => mastersAPI.branches?.().then((r: any) => r.data) || Promise.resolve([]),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => branchAPI.createIssue(data),
    onSuccess: (res) => {
      toast.success(`Branch issue ${res.data.transferNo} created!`);
      queryClient.invalidateQueries({ queryKey: ['branch-transfers'] });
      setItems([]);
    },
    onError: () => toast.error('Failed to save'),
  });

  const handleLabelScan = async () => {
    if (!labelNo.trim()) return;
    try {
      const res = await inventoryAPI.searchLabel(labelNo.trim());
      const label = res.data;
      if (items.find((i) => i.labelNo === label.labelNo)) {
        toast.error('Already added');
        return;
      }
      setItems([...items, {
        labelNo: label.labelNo,
        labelId: label.id,
        itemName: label.item?.name || '',
        grossWeight: Number(label.grossWeight),
        netWeight: Number(label.netWeight),
        pcs: label.pcsCount || 1,
      }]);
      setLabelNo('');
    } catch {
      toast.error('Label not found');
    }
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const totalGrossWt = items.reduce((s, i) => s + i.grossWeight, 0);
  const totalNetWt = items.reduce((s, i) => s + i.netWeight, 0);

  const handleSave = () => {
    if (!toBranchId) return toast.error('Select target branch');
    if (items.length === 0) return toast.error('Add items');
    saveMutation.mutate({
      transferDate: issueDate,
      toBranchId,
      fromBranchId: 1,
      financialYear: getFinancialYear(),
      userId: 1,
      transferType: 'ISSUE',
      remarks,
      totalGrossWeight: totalGrossWt,
      totalNetWeight: totalNetWt,
      totalPcs: items.reduce((s, i) => s + i.pcs, 0),
      items: items.map((i) => ({
        labelId: i.labelId,
        labelNo: i.labelNo,
        itemName: i.itemName,
        grossWeight: i.grossWeight,
        netWeight: i.netWeight,
        pcs: i.pcs,
      })),
    });
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="panel">
        <div className="panel-header">Branch Issue</div>
        <div className="panel-body flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Issue Date</label>
            <input type="date" className="form-input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <label className="form-label block text-xs">To Branch</label>
            <select className="form-select w-48" value={toBranchId} onChange={(e) => setToBranchId(Number(e.target.value))}>
              <option value={0}>Select Branch</option>
              {(branches || []).map((b: any) => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label block text-xs">Scan Label</label>
            <div className="flex gap-1">
              <input
                className="form-input w-40"
                value={labelNo}
                onChange={(e) => setLabelNo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLabelScan()}
                placeholder="Scan label..."
              />
              <button onClick={handleLabelScan} className="btn-primary text-xs">Add</button>
            </div>
          </div>
          <div className="flex-1">
            <label className="form-label block text-xs">Remarks</label>
            <input className="form-input w-full" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Label No</th>
              <th>Item Name</th>
              <th className="text-right">Gross Wt</th>
              <th className="text-right">Net Wt</th>
              <th className="text-right">Pcs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td className="font-medium">{item.labelNo}</td>
                <td>{item.itemName}</td>
                <td className="text-right">{formatWeight(item.grossWeight)}</td>
                <td className="text-right">{formatWeight(item.netWeight)}</td>
                <td className="text-right">{item.pcs}</td>
                <td><button onClick={() => removeItem(idx)} className="text-red-500">✕</button></td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Scan labels to add items</td></tr>
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td colSpan={3}>Total ({items.length} items)</td>
                <td className="text-right">{formatWeight(totalGrossWt)}</td>
                <td className="text-right">{formatWeight(totalNetWt)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={handleSave} className="btn-success" disabled={saveMutation.isPending}>💾 Save Issue</button>
        <button className="btn-primary">🖨️ Print</button>
        <button onClick={() => setItems([])} className="btn-outline">Clear</button>
      </div>
    </div>
  );
}
