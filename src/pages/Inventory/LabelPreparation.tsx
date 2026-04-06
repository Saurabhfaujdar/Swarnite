import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryAPI, mastersAPI } from '../../lib/api';
import { formatWeight, getToday } from '../../lib/utils';
import toast from 'react-hot-toast';

interface LabelItem {
  prefix: string;
  labelNo: string;
  tagId: string;
  itemId: number;
  itemName: string;
  grossWeight: number;
  netWeight: number;
  pcsCount: number;
  diamondWeight: number;
  stoneWeight: number;
  size: string;
  huid: string;
  counterCode: string;
  mrp: number | null;
}

export default function LabelPreparation() {
  const queryClient = useQueryClient();
  const [labelDate, setLabelDate] = useState(getToday());
  const [items, setItems] = useState<LabelItem[]>([]);

  // New item entry
  const [entry, setEntry] = useState({
    prefix: '',
    tagId: '',
    itemId: 0,
    grossWeight: 0,
    netWeight: 0,
    pcsCount: 1,
    diamondWeight: 0,
    stoneWeight: 0,
    size: '',
    huid: '',
    counterCode: '',
    mrp: null as number | null,
  });

  const { data: allItems } = useQuery({
    queryKey: ['items-list'],
    queryFn: () => inventoryAPI.items().then((r) => r.data),
  });

  const { data: prefixes } = useQuery({
    queryKey: ['label-prefixes'],
    queryFn: () => inventoryAPI.prefixes().then((r) => r.data),
  });

  const { data: counters } = useQuery({
    queryKey: ['counters'],
    queryFn: () => mastersAPI.counters().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => inventoryAPI.createBatch(data),
    onSuccess: (res: any) => {
      const count = res.data?.count || res.data?.created || 0;
      toast.success(`${count} labels created successfully!`);
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      setItems([]);
    },
    onError: () => toast.error('Failed to create labels'),
  });

  const addEntry = () => {
    if (!entry.itemId) return toast.error('Select an item');
    if (!entry.grossWeight) return toast.error('Enter gross weight');
    if (entry.huid && entry.huid.length !== 6) return toast.error('HUID must be exactly 6 alphanumeric characters');

    const item = allItems?.find((i: any) => i.id === entry.itemId);
    const requiresTagId = item?.itemGroup?.requiresTagId;

    if (requiresTagId && !entry.tagId.trim()) {
      return toast.error(`Tag ID is required for ${item?.itemGroup?.name} items`);
    }

    // Enforce pcs = 1 when tagId is provided
    const pcsCount = entry.tagId.trim() ? 1 : entry.pcsCount;

    setItems([
      ...items,
      {
        ...entry,
        labelNo: '', // Auto-generated
        itemName: item?.name || '',
        netWeight: entry.netWeight || entry.grossWeight - entry.diamondWeight - entry.stoneWeight,
        mrp: entry.mrp || null,
        pcsCount,
        tagId: entry.tagId.trim(),
      },
    ]);

    setEntry({
      prefix: entry.prefix,
      tagId: '',
      itemId: 0,
      grossWeight: 0,
      netWeight: 0,
      pcsCount: 1,
      diamondWeight: 0,
      stoneWeight: 0,
      size: '',
      huid: '',
      counterCode: entry.counterCode,
      mrp: null,
    });
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const handleSave = () => {
    if (items.length === 0) return toast.error('Add at least one item');
    createMutation.mutate({
      labelDate,
      labels: items.map((i) => ({
        prefix: i.prefix,
        tagId: i.tagId || undefined,
        itemId: i.itemId,
        grossWeight: i.grossWeight,
        netWeight: i.netWeight,
        pcsCount: i.pcsCount,
        diamondWeight: i.diamondWeight,
        stoneWeight: i.stoneWeight,
        size: i.size,
        huid: i.huid,
        counterCode: i.counterCode,
        mrp: i.mrp,
      })),
    });
  };

  const totalGrossWt = items.reduce((s, i) => s + i.grossWeight, 0);
  const totalNetWt = items.reduce((s, i) => s + i.netWeight, 0);
  const totalPcs = items.reduce((s, i) => s + i.pcsCount, 0);

  // Get selected item and check if it requires tag ID
  const selectedItem = allItems?.find((i: any) => i.id === entry.itemId);
  const requiresTagId = selectedItem?.itemGroup?.requiresTagId || false;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="panel">
        <div className="panel-header">Label Preparation / SKU Entry</div>
        <div className="panel-body flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Date</label>
            <input type="date" className="form-input" value={labelDate} onChange={(e) => setLabelDate(e.target.value)} />
          </div>
          <div>
            <label className="form-label block text-xs">Label Prefix</label>
            <select className="form-select w-32" value={entry.prefix} onChange={(e) => setEntry({ ...entry, prefix: e.target.value })}>
              <option value="">Auto</option>
              {prefixes?.map((p: any) => (
                <option key={p.id} value={p.prefix}>{p.prefix} - {p.description}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label block text-xs">Counter</label>
            <select className="form-select w-32" value={entry.counterCode} onChange={(e) => setEntry({ ...entry, counterCode: e.target.value })}>
              <option value="">Select Counter</option>
              {counters?.map((c: any) => (
                <option key={c.id} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Add Item Form */}
      <div className="panel">
        <div className="panel-header">Item Details</div>
        <div className="panel-body flex gap-3 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Item</label>
            <select
              className="form-select w-48"
              value={entry.itemId}
              onChange={(e) => setEntry({ ...entry, itemId: Number(e.target.value), tagId: '' })}
            >
              <option value={0}>Select Item</option>
              {allItems?.map((item: any) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          {entry.itemId > 0 && (
            <div>
              <label className="form-label block text-xs">
                Tag ID {requiresTagId && <span className="text-red-500">*</span>}
              </label>
              <input
                className="form-input w-24 uppercase"
                value={entry.tagId}
                onChange={(e) => setEntry({ ...entry, tagId: e.target.value.toUpperCase() })}
                placeholder="e.g. A001"
              />
            </div>
          )}
          <div>
            <label className="form-label block text-xs">Gross Wt (gm)</label>
            <input
              type="number"
              step="0.001"
              className="form-input w-24 text-right"
              value={entry.grossWeight || ''}
              onChange={(e) => setEntry({ ...entry, grossWeight: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Diamond Wt</label>
            <input
              type="number"
              step="0.001"
              className="form-input w-24 text-right"
              value={entry.diamondWeight || ''}
              onChange={(e) => setEntry({ ...entry, diamondWeight: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Stone Wt</label>
            <input
              type="number"
              step="0.001"
              className="form-input w-24 text-right"
              value={entry.stoneWeight || ''}
              onChange={(e) => setEntry({ ...entry, stoneWeight: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Net Wt (gm)</label>
            <input
              type="number"
              step="0.001"
              className="form-input w-24 text-right"
              value={entry.netWeight || (entry.grossWeight - entry.diamondWeight - entry.stoneWeight) || ''}
              onChange={(e) => setEntry({ ...entry, netWeight: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Pcs</label>
            <input
              type="number"
              className="form-input w-16 text-right"
              value={entry.tagId ? 1 : entry.pcsCount}
              onChange={(e) => setEntry({ ...entry, pcsCount: Number(e.target.value) })}
              disabled={!!entry.tagId}
              title={entry.tagId ? 'Pcs is fixed to 1 when Tag ID is provided' : ''}
            />
          </div>
          <div>
            <label className="form-label block text-xs">HUID</label>
            <input
              className="form-input w-28 uppercase"
              value={entry.huid}
              onChange={(e) => {
                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                setEntry({ ...entry, huid: val });
              }}
              maxLength={6}
              placeholder="6-char"
            />
          </div>
          <div>
            <label className="form-label block text-xs">Size</label>
            <input
              className="form-input w-16"
              value={entry.size}
              onChange={(e) => setEntry({ ...entry, size: e.target.value })}
            />
          </div>
          <div>
            <label className="form-label block text-xs">MRP</label>
            <input
              type="number"
              step="0.01"
              className="form-input w-24 text-right"
              value={entry.mrp ?? ''}
              onChange={(e) => setEntry({ ...entry, mrp: e.target.value ? Number(e.target.value) : null })}
              placeholder="Optional"
            />
          </div>
          <button onClick={addEntry} className="btn-primary">+ Add</button>
        </div>
      </div>

      {/* Items Table */}
      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Prefix</th>
              <th>Tag ID</th>
              <th>Item Name</th>
              <th className="text-right">Gross Wt</th>
              <th className="text-right">Diamond Wt</th>
              <th className="text-right">Stone Wt</th>
              <th className="text-right">Net Wt</th>
              <th className="text-right">Pcs</th>
              <th>HUID</th>
              <th>Size</th>
              <th className="text-right">MRP</th>
              <th>Counter</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{item.prefix || 'Auto'}</td>
                <td>{item.tagId || '-'}</td>
                <td>{item.itemName}</td>
                <td className="text-right">{formatWeight(item.grossWeight)}</td>
                <td className="text-right">{formatWeight(item.diamondWeight)}</td>
                <td className="text-right">{formatWeight(item.stoneWeight)}</td>
                <td className="text-right">{formatWeight(item.netWeight)}</td>
                <td className="text-right">{item.pcsCount}</td>
                <td>{item.huid || '-'}</td>
                <td>{item.size || '-'}</td>
                <td className="text-right">{item.mrp != null ? item.mrp.toLocaleString('en-IN') : '-'}</td>
                <td>{item.counterCode || '-'}</td>
                <td>
                  <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">✕</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={13} className="text-center py-8 text-gray-400">Add items to prepare labels</td></tr>
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td colSpan={3}>Total ({items.length} items)</td>
                <td className="text-right">{formatWeight(totalGrossWt)}</td>
                <td colSpan={2}></td>
                <td className="text-right">{formatWeight(totalNetWt)}</td>
                <td className="text-right">{totalPcs}</td>
                <td colSpan={5}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {items.length} items | Total Gross: {formatWeight(totalGrossWt)} | Total Net: {formatWeight(totalNetWt)} | Total Pcs: {totalPcs}
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="btn-success" disabled={createMutation.isPending}>
            💾 Save & Generate Labels
          </button>
          <button className="btn-primary" onClick={() => window.print()}>🖨️ Print Labels</button>
          <button onClick={() => setItems([])} className="btn-outline">Clear</button>
        </div>
      </div>
    </div>
  );
}
