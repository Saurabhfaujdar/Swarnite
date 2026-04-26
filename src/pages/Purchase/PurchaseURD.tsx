import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseAPI, accountsAPI, mastersAPI } from '../../lib/api';
import { formatIndianNumber, formatWeight, getToday, calculateGST, getFinancialYear } from '../../lib/utils';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';

interface PurchaseItem {
  labelNo: string;
  itemName: string;
  itemId?: number;
  grossWeight: number;
  lessWeight: number;
  netWeight: number;
  purityCode: string;
  purityPercent: number;
  fineWeight: number;
  metalRate: number;
  metalAmount: number;
  labourRate: number;
  labourAmount: number;
  otherCharge: number;
  totalAmount: number;
  pcs: number;
}

export default function PurchaseURD() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [voucherDate, setVoucherDate] = useState(getToday());
  const [purchaseType, setPurchaseType] = useState<'URD' | 'OLD_GOLD'>('URD');
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([]);

  // List filters
  const [listDateFrom, setListDateFrom] = useState(getToday());
  const [listDateTo, setListDateTo] = useState(getToday());
  const [listType, setListType] = useState<'URD' | 'OLD_GOLD' | ''>('');

  // New item form
  const [newItem, setNewItem] = useState({
    itemName: '',
    grossWeight: 0,
    lessWeight: 0,
    purityCode: '916',
    purityPercent: 91.6,
    metalRate: 0,
    labourRate: 0,
    otherCharge: 0,
    pcs: 1,
  });

  // Payment
  const [cashPaid, setCashPaid] = useState(0);
  const [bankPaid, setBankPaid] = useState(0);
  const [adjustAmount, setAdjustAmount] = useState(0);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-search', supplierSearch, purchaseType],
    queryFn: () => accountsAPI.list({ search: supplierSearch, type: purchaseType === 'OLD_GOLD' ? undefined : 'SUPPLIER' }).then((r) => r.data.accounts),
    enabled: supplierSearch.length >= 2 && !supplierId,
  });

  const { data: purities } = useQuery({
    queryKey: ['purities'],
    queryFn: () => mastersAPI.purities().then((r) => r.data),
  });

  // Purchase list query
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['purchase-list', listDateFrom, listDateTo, listType],
    queryFn: () => purchaseAPI.list({ dateFrom: listDateFrom, dateTo: listDateTo, type: listType || undefined }).then((r) => r.data),
    enabled: view === 'list',
  });
  const purchaseList = listData?.vouchers || [];

  const cancelMutation = useMutation({
    mutationFn: (id: number) => purchaseAPI.cancel(id),
    onSuccess: () => {
      toast.success('Purchase voucher cancelled');
      queryClient.invalidateQueries({ queryKey: ['purchase-list'] });
    },
    onError: () => toast.error('Failed to cancel voucher'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => purchaseAPI.create(data),
    onSuccess: (res) => {
      toast.success(`Purchase voucher ${res.data.voucherNo} created!`);
      queryClient.invalidateQueries({ queryKey: ['purchase-list'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setView('list');
    },
    onError: () => toast.error('Failed to save'),
  });

  const addItem = () => {
    const netWt = newItem.grossWeight - newItem.lessWeight;
    const fineWt = (netWt * newItem.purityPercent) / 100;
    const metalAmt = fineWt * newItem.metalRate;
    const labAmt = netWt * newItem.labourRate;
    const total = metalAmt + labAmt + newItem.otherCharge;

    setItems([
      ...items,
      {
        labelNo: '',
        itemName: newItem.itemName,
        grossWeight: newItem.grossWeight,
        lessWeight: newItem.lessWeight,
        netWeight: netWt,
        purityCode: newItem.purityCode,
        purityPercent: newItem.purityPercent,
        fineWeight: fineWt,
        metalRate: newItem.metalRate,
        metalAmount: metalAmt,
        labourRate: newItem.labourRate,
        labourAmount: labAmt,
        otherCharge: newItem.otherCharge,
        totalAmount: total,
        pcs: newItem.pcs,
      },
    ]);

    setNewItem({
      itemName: '',
      grossWeight: 0,
      lessWeight: 0,
      purityCode: '916',
      purityPercent: 91.6,
      metalRate: 0,
      labourRate: 0,
      otherCharge: 0,
      pcs: 1,
    });
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  // Totals
  const totalGrossWt = items.reduce((s, i) => s + i.grossWeight, 0);
  const totalNetWt = items.reduce((s, i) => s + i.netWeight, 0);
  const totalFineWt = items.reduce((s, i) => s + i.fineWeight, 0);
  const totalMetalAmt = items.reduce((s, i) => s + i.metalAmount, 0);
  const totalLabourAmt = items.reduce((s, i) => s + i.labourAmount, 0);
  const totalOtherCharge = items.reduce((s, i) => s + i.otherCharge, 0);
  const subTotal = items.reduce((s, i) => s + i.totalAmount, 0);
  const gst = calculateGST(subTotal);
  const voucherAmount = Math.round(subTotal + gst.total);
  const paidAmount = cashPaid + bankPaid + adjustAmount;
  const dueAmount = voucherAmount - paidAmount;

  const handleSave = () => {
    if (!supplierId) return toast.error('Select a supplier/customer');
    if (items.length === 0) return toast.error('Add at least one item');

    saveMutation.mutate({
      voucherDate,
      purchaseType,
      accountId: supplierId,
      financialYear: getFinancialYear(),
      totalGrossWeight: totalGrossWt,
      totalNetWeight: totalNetWt,
      totalFineWeight: totalFineWt,
      totalPcs: items.reduce((s, i) => s + i.pcs, 0),
      metalAmount: totalMetalAmt,
      labourAmount: totalLabourAmt,
      otherCharge: totalOtherCharge,
      totalAmount: subTotal,
      finalAmount: voucherAmount,
      cgstAmount: gst.cgst,
      sgstAmount: gst.sgst,
      igstAmount: 0,
      totalGstAmount: gst.total,
      voucherAmount,
      cashAmount: cashPaid,
      bankAmount: bankPaid,
      adjustAmount,
      items: items.map((i) => ({
        itemName: i.itemName,
        grossWeight: i.grossWeight,
        lessWeight: i.lessWeight,
        netWeight: i.netWeight,
        fineWeight: i.fineWeight,
        purityCode: i.purityCode,
        metalRate: i.metalRate,
        metalAmount: i.metalAmount,
        labourRate: i.labourRate,
        labourAmount: i.labourAmount,
        otherCharge: i.otherCharge,
        totalAmount: i.totalAmount,
        pcs: i.pcs,
      })),
    });
  };

  const resetForm = () => {
    setSupplierId(null);
    setSupplierSearch('');
    setItems([]);
    setCashPaid(0);
    setBankPaid(0);
    setAdjustAmount(0);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {view === 'list' ? (
        <>
          {/* List View */}
          <div className="panel">
            <div className="panel-header flex items-center justify-between">
              <span>Purchase Vouchers</span>
              <div className="flex gap-2">
                <button onClick={() => { setPurchaseType('URD'); setView('form'); }} className="btn-outline text-xs">
                  + New URD Purchase
                </button>
                <button onClick={() => { setPurchaseType('OLD_GOLD'); setView('form'); }} className="btn-primary text-xs">
                  + New Old Gold Purchase
                </button>
              </div>
            </div>
            <div className="panel-body flex gap-4 items-end flex-wrap">
              <div>
                <label className="form-label block text-xs">From Date</label>
                <input type="date" className="form-input" value={listDateFrom} onChange={(e) => setListDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="form-label block text-xs">To Date</label>
                <input type="date" className="form-input" value={listDateTo} onChange={(e) => setListDateTo(e.target.value)} />
              </div>
              <div>
                <label className="form-label block text-xs">Type</label>
                <select className="form-select" value={listType} onChange={(e) => setListType(e.target.value as any)}>
                  <option value="">All</option>
                  <option value="URD">URD</option>
                  <option value="OLD_GOLD">Old Gold</option>
                </select>
              </div>
            </div>
          </div>

          <div className="panel flex-1 overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sr.</th>
                  <th>Voucher No</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Supplier/Customer</th>
                  <th className="text-right">Items</th>
                  <th className="text-right">Gross Wt</th>
                  <th className="text-right">Net Wt</th>
                  <th className="text-right">Fine Wt</th>
                  <th className="text-right">Metal Amt</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listLoading && (
                  <tr><td colSpan={13} className="text-center py-8">Loading...</td></tr>
                )}
                {!listLoading && purchaseList.length === 0 && (
                  <tr><td colSpan={13} className="text-center py-8 text-gray-400">No purchase vouchers found</td></tr>
                )}
                {purchaseList.map((v: any, idx: number) => (
                  <tr key={v.id} className="hover:bg-blue-50">
                    <td>{idx + 1}</td>
                    <td className="font-medium text-blue-600">{v.voucherNo}</td>
                    <td>{new Date(v.voucherDate).toLocaleDateString('en-IN')}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        v.description?.includes('OLD GOLD') || v.group === 'OGN'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {v.description?.includes('OLD GOLD') || v.group === 'OGN' ? 'Old Gold' : 'URD'}
                      </span>
                    </td>
                    <td>{v.account?.name || '-'}</td>
                    <td className="text-right">{v.items?.length || 0}</td>
                    <td className="text-right">{formatWeight(v.totalGrossWeight)}</td>
                    <td className="text-right">{formatWeight(v.totalNetWeight)}</td>
                    <td className="text-right">{formatWeight(v.totalFineWeight)}</td>
                    <td className="text-right">{formatIndianNumber(v.metalAmount)}</td>
                    <td className="text-right font-bold">{formatIndianNumber(v.finalAmount || v.totalAmount)}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-xs ${v.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {v.status}
                      </span>
                    </td>
                    <td>
                      {v.status === 'ACTIVE' && (
                        <button
                          onClick={() => { if (confirm('Cancel this voucher?')) cancelMutation.mutate(v.id); }}
                          className="text-red-500 hover:text-red-700"
                          title="Cancel voucher"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
      {/* Form View */}
      {/* Header */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <span>Purchase {purchaseType === 'OLD_GOLD' ? '(Old Gold)' : '(URD)'}</span>
          <div className="flex gap-2">
            <button
              onClick={() => { resetForm(); setView('list'); }}
              className="btn-outline text-xs"
            >
              ← Back to List
            </button>
            <button
              onClick={() => { setPurchaseType('URD'); setSupplierId(null); setSupplierSearch(''); }}
              className={purchaseType === 'URD' ? 'btn-primary text-xs' : 'btn-outline text-xs'}
            >
              URD Purchase
            </button>
            <button
              onClick={() => { setPurchaseType('OLD_GOLD'); setSupplierId(null); setSupplierSearch(''); }}
              className={purchaseType === 'OLD_GOLD' ? 'btn-primary text-xs' : 'btn-outline text-xs'}
            >
              Old Gold Purchase
            </button>
          </div>
        </div>
        <div className="panel-body flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Date</label>
            <input type="date" className="form-input" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="form-label block text-xs">Supplier / Customer</label>
            <input
              type="text"
              className="form-input w-64"
              placeholder={purchaseType === 'OLD_GOLD' ? 'Search customer...' : 'Search supplier...'}
              value={supplierSearch}
              onChange={(e) => {
                setSupplierSearch(e.target.value);
                if (supplierId) setSupplierId(null);
              }}
            />
            {!supplierId && suppliers && suppliers.length > 0 && (
              <div className="absolute bg-white border shadow-lg z-10 max-h-40 overflow-auto w-64">
                {suppliers.map((s: any) => (
                  <div
                    key={s.id}
                    className="px-3 py-1 hover:bg-blue-50 cursor-pointer text-sm"
                    onClick={() => {
                      setSupplierId(s.id);
                      setSupplierSearch(s.name);
                    }}
                  >
                    {s.name} ({s.mobile || ''})
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Item Form */}
      <div className="panel">
        <div className="panel-header">Add Item</div>
        <div className="panel-body flex gap-3 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Item Name</label>
            <input
              className="form-input w-40"
              value={newItem.itemName}
              onChange={(e) => setNewItem({ ...newItem, itemName: e.target.value })}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Gross Wt</label>
            <input
              type="number"
              step="0.001"
              className="form-input w-24 text-right"
              value={newItem.grossWeight || ''}
              onChange={(e) => setNewItem({ ...newItem, grossWeight: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Less Wt</label>
            <input
              type="number"
              step="0.001"
              className="form-input w-24 text-right"
              value={newItem.lessWeight || ''}
              onChange={(e) => setNewItem({ ...newItem, lessWeight: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Net Wt</label>
            <input className="form-input w-24 text-right bg-gray-100" value={formatWeight(newItem.grossWeight - newItem.lessWeight)} readOnly />
          </div>
          <div>
            <label className="form-label block text-xs">Purity</label>
            <select
              className="form-select w-24"
              value={newItem.purityCode}
              onChange={(e) => {
                const p = purities?.find((p: any) => p.code === e.target.value);
                setNewItem({ ...newItem, purityCode: e.target.value, purityPercent: p ? Number(p.percentage) : 0 });
              }}
            >
              <option value="999">999 (99.9%)</option>
              <option value="916">916 (91.6%)</option>
              <option value="875">875 (87.5%)</option>
              <option value="750">750 (75.0%)</option>
              {purities?.map((p: any) => (
                <option key={p.id} value={p.code}>
                  {p.code} ({p.percentage}%)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label block text-xs">Fine Wt</label>
            <input
              className="form-input w-24 text-right bg-gray-100"
              value={formatWeight(((newItem.grossWeight - newItem.lessWeight) * newItem.purityPercent) / 100)}
              readOnly
            />
          </div>
          <div>
            <label className="form-label block text-xs">Metal Rate</label>
            <input
              type="number"
              className="form-input w-24 text-right"
              value={newItem.metalRate || ''}
              onChange={(e) => setNewItem({ ...newItem, metalRate: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="form-label block text-xs">Pcs</label>
            <input
              type="number"
              className="form-input w-16 text-right"
              value={newItem.pcs}
              onChange={(e) => setNewItem({ ...newItem, pcs: Number(e.target.value) })}
            />
          </div>
          <button onClick={addItem} className="btn-primary">+ Add</button>
        </div>
      </div>

      {/* Items Table */}
      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr</th>
              <th>Item Name</th>
              <th className="text-right">Gross Wt</th>
              <th className="text-right">Less Wt</th>
              <th className="text-right">Net Wt</th>
              <th>Purity</th>
              <th className="text-right">Fine Wt</th>
              <th className="text-right">Metal Rate</th>
              <th className="text-right">Metal Amt</th>
              <th className="text-right">Labour</th>
              <th className="text-right">Other</th>
              <th className="text-right">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{item.itemName}</td>
                <td className="text-right">{formatWeight(item.grossWeight)}</td>
                <td className="text-right">{formatWeight(item.lessWeight)}</td>
                <td className="text-right">{formatWeight(item.netWeight)}</td>
                <td>{item.purityCode}</td>
                <td className="text-right">{formatWeight(item.fineWeight)}</td>
                <td className="text-right">{formatIndianNumber(item.metalRate)}</td>
                <td className="text-right">{formatIndianNumber(item.metalAmount)}</td>
                <td className="text-right">{formatIndianNumber(item.labourAmount)}</td>
                <td className="text-right">{formatIndianNumber(item.otherCharge)}</td>
                <td className="text-right font-bold">{formatIndianNumber(item.totalAmount)}</td>
                <td>
                  <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">✕</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={13} className="text-center py-8 text-gray-400">No items added yet</td>
              </tr>
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td colSpan={2}>Total</td>
                <td className="text-right">{formatWeight(totalGrossWt)}</td>
                <td></td>
                <td className="text-right">{formatWeight(totalNetWt)}</td>
                <td></td>
                <td className="text-right">{formatWeight(totalFineWt)}</td>
                <td></td>
                <td className="text-right">{formatIndianNumber(totalMetalAmt)}</td>
                <td className="text-right">{formatIndianNumber(totalLabourAmt)}</td>
                <td className="text-right">{formatIndianNumber(totalOtherCharge)}</td>
                <td className="text-right">{formatIndianNumber(subTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Payment Footer */}
      <div className="panel">
        <div className="panel-body flex gap-6 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Sub Total</label>
            <input className="form-input w-28 text-right bg-gray-100" value={formatIndianNumber(subTotal)} readOnly />
          </div>
          <div>
            <label className="form-label block text-xs">CGST (1.5%)</label>
            <input className="form-input w-24 text-right bg-gray-100" value={formatIndianNumber(gst.cgst)} readOnly />
          </div>
          <div>
            <label className="form-label block text-xs">SGST (1.5%)</label>
            <input className="form-input w-24 text-right bg-gray-100" value={formatIndianNumber(gst.sgst)} readOnly />
          </div>
          <div>
            <label className="form-label block text-xs font-bold">Voucher Amt</label>
            <input className="form-input w-28 text-right bg-yellow-100 font-bold" value={formatIndianNumber(voucherAmount)} readOnly />
          </div>
          <div className="border-l pl-4">
            <label className="form-label block text-xs">Cash Paid</label>
            <input type="number" className="form-input w-24 text-right" value={cashPaid || ''} onChange={(e) => setCashPaid(Number(e.target.value))} />
          </div>
          <div>
            <label className="form-label block text-xs">Bank Paid</label>
            <input type="number" className="form-input w-24 text-right" value={bankPaid || ''} onChange={(e) => setBankPaid(Number(e.target.value))} />
          </div>
          <div>
            <label className="form-label block text-xs">Adjust</label>
            <input type="number" className="form-input w-24 text-right" value={adjustAmount || ''} onChange={(e) => setAdjustAmount(Number(e.target.value))} />
          </div>
          <div>
            <label className="form-label block text-xs text-red-600">Due Amt</label>
            <input className="form-input w-24 text-right text-red-600 bg-red-50" value={formatIndianNumber(dueAmount)} readOnly />
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={handleSave} className="btn-success" disabled={saveMutation.isPending}>
              💾 Save
            </button>
            <button onClick={resetForm} className="btn-outline">Clear</button>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
