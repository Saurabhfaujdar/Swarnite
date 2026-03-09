import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { layawayAPI, inventoryAPI, accountsAPI, mastersAPI } from '../../lib/api';
import { formatIndianNumber, formatWeight, getToday, calculateGST, getDayName, getFinancialYear } from '../../lib/utils';
import toast from 'react-hot-toast';
import AccountMasterModal from '../../components/AccountMasterModal';

interface LayawayItem {
  labelNo: string;
  itemName: string;
  itemId: number;
  labelId?: number;
  grossWeight: number;
  netWeight: number;
  fineWeight: number;
  pcs: number;
  metalRate: number;
  metalAmount: number;
  diamondWeight: number;
  labourRate: number;
  labourAmount: number;
  otherCharge: number;
  discountAmt: number;
  totalAmount: number;
  taxableAmount: number;
}

export default function LayawayEntry() {
  const queryClient = useQueryClient();
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [voucherDate, setVoucherDate] = useState(getToday());
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [salesmanName, setSalesmanName] = useState('');
  const [labelNo, setLabelNo] = useState('');
  const [items, setItems] = useState<LayawayItem[]>([]);
  const [narration, setNarration] = useState('');
  const [reference, setReference] = useState('');
  const [bookName, setBookName] = useState('');

  // Payment state
  const [cashAmount, setCashAmount] = useState(0);
  const [bankAmount, setBankAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [oldGoldAmount, setOldGoldAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [roundingDiscount, setRoundingDiscount] = useState(0);
  const [showNarrationModal, setShowNarrationModal] = useState(false);

  // Calculated totals
  const totalGrossWeight = items.reduce((sum, i) => sum + i.grossWeight, 0);
  const totalNetWeight = items.reduce((sum, i) => sum + i.netWeight, 0);
  const totalFineWeight = items.reduce((sum, i) => sum + i.fineWeight, 0);
  const totalPcs = items.reduce((sum, i) => sum + i.pcs, 0);
  const metalAmount = items.reduce((sum, i) => sum + i.metalAmount, 0);
  const labourAmount = items.reduce((sum, i) => sum + i.labourAmount, 0);
  const otherCharge = items.reduce((sum, i) => sum + i.otherCharge, 0);
  const taxableAmount = items.reduce((sum, i) => sum + i.taxableAmount, 0);

  const gst = calculateGST(taxableAmount);
  const totalAmountBeforeDisc = taxableAmount + gst.total;
  const voucherAmount = Math.round(totalAmountBeforeDisc - discountAmount - roundingDiscount);
  const paymentAmount = cashAmount + bankAmount + cardAmount + oldGoldAmount;
  const dueAmount = voucherAmount - paymentAmount;
  const previousOs = customerData ? Number(customerData.closingBalance || 0) : 0;
  const finalDue = dueAmount + previousOs;

  // Queries
  const { data: customers } = useQuery({
    queryKey: ['customers-layaway-search', customerSearch],
    queryFn: () => accountsAPI.list({ search: customerSearch, type: 'CUSTOMER' }).then((r) => r.data.accounts),
    enabled: customerSearch.length >= 2,
  });

  const { data: salesmen } = useQuery({
    queryKey: ['salesmen'],
    queryFn: () => mastersAPI.salesmen().then((r) => r.data),
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (data: any) => layawayAPI.create(data),
    onSuccess: (res) => {
      toast.success(`Layaway ${res.data.voucherNo} created!`);
      queryClient.invalidateQueries({ queryKey: ['layaways'] });
      resetForm();
    },
    onError: () => toast.error('Failed to save layaway'),
  });

  // Add item by label scan
  const handleLabelScan = async () => {
    if (!labelNo.trim()) return;

    try {
      const res = await inventoryAPI.searchLabel(labelNo.trim());
      const label = res.data;

      if (label.status !== 'IN_STOCK') {
        toast.error(`Label ${labelNo} is not in stock (${label.status})`);
        return;
      }

      // Check if already added
      if (items.find((i) => i.labelNo === label.labelNo)) {
        toast.error('Item already added');
        return;
      }

      // Get latest metal rate
      const ratesRes = await mastersAPI.latestRates();
      const rates = ratesRes.data;
      const metalRate = rates.find(
        (r: any) => r.metalType?.name === label.item?.metalType?.name && r.purityCode === label.item?.purity?.code
      );
      const rate = metalRate ? Number(metalRate.rate) : 0;

      const grossWt = Number(label.grossWeight);
      const netWt = Number(label.netWeight);
      const purity = Number(label.item?.purity?.percentage || 0);
      const fineWt = (netWt * purity) / 100;
      const metalAmt = fineWt * rate;
      const labRate = Number(label.item?.labourRate || 0);
      const labAmt = netWt * labRate;
      const taxable = metalAmt + labAmt;

      const newItem: LayawayItem = {
        labelNo: label.labelNo,
        itemName: label.item?.name || '',
        itemId: label.itemId,
        labelId: label.id,
        grossWeight: grossWt,
        netWeight: netWt,
        fineWeight: fineWt,
        pcs: label.pcsCount || 1,
        metalRate: rate,
        metalAmount: metalAmt,
        diamondWeight: 0,
        labourRate: labRate,
        labourAmount: labAmt,
        otherCharge: 0,
        discountAmt: 0,
        totalAmount: taxable,
        taxableAmount: taxable,
      };

      setItems([...items, newItem]);
      setLabelNo('');
      labelInputRef.current?.focus();
    } catch (error) {
      toast.error(`Label ${labelNo} not found`);
    }
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!customerId) return toast.error('Please select a customer (F2)');
    if (items.length === 0) return toast.error('Please add at least one item');

    saveMutation.mutate({
      voucherDate,
      accountId: customerId,
      salesmanName: salesmanName || null,
      branchId: 1,
      financialYear: getFinancialYear(),
      totalGrossWeight,
      totalNetWeight,
      totalFineWeight,
      totalPcs,
      metalAmount,
      labourAmount,
      otherCharge,
      discountAmount,
      taxableAmount,
      cgstAmount: gst.cgst,
      sgstAmount: gst.sgst,
      totalAmount: totalAmountBeforeDisc,
      roundingDiscount,
      voucherAmount,
      cashAmount,
      bankAmount,
      cardAmount,
      oldGoldAmount,
      paymentAmount,
      dueAmount,
      previousOs,
      finalDue,
      narration,
      reference,
      bookName,
      items: items.map((i) => ({
        labelId: i.labelId,
        itemId: i.itemId,
        labelNo: i.labelNo,
        itemName: i.itemName,
        grossWeight: i.grossWeight,
        netWeight: i.netWeight,
        fineWeight: i.fineWeight,
        pcs: i.pcs,
        metalRate: i.metalRate,
        metalAmount: i.metalAmount,
        diamondWeight: i.diamondWeight,
        labourRate: i.labourRate,
        labourAmount: i.labourAmount,
        otherCharge: i.otherCharge,
        discountAmt: i.discountAmt,
        taxableAmount: i.taxableAmount,
        totalAmount: i.totalAmount,
      })),
    });
  };

  const resetForm = () => {
    setCustomerId(null);
    setCustomerData(null);
    setCustomerSearch('');
    setSalesmanName('');
    setLabelNo('');
    setItems([]);
    setNarration('');
    setReference('');
    setBookName('');
    setCashAmount(0);
    setBankAmount(0);
    setCardAmount(0);
    setOldGoldAmount(0);
    setDiscountAmount(0);
    setRoundingDiscount(0);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); setShowCustomerModal(true); }
      if (e.key === 'F5') { e.preventDefault(); /* focus cash */ }
      if (e.key === 'F12' || (e.ctrlKey && e.key === 's')) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items, customerId, narration]);

  return (
    <div className="flex gap-2 h-[calc(100vh-80px)]">
      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-2">
        {/* Header */}
        <div className="panel">
          <div className="panel-header flex items-center justify-between">
            <span>LayAway Entry [LY] - {customerData?.name || 'General Customer'}</span>
            <span className="text-xs text-gray-500">
              {getDayName(voucherDate)} | {voucherDate}
            </span>
          </div>
          <div className="panel-body flex gap-4 items-end">
            <div>
              <label className="form-label block">Item Name / Bar Code</label>
              <div className="flex gap-1">
                <input
                  ref={labelInputRef}
                  type="text"
                  className="form-input w-48"
                  value={labelNo}
                  onChange={(e) => setLabelNo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLabelScan()}
                  placeholder="Scan label..."
                  autoFocus
                />
                <button onClick={handleLabelScan} className="btn-primary text-xs">
                  Add
                </button>
              </div>
            </div>
            <div>
              <label className="form-label block">Voucher Date</label>
              <input
                type="date"
                className="form-input w-36"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Customer Info Strip */}
        {customerData && (
          <div className="panel">
            <div className="panel-body py-2 px-3 flex gap-6 items-center text-xs">
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Customer:</span>
                <span className="font-semibold text-blue-700">{customerData.name}</span>
              </div>
              {customerData.mobile && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">Phone:</span>
                  <span>{customerData.mobile}</span>
                </div>
              )}
              {customerData.city && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">City:</span>
                  <span>{customerData.city}</span>
                </div>
              )}
              {customerData.gstin && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">GSTIN:</span>
                  <span>{customerData.gstin}</span>
                </div>
              )}
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-gray-500">Balance:</span>
                <span className={previousOs > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                  {formatIndianNumber(Math.abs(previousOs))} {customerData.balanceType !== 'NONE' ? customerData.balanceType : ''}
                </span>
              </div>
              <button
                className="text-blue-600 hover:text-blue-800 underline text-[11px]"
                onClick={() => setShowCustomerModal(true)}
              >
                Change
              </button>
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="panel flex-1 overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Label No.</th>
                <th>Item Name</th>
                <th className="text-right">Gross Wt</th>
                <th className="text-right">Net Wt</th>
                <th className="text-right">Fine Wt</th>
                <th className="text-right">Metal Rate</th>
                <th className="text-right">Metal Amt</th>
                <th className="text-right">Di.Wt.</th>
                <th className="text-right">Lab. Rate</th>
                <th className="text-right">Taxable Amt</th>
                <th className="text-right">Final Amt.</th>
                <th className="text-right">SGST</th>
                <th className="text-right">CGST</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const itemGst = calculateGST(item.taxableAmount);
                return (
                  <tr key={idx} className="cursor-pointer hover:bg-blue-50">
                    <td className="font-medium">{item.labelNo}</td>
                    <td>{item.itemName}</td>
                    <td className="text-right">{formatWeight(item.grossWeight)}</td>
                    <td className="text-right">{formatWeight(item.netWeight)}</td>
                    <td className="text-right">{formatWeight(item.fineWeight)}</td>
                    <td className="text-right">{formatIndianNumber(item.metalRate)}</td>
                    <td className="text-right">{formatIndianNumber(item.metalAmount)}</td>
                    <td className="text-right">{formatWeight(item.diamondWeight)}</td>
                    <td className="text-right">{formatIndianNumber(item.labourRate)}</td>
                    <td className="text-right">{formatIndianNumber(item.taxableAmount)}</td>
                    <td className="text-right font-medium">{formatIndianNumber(item.taxableAmount + itemGst.total)}</td>
                    <td className="text-right">{formatIndianNumber(itemGst.sgst)}</td>
                    <td className="text-right">{formatIndianNumber(itemGst.cgst)}</td>
                    <td>
                      <button onClick={() => removeItem(idx)} className="text-red-500 text-xs hover:text-red-700" title="Remove item">
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={14} className="text-center text-gray-400 py-8">
                    Scan a label or barcode to add items for layaway
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totals row */}
          {items.length > 0 && (
            <div className="flex justify-between bg-gray-50 px-3 py-2 border-t text-sm">
              <span>Gross: {formatWeight(totalGrossWeight)}</span>
              <span>Net: {formatWeight(totalNetWeight)}</span>
              <span>Fine: {formatWeight(totalFineWeight)}</span>
              <span>Pcs: {totalPcs}</span>
              <span className="font-medium">Final: {formatIndianNumber(voucherAmount)}</span>
              <span>SGST: {formatIndianNumber(gst.sgst)}</span>
              <span>CGST: {formatIndianNumber(gst.cgst)}</span>
            </div>
          )}
        </div>

        {/* Salesman & Narration Section */}
        <div className="panel">
          <div className="panel-body flex gap-4">
            <div className="w-48">
              <label className="form-label block text-xs font-semibold">Salesman Detail</label>
              <select
                className="form-select w-full"
                value={salesmanName}
                onChange={(e) => setSalesmanName(e.target.value)}
              >
                <option value="">None</option>
                {salesmen?.map((s: any) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="form-label block text-xs font-semibold">Narration</label>
              <textarea
                data-testid="narration-input"
                className="form-input w-full bg-blue-50 text-blue-900 min-h-[60px]"
                rows={2}
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="Enter narration here..."
              />
            </div>
          </div>
        </div>

        {/* Function Keys */}
        <div className="flex gap-1 flex-wrap">
          {[
            { label: 'Customer', key: 'F2', action: () => setShowCustomerModal(true) },
            { label: 'Voucher No', key: 'F3' },
            { label: 'Salesman', key: '' },
            { label: 'Cash', key: 'F5' },
            { label: 'Bank', key: 'F6' },
            { label: 'Narration', key: '', action: () => setShowNarrationModal(true) },
            { label: 'Void Line', key: '' },
            { label: 'Discount', key: '' },
            { label: 'Save', key: '', action: handleSave },
            { label: 'Print', key: '' },
            { label: 'Close', key: '', action: resetForm },
          ].map((btn) => (
            <div
              key={btn.label}
              className="fn-key cursor-pointer hover:bg-blue-100"
              onClick={() => 'action' in btn && (btn as any).action?.()}
            >
              <span className="text-xs">{btn.label}</span>
              {btn.key && <span className="fn-key-label">({btn.key})</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Right Sidebar - Voucher Details */}
      <div className="voucher-sidebar flex flex-col gap-3">
        {/* Debit Header */}
        <div className="bg-blue-50 p-2 rounded border border-blue-200 text-center">
          <div className="text-xs text-blue-600">Debit</div>
          <div className="text-xl font-bold text-red-600">{formatIndianNumber(voucherAmount)}</div>
          <div className="text-[10px] text-gray-500">
            {voucherDate} {getDayName(voucherDate)}
          </div>
        </div>

        {/* Voucher Details */}
        <div className="text-xs space-y-0.5">
          <div className="font-semibold text-gray-600 mb-1">Voucher Details</div>
          <div className="voucher-detail-row">
            <span className="voucher-detail-label">Metal Amt</span>
            <span className="voucher-detail-value">{formatIndianNumber(metalAmount)}</span>
          </div>
          <div className="voucher-detail-row">
            <span className="voucher-detail-label">Labour Amt</span>
            <span className="voucher-detail-value">{formatIndianNumber(labourAmount)}</span>
          </div>
          <div className="voucher-detail-row">
            <span className="voucher-detail-label">Oth. Charge</span>
            <span className="voucher-detail-value">{formatIndianNumber(otherCharge)}</span>
          </div>
          <div className="voucher-detail-row">
            <span className="voucher-detail-label">Discount Amt</span>
            <span className="voucher-detail-value">{formatIndianNumber(discountAmount)}</span>
          </div>
          <div className="voucher-detail-row">
            <span className="voucher-detail-label text-green-700">CGST</span>
            <span className="voucher-detail-value text-green-700">{formatIndianNumber(gst.cgst)}</span>
          </div>
          <div className="voucher-detail-row">
            <span className="voucher-detail-label text-green-700">SGST</span>
            <span className="voucher-detail-value text-green-700">{formatIndianNumber(gst.sgst)}</span>
          </div>
          <div className="voucher-detail-row bg-yellow-50 p-1 rounded font-bold">
            <span>Total Amt</span>
            <span className="text-blue-700">{formatIndianNumber(voucherAmount)}</span>
          </div>
          <div className="voucher-detail-row">
            <span className="voucher-detail-label">Rnd. Discount</span>
            <input
              type="number"
              className="form-input w-20 text-right text-xs"
              value={roundingDiscount || ''}
              onChange={(e) => setRoundingDiscount(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Credit Details */}
        <div className="text-xs space-y-0.5">
          <div className="font-semibold text-gray-600 mb-1">Credit Details</div>
          <div className="voucher-detail-row">
            <span className="voucher-detail-label">Cash Amt</span>
            <input
              type="number"
              className="form-input w-20 text-right text-xs"
              value={cashAmount || ''}
              onChange={(e) => setCashAmount(Number(e.target.value))}
            />
          </div>
          <div className="voucher-detail-row">
            <span className="voucher-detail-label">Bank Amt</span>
            <input
              type="number"
              className="form-input w-20 text-right text-xs"
              value={bankAmount || ''}
              onChange={(e) => setBankAmount(Number(e.target.value))}
            />
          </div>
          <div className="voucher-detail-row">
            <span className="voucher-detail-label">Card Amt</span>
            <input
              type="number"
              className="form-input w-20 text-right text-xs"
              value={cardAmount || ''}
              onChange={(e) => setCardAmount(Number(e.target.value))}
            />
          </div>
          <div className="voucher-detail-row">
            <span className="voucher-detail-label">OG Purchase</span>
            <input
              type="number"
              className="form-input w-20 text-right text-xs"
              value={oldGoldAmount || ''}
              onChange={(e) => setOldGoldAmount(Number(e.target.value))}
            />
          </div>
        </div>

        {/* O/S Details */}
        <div className="text-xs space-y-0.5">
          <div className="font-semibold text-gray-600 mb-1">O/s. Details</div>
          <div className="voucher-detail-row font-medium">
            <span>Voucher Amt</span>
            <span className="text-blue-700">{formatIndianNumber(voucherAmount)}</span>
          </div>
          <div className="voucher-detail-row font-medium">
            <span>Payment Amt</span>
            <span className="text-green-700">{formatIndianNumber(paymentAmount)}</span>
          </div>
          <div className="voucher-detail-row font-medium">
            <span>Due Amt</span>
            <span className="text-red-600">{formatIndianNumber(dueAmount)}</span>
          </div>
          <div className="voucher-detail-row">
            <span>Previous O/S</span>
            <span>{formatIndianNumber(previousOs)}</span>
          </div>
          <div className="voucher-detail-row bg-red-50 p-1 rounded font-bold">
            <span>Final Due.</span>
            <span className="text-red-700">{formatIndianNumber(finalDue)}</span>
          </div>
        </div>

        {/* Save / Print / Close */}
        <div className="flex gap-2 mt-auto">
          <button onClick={handleSave} className="btn-success flex-1" disabled={saveMutation.isPending}>
            Save
          </button>
          <button className="btn-primary flex-1">Print</button>
          <button onClick={resetForm} className="btn-danger flex-1">Close</button>
        </div>
      </div>

      {/* Customer Selection Modal */}
      {showCustomerModal && (
        <LayawayCustomerModal
          onSelect={(id, name, fullData) => {
            setCustomerId(id);
            setCustomerData(fullData);
            setShowCustomerModal(false);
          }}
          onClose={() => setShowCustomerModal(false)}
        />
      )}

      {/* Narration Modal */}
      {showNarrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-2xl w-[500px] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white rounded-t-lg">
              <span className="font-semibold">Narration</span>
              <button onClick={() => setShowNarrationModal(false)} className="hover:bg-blue-500 rounded px-2">✕</button>
            </div>
            <div className="p-4">
              <textarea
                className="form-input w-full bg-blue-50 text-blue-900 min-h-[120px]"
                rows={5}
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="Enter narration..."
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button onClick={() => setShowNarrationModal(false)} className="btn-primary">OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Customer Selection Modal (for Layaway)
   ============================================================ */
function LayawayCustomerModal({
  onSelect,
  onClose,
}: {
  onSelect: (id: number, name: string, data: any) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [showAccountMaster, setShowAccountMaster] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-layaway-modal', search],
    queryFn: () =>
      accountsAPI
        .list({ search: search || undefined, type: 'CUSTOMER', limit: '100' })
        .then((r) => r.data.accounts),
    staleTime: 30_000,
  });

  const customers: any[] = data ?? [];

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-2xl w-[700px] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white rounded-t-lg">
          <span className="font-semibold">Select Customer</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAccountMaster(true)}
              className="text-xs bg-blue-500 hover:bg-blue-400 rounded px-3 py-1"
            >
              + New Customer
            </button>
            <button onClick={onClose} className="hover:bg-blue-500 rounded px-2">✕</button>
          </div>
        </div>
        <div className="p-3 border-b">
          <input
            ref={searchRef}
            className="form-input w-full"
            placeholder="Search by name, mobile, GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading && <div className="p-4 text-center text-gray-400">Loading...</div>}
          {customers.map((c: any) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-4 py-2 hover:bg-blue-50 cursor-pointer border-b"
              onClick={() => onSelect(c.id, c.name, c)}
            >
              <div>
                <div className="font-medium text-sm">{c.name}</div>
                <div className="text-xs text-gray-500">
                  {c.mobile || ''} {c.city ? `| ${c.city}` : ''} {c.gstin ? `| GSTIN: ${c.gstin}` : ''}
                </div>
              </div>
              <div className="text-xs text-right">
                <div className={Number(c.closingBalance) > 0 ? 'text-red-600' : 'text-green-600'}>
                  {formatIndianNumber(Math.abs(Number(c.closingBalance || 0)))} {c.balanceType || ''}
                </div>
              </div>
            </div>
          ))}
          {!isLoading && customers.length === 0 && (
            <div className="p-4 text-center text-gray-400 text-sm">No customers found</div>
          )}
        </div>
      </div>

      {showAccountMaster && (
        <AccountMasterModal
          open={true}
          onClose={() => setShowAccountMaster(false)}
          onSaved={(account: any) => {
            queryClient.invalidateQueries({ queryKey: ['customer-layaway-modal'] });
            onSelect(account.id, account.name, account);
            setShowAccountMaster(false);
          }}
          forceType="CUSTOMER"
        />
      )}
    </div>
  );
}
