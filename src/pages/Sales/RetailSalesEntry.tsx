import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesAPI, inventoryAPI, accountsAPI, mastersAPI } from '../../lib/api';
import { formatCurrency, formatWeight, formatIndianNumber, getToday, calculateGST, getDayName, getFinancialYear } from '../../lib/utils';
import toast from 'react-hot-toast';
import AccountMasterModal from '../../components/AccountMasterModal';
import VoucherPrintDialog from '../../components/VoucherPrintDialog';

interface SalesItem {
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
  discountStAmt: number;
  totalAmount: number;
  taxableAmount: number;
}

export default function RetailSalesEntry() {
  const queryClient = useQueryClient();
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [voucherDate, setVoucherDate] = useState(getToday());
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editItemIndex, setEditItemIndex] = useState<number | null>(null);
  const [savedVoucherId, setSavedVoucherId] = useState<number | null>(null);
  const [showVoucherPrint, setShowVoucherPrint] = useState(false);
  const [salesmanId, setSalesmanId] = useState<number | null>(null);
  const [labelNo, setLabelNo] = useState('');
  const [items, setItems] = useState<SalesItem[]>([]);

  // Payment state
  const [cashAmount, setCashAmount] = useState(0);
  const [bankAmount, setBankAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [oldGoldAmount, setOldGoldAmount] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [discountScheme, setDiscountScheme] = useState('DISCOUNT');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [roundingDiscount, setRoundingDiscount] = useState(0);

  // Calculated totals
  const totalGrossWeight = items.reduce((sum, i) => sum + i.grossWeight, 0);
  const totalNetWeight = items.reduce((sum, i) => sum + i.netWeight, 0);
  const totalFineWeight = items.reduce((sum, i) => sum + i.fineWeight, 0);
  const totalPcs = items.reduce((sum, i) => sum + i.pcs, 0);
  const metalAmount = items.reduce((sum, i) => sum + i.metalAmount, 0);
  const labourAmount = items.reduce((sum, i) => sum + i.labourAmount, 0);
  const otherCharge = items.reduce((sum, i) => sum + i.otherCharge, 0);
  const totalItemAmount = items.reduce((sum, i) => sum + i.totalAmount, 0);
  const taxableAmount = items.reduce((sum, i) => sum + i.taxableAmount, 0);

  const gst = calculateGST(taxableAmount);
  const totalAmountBeforeDisc = taxableAmount + gst.total;
  const voucherAmount = Math.round(totalAmountBeforeDisc - discountAmount - roundingDiscount);
  const paymentAmount = cashAmount + bankAmount + cardAmount + oldGoldAmount + advanceAmount;
  const dueAmount = voucherAmount - paymentAmount;
  const previousOs = customerData ? Number(customerData.closingBalance || 0) : 0;
  const availableAdvance = previousOs < 0 ? Math.abs(previousOs) : 0;
  const finalDue = dueAmount + previousOs + advanceAmount;

  // Queries
  const { data: customers } = useQuery({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => accountsAPI.list({ search: customerSearch, type: 'CUSTOMER' }).then((r) => r.data.accounts),
    enabled: customerSearch.length >= 2,
  });

  const { data: salesmen } = useQuery({
    queryKey: ['salesmen'],
    queryFn: () => mastersAPI.salesmen().then((r) => r.data),
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (data: any) => salesAPI.create(data),
    onSuccess: (res) => {
      toast.success(`Sales voucher ${res.data.voucherNo} created!`);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setSavedVoucherId(res.data.id);
      // Auto-open voucher print dialog after save
      setShowVoucherPrint(true);
    },
    onError: () => toast.error('Failed to save sales voucher'),
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
      const labRate = 2014; // Default labour rate, would be configurable
      const labAmt = netWt * labRate;
      const taxable = metalAmt + labAmt;

      const newItem: SalesItem = {
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
        discountStAmt: 0,
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
    if (!customerId) return toast.error('Please select a customer');
    if (items.length === 0) return toast.error('Please add at least one item');

    saveMutation.mutate({
      voucherDate,
      accountId: customerId,
      salesmanId,
      branchId: 1, // Would come from user context
      userId: 1,
      financialYear: getFinancialYear(),
      totalGrossWeight,
      totalNetWeight,
      totalPcs,
      metalAmount,
      labourAmount,
      otherCharge,
      totalAmount: totalItemAmount,
      taxableAmount,
      cgstAmount: gst.cgst,
      sgstAmount: gst.sgst,
      igstAmount: 0,
      totalGstAmount: gst.total,
      discountPercent,
      discountAmount,
      roundingDiscount,
      voucherAmount,
      cashAmount,
      bankAmount,
      cardAmount,
      oldGoldAmount,
      advanceAmount,
      paymentAmount,
      dueAmount,
      previousOs,
      finalDue,
      discountScheme,
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
        discountStAmt: i.discountStAmt,
        totalAmount: i.totalAmount,
        taxableAmount: i.taxableAmount,
      })),
    });
  };

  const resetForm = () => {
    setCustomerId(null);
    setCustomerData(null);
    setCustomerSearch('');
    setSalesmanId(null);
    setLabelNo('');
    setItems([]);
    setCashAmount(0);
    setBankAmount(0);
    setCardAmount(0);
    setOldGoldAmount(0);
    setAdvanceAmount(0);
    setDiscountAmount(0);
    setRoundingDiscount(0);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); setShowCustomerModal(true); }
      if (e.key === 'F5') { e.preventDefault(); /* Focus cash */ }
      if (e.key === 'F12') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items, customerId]);

  return (
    <div className="flex gap-2 h-[calc(100vh-80px)]">
      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-2">
        {/* Header: Item Name / Bar Code */}
        <div className="panel">
          <div className="panel-header flex items-center justify-between">
            <span>Sales Transaction For - {customerData?.name || '...'}</span>
            <span className="text-xs text-gray-500">
              {getDayName(voucherDate)} | {voucherDate}
            </span>
          </div>
          <div className="panel-body flex gap-4 items-end">
            <div>
              <label className="form-label block">Item Name/Bar Code</label>
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
                  N
                </button>
              </div>
            </div>
            <div>
              <label className="form-label block">Challan List</label>
              <button className="btn-outline text-xs">Challan List</button>
            </div>
            <div>
              <label className="form-label block">Order Item</label>
              <button className="btn-outline text-xs">Order Item</button>
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
              {customerData.state && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">State:</span>
                  <span>{customerData.state}</span>
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
                <th className="text-right">Lab. Amt</th>
                <th className="text-right">Di/St Amt</th>
                <th className="text-right">Total Amt</th>
                <th className="text-right">Taxable Amt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="cursor-pointer hover:bg-blue-50" onDoubleClick={() => setEditItemIndex(idx)} title="Double-click to edit">
                  <td className="font-medium">{item.labelNo}</td>
                  <td>{item.itemName}</td>
                  <td className="text-right">{formatWeight(item.grossWeight)}</td>
                  <td className="text-right">{formatWeight(item.netWeight)}</td>
                  <td className="text-right">{formatWeight(item.fineWeight)}</td>
                  <td className="text-right">{formatIndianNumber(item.metalRate)}</td>
                  <td className="text-right">{formatIndianNumber(item.metalAmount)}</td>
                  <td className="text-right">{formatWeight(item.diamondWeight)}</td>
                  <td className="text-right">{formatIndianNumber(item.labourRate)}</td>
                  <td className="text-right">{formatIndianNumber(item.labourAmount)}</td>
                  <td className="text-right">{formatIndianNumber(item.discountStAmt)}</td>
                  <td className="text-right font-medium">{formatIndianNumber(item.totalAmount)}</td>
                  <td className="text-right">{formatIndianNumber(item.taxableAmount)}</td>
                  <td>
                    <button onClick={() => removeItem(idx)} className="text-red-500 text-xs hover:text-red-700">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={14} className="text-center text-gray-400 py-8">
                    Scan a label or barcode to add items
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totals row */}
          {items.length > 0 && (
            <div className="flex justify-between bg-gray-50 px-3 py-2 border-t text-sm">
              <span>{formatWeight(totalGrossWeight)}</span>
              <span>{formatWeight(totalNetWeight)}</span>
              <span>SUM={formatWeight(totalFineWeight)}</span>
              <span className="font-medium">{formatIndianNumber(labourAmount)}</span>
              <span className="font-bold">{formatIndianNumber(taxableAmount)}</span>
              <span>SUM= {formatIndianNumber(0)}</span>
            </div>
          )}
        </div>

        {/* Discount Section */}
        <div className="panel">
          <div className="panel-body flex gap-6 items-end">
            <div className="flex gap-4 items-end">
              <div>
                <label className="form-label block text-xs">Voucher Amount</label>
                <input className="form-input w-28 text-right" value={formatIndianNumber(voucherAmount)} readOnly />
              </div>
              <div>
                <label className="form-label block text-xs">Discount Scheme</label>
                <select className="form-select w-32" value={discountScheme} onChange={(e) => setDiscountScheme(e.target.value)}>
                  <option value="DISCOUNT">DISCOUNT</option>
                  <option value="NONE">NONE</option>
                </select>
              </div>
              <div>
                <label className="form-label block text-xs">Discount %</label>
                <input
                  type="number"
                  className="form-input w-20 text-right"
                  value={discountPercent}
                  onChange={(e) => {
                    const pct = Number(e.target.value);
                    setDiscountPercent(pct);
                    setDiscountAmount((voucherAmount * pct) / 100);
                  }}
                />
              </div>
              <div>
                <label className="form-label block text-xs">Discount Amount</label>
                <input
                  type="number"
                  className="form-input w-28 text-right bg-blue-100"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label block text-xs">Rounding</label>
                <input
                  type="number"
                  className="form-input w-20 text-right"
                  value={roundingDiscount}
                  onChange={(e) => setRoundingDiscount(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label block text-xs">Final Amount</label>
                <input className="form-input w-28 text-right font-bold" value={formatIndianNumber(voucherAmount)} readOnly />
              </div>
              <button onClick={() => { setDiscountAmount(0); setDiscountPercent(0); }} className="btn-outline text-xs">
                Refresh Discount
              </button>
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
            { label: 'Card', key: 'F7' },
            { label: 'Narration', key: '' },
            { label: 'Quotation', key: 'F8' },
            { label: 'Quotation Print', key: 'F9' },
            { label: 'Cash Effect', key: 'F10' },
            { label: 'Extra Charge', key: '' },
            { label: 'Void Line', key: '' },
            { label: 'Discount', key: '' },
            { label: 'Metal Details', key: '' },
            { label: 'Rate Diff.', key: '' },
            { label: 'Old Purchase', key: '' },
            { label: 'Sales Return', key: '' },
            { label: 'Add/Less', key: '' },
            { label: 'Loyalty Card', key: '' },
            { label: 'Gift Voucher', key: '' },
            { label: 'AP', key: 'F12' },
            { label: 'Metal Settlement', key: '' },
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

      {/* Right Sidebar - Voucher Details (matching ORNATE NX) */}
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
            <span className="voucher-detail-value">{formatIndianNumber(roundingDiscount)}</span>
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
          {availableAdvance > 0 && (
            <div className="voucher-detail-row">
              <span className="voucher-detail-label text-green-700">Advance (₹{formatIndianNumber(availableAdvance)} avl)</span>
              <input
                type="number"
                className="form-input w-20 text-right text-xs border-green-400"
                value={advanceAmount || ''}
                onChange={(e) => {
                  const val = Math.min(Number(e.target.value), availableAdvance, voucherAmount);
                  setAdvanceAmount(val >= 0 ? val : 0);
                }}
                max={availableAdvance}
              />
            </div>
          )}
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
            <span className="text-red-600">-{formatIndianNumber(Math.abs(dueAmount))}</span>
          </div>
          <div className="voucher-detail-row">
            <span>Previous O/S</span>
            <span>{formatIndianNumber(previousOs)}</span>
          </div>
          <div className="voucher-detail-row bg-red-50 p-1 rounded font-bold">
            <span>Final Due</span>
            <span className="text-red-700">{formatIndianNumber(finalDue)}</span>
          </div>
        </div>

        {/* Save / Print / Close */}
        <div className="flex gap-2 mt-auto">
          <button onClick={handleSave} className="btn-success flex-1" disabled={saveMutation.isPending}>
            💾 Save
          </button>
          <button
            className={`flex-1 ${savedVoucherId ? 'btn-primary' : 'btn-outline opacity-50'}`}
            disabled={!savedVoucherId}
            onClick={() => savedVoucherId && setShowVoucherPrint(true)}
            title={savedVoucherId ? 'Open voucher print dialog' : 'Save a voucher first to enable printing'}
          >
            📄 Voucher
          </button>
          <button
            className={`flex-1 ${savedVoucherId ? 'btn-primary' : 'btn-outline opacity-50'}`}
            disabled={!savedVoucherId}
            onClick={() => savedVoucherId && setShowVoucherPrint(true)}
            title={savedVoucherId ? 'Print bill' : 'Save a voucher first to enable printing'}
          >
            🖨️ Print
          </button>
          <button onClick={() => { resetForm(); setSavedVoucherId(null); }} className="btn-danger flex-1">✕ Close</button>
        </div>
      </div>

      {/* Customer Selection Modal */}
      {showCustomerModal && (
        <CustomerSelectModal
          onSelect={(id, name, fullData) => {
            setCustomerId(id);
            setCustomerData(fullData);
            setShowCustomerModal(false);
          }}
          onClose={() => setShowCustomerModal(false)}
        />
      )}

      {/* Voucher Print Dialog */}
      {showVoucherPrint && savedVoucherId && (
        <VoucherPrintDialog
          voucherId={savedVoucherId}
          onClose={() => setShowVoucherPrint(false)}
        />
      )}

      {/* Item Detail Edit Modal */}
      {editItemIndex !== null && items[editItemIndex] && (
        <ItemDetailModal
          item={items[editItemIndex]}
          onSave={(updated) => {
            setItems((prev) =>
              prev.map((it, i) => (i === editItemIndex ? updated : it))
            );
            setEditItemIndex(null);
          }}
          onClose={() => setEditItemIndex(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Customer Selection Modal
   ============================================================ */
const emptyCustomerForm = {
  name: '',
  mobile: '',
  email: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  gstin: '',
  pan: '',
  aadhar: '',
  idProof: '',
};

function CustomerSelectModal({
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
  const [form, setForm] = useState({ ...emptyCustomerForm });
  const searchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-modal-search', search],
    queryFn: () =>
      accountsAPI
        .list({ search: search || undefined, type: 'CUSTOMER', limit: '100' })
        .then((r) => r.data.accounts),
    staleTime: 30_000,
  });

  const customers: any[] = data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: any) => accountsAPI.create(payload),
    onSuccess: (res) => {
      toast.success('Customer created successfully');
      queryClient.invalidateQueries({ queryKey: ['customer-modal-search'] });
      onSelect(res.data.id, res.data.name, res.data);
    },
    onError: () => toast.error('Failed to create customer'),
  });

  const handleCreateCustomer = useCallback(() => {
    if (!form.name.trim()) {
      toast.error('Customer name is required');
      nameRef.current?.focus();
      return;
    }
    createMutation.mutate({
      ...form,
      name: form.name.trim(),
      type: 'CUSTOMER',
    });
  }, [form, createMutation]);

  useEffect(() => {
    if (showNewForm) {
      nameRef.current?.focus();
    } else {
      searchRef.current?.focus();
    }
  }, [showNewForm]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showNewForm) {
          setShowNewForm(false);
          setForm({ ...emptyCustomerForm });
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, showNewForm]);

  const updateField = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-2xl w-[900px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white rounded-t-lg">
          <h3 className="text-sm font-semibold">
            {showNewForm ? 'New Customer' : 'Select Customer'}
          </h3>
          <button onClick={onClose} className="text-white hover:text-red-200 text-lg leading-none">&times;</button>
        </div>

        {showNewForm ? (
          /* ---- NEW CUSTOMER FORM ---- */
          <div className="p-4 overflow-auto flex-1">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {/* Name */}
              <div className="col-span-2">
                <label className="form-label block text-xs">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  className="form-input w-full"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Full name"
                />
              </div>

              {/* Mobile */}
              <div>
                <label className="form-label block text-xs">Mobile</label>
                <input
                  type="text"
                  className="form-input w-full"
                  value={form.mobile}
                  onChange={(e) => updateField('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile"
                  maxLength={10}
                />
              </div>

              {/* Email */}
              <div>
                <label className="form-label block text-xs">Email</label>
                <input
                  type="email"
                  className="form-input w-full"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="email@example.com"
                />
              </div>

              {/* Address */}
              <div className="col-span-2">
                <label className="form-label block text-xs">Address</label>
                <input
                  type="text"
                  className="form-input w-full"
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="Street address"
                />
              </div>

              {/* City */}
              <div>
                <label className="form-label block text-xs">City</label>
                <input
                  type="text"
                  className="form-input w-full"
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                />
              </div>

              {/* State */}
              <div>
                <label className="form-label block text-xs">State</label>
                <input
                  type="text"
                  className="form-input w-full"
                  value={form.state}
                  onChange={(e) => updateField('state', e.target.value)}
                />
              </div>

              {/* Pincode */}
              <div>
                <label className="form-label block text-xs">Pincode</label>
                <input
                  type="text"
                  className="form-input w-full"
                  value={form.pincode}
                  onChange={(e) => updateField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                />
              </div>

              {/* GSTIN */}
              <div>
                <label className="form-label block text-xs">GSTIN</label>
                <input
                  type="text"
                  className="form-input w-full uppercase"
                  value={form.gstin}
                  onChange={(e) => updateField('gstin', e.target.value.toUpperCase().slice(0, 15))}
                  placeholder="15-char GSTIN"
                  maxLength={15}
                />
              </div>

              {/* PAN */}
              <div>
                <label className="form-label block text-xs">PAN</label>
                <input
                  type="text"
                  className="form-input w-full uppercase"
                  value={form.pan}
                  onChange={(e) => updateField('pan', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                />
              </div>

              {/* Aadhar */}
              <div>
                <label className="form-label block text-xs">Aadhar No.</label>
                <input
                  type="text"
                  className="form-input w-full"
                  value={form.aadhar}
                  onChange={(e) => updateField('aadhar', e.target.value.replace(/\D/g, '').slice(0, 12))}
                  placeholder="12-digit Aadhar"
                  maxLength={12}
                />
              </div>

              {/* ID Proof */}
              <div>
                <label className="form-label block text-xs">ID Proof (other)</label>
                <input
                  type="text"
                  className="form-input w-full"
                  value={form.idProof}
                  onChange={(e) => updateField('idProof', e.target.value)}
                  placeholder="Passport / DL / Voter ID"
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 mt-5 justify-end">
              <button
                className="btn-outline text-xs"
                onClick={() => {
                  setShowNewForm(false);
                  setForm({ ...emptyCustomerForm });
                }}
              >
                ← Back to List
              </button>
              <button
                className="btn-success text-xs px-6"
                onClick={handleCreateCustomer}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Saving...' : '💾 Save & Select'}
              </button>
            </div>
          </div>
        ) : (
          /* ---- CUSTOMER LIST VIEW ---- */
          <>
            {/* Search Bar */}
            <div className="px-4 py-3 border-b flex gap-3 items-center">
              <label className="text-xs font-medium text-gray-600">Search:</label>
              <input
                ref={searchRef}
                type="text"
                className="form-input flex-1"
                placeholder="Type customer name, phone or GSTIN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="btn-primary text-xs"
                onClick={() => setShowNewForm(true)}
              >
                + New A/c
              </button>
              <button
                className="btn-outline text-xs border-green-500 text-green-700 hover:bg-green-50"
                onClick={() => setShowAccountMaster(true)}
                title="Open full Account Master with GST search (F6)"
              >
                📋 Account Master
              </button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="data-table w-full">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="text-left">Party Name</th>
                    <th className="text-left">Phone</th>
                    <th className="text-left">State</th>
                    <th className="text-left">City</th>
                    <th className="text-left">Address</th>
                    <th className="text-left">ID Proof</th>
                    <th className="text-right">Closing Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-400">
                        Loading customers...
                      </td>
                    </tr>
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-400">
                        No customers found
                      </td>
                    </tr>
                  ) : (
                    customers.map((c: any) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer hover:bg-blue-50"
                        onClick={() => onSelect(c.id, c.name, c)}
                      >
                        <td className="font-medium">{c.name}</td>
                        <td>{c.mobile || c.phone || '-'}</td>
                        <td>{c.state || '-'}</td>
                        <td>{c.city || '-'}</td>
                        <td className="max-w-[180px] truncate">{c.address || '-'}</td>
                        <td>{c.idProof || c.aadhar || c.pan || '-'}</td>
                        <td className="text-right">
                          <span
                            className={c.closingBalance > 0 ? 'text-red-600' : c.closingBalance < 0 ? 'text-green-600' : ''}
                          >
                            {Number(c.closingBalance || 0).toLocaleString('en-IN')} {c.balanceType !== 'NONE' ? c.balanceType : ''}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t bg-gray-50 rounded-b-lg flex justify-between items-center text-xs text-gray-500">
              <span>{customers.length} customer(s)</span>
              <span>Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px]">Esc</kbd> to close</span>
            </div>
          </>
        )}
      </div>

      {/* Account Master Modal (full form with GST search) */}
      <AccountMasterModal
        open={showAccountMaster}
        onClose={() => setShowAccountMaster(false)}
        onSaved={(account) => {
          queryClient.invalidateQueries({ queryKey: ['customer-modal-search'] });
          onSelect(account.id, account.name, account);
        }}
        forceType="CUSTOMER"
      />
    </div>
  );
}

/* ============================================================
   Item Detail Edit Modal (ORNATE NX style)
   ============================================================ */
function ItemDetailModal({
  item,
  onSave,
  onClose,
}: {
  item: SalesItem;
  onSave: (updated: SalesItem) => void;
  onClose: () => void;
}) {
  const [metalRate, setMetalRate] = useState(item.metalRate);
  const [labourRate, setLabourRate] = useState(item.labourRate);
  const [otherCharge, setOtherCharge] = useState(item.otherCharge);
  const [discountStAmt, setDiscountStAmt] = useState(item.discountStAmt);
  const [grossWeight, setGrossWeight] = useState(item.grossWeight);
  const [netWeight, setNetWeight] = useState(item.netWeight);
  const [pcs, setPcs] = useState(item.pcs);
  const [remarks, setRemarks] = useState('');

  // Derived calculations
  const purity = item.fineWeight > 0 && item.netWeight > 0
    ? (item.fineWeight / item.netWeight) * 100
    : 0;
  const fineWeight = (netWeight * purity) / 100;
  const metalAmount = fineWeight * metalRate;
  const labourAmount = netWeight * labourRate;
  const totalAmount = metalAmount + labourAmount + otherCharge - discountStAmt;
  const taxableAmount = totalAmount;
  const gstRate = 1.5; // 1.5% each for CGST & SGST
  const cgst = (taxableAmount * gstRate) / 100;
  const sgst = (taxableAmount * gstRate) / 100;
  const finalAmount = taxableAmount + cgst + sgst;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = () => {
    onSave({
      ...item,
      grossWeight,
      netWeight,
      fineWeight,
      pcs,
      metalRate,
      metalAmount,
      labourRate,
      labourAmount,
      otherCharge,
      discountStAmt,
      totalAmount,
      taxableAmount,
    });
  };

  const fieldRow = (label: string, value: string | number, highlight?: string) => (
    <div className="flex justify-between items-center py-1 border-b border-gray-100">
      <span className={`text-xs ${highlight || 'text-gray-600'}`}>{label}</span>
      <span className={`text-xs font-medium text-right ${highlight || ''}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-2xl w-[820px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white rounded-t-lg">
          <h3 className="text-sm font-semibold">
            Sales Transaction For - {item.itemName}
          </h3>
          <button onClick={onClose} className="text-white hover:text-red-200 text-lg leading-none">&times;</button>
        </div>

        <div className="flex">
          {/* Left side – Editable fields */}
          <div className="flex-1 p-4 space-y-4 border-r">
            {/* Label Info Row */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label block text-xs">Label No</label>
                <input className="form-input w-full bg-gray-100" value={item.labelNo} readOnly />
              </div>
              <div>
                <label className="form-label block text-xs">Item / Group</label>
                <input className="form-input w-full bg-gray-100" value={item.itemName} readOnly />
              </div>
              <div>
                <label className="form-label block text-xs">Pcs</label>
                <input
                  type="number"
                  className="form-input w-full text-right"
                  value={pcs}
                  onChange={(e) => setPcs(Number(e.target.value))}
                  min={1}
                />
              </div>
            </div>

            {/* Weight Row */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label block text-xs">Gross Wt.</label>
                <input
                  type="number"
                  className="form-input w-full text-right"
                  value={grossWeight}
                  onChange={(e) => setGrossWeight(Number(e.target.value))}
                  step="0.001"
                />
              </div>
              <div>
                <label className="form-label block text-xs">Net Wt.</label>
                <input
                  type="number"
                  className="form-input w-full text-right"
                  value={netWeight}
                  onChange={(e) => setNetWeight(Number(e.target.value))}
                  step="0.001"
                />
              </div>
              <div>
                <label className="form-label block text-xs">Fine Wt.</label>
                <input className="form-input w-full text-right bg-gray-100" value={fineWeight.toFixed(3)} readOnly />
              </div>
            </div>

            {/* Metal Rate & Amount */}
            <div className="border rounded p-3 bg-gray-50 space-y-2">
              <div className="text-xs font-semibold text-gray-500 mb-1">Metal</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label block text-xs">Metal Rate</label>
                  <input
                    type="number"
                    className="form-input w-full text-right bg-yellow-50 font-medium"
                    value={metalRate}
                    onChange={(e) => setMetalRate(Number(e.target.value))}
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="form-label block text-xs">Metal Amt</label>
                  <input className="form-input w-full text-right bg-green-50 font-medium" value={formatIndianNumber(metalAmount)} readOnly />
                </div>
              </div>
            </div>

            {/* Labour */}
            <div className="border rounded p-3 bg-gray-50 space-y-2">
              <div className="text-xs font-semibold text-gray-500 mb-1">Labour / Making</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label block text-xs">Lab Rate</label>
                  <input
                    type="number"
                    className="form-input w-full text-right"
                    value={labourRate}
                    onChange={(e) => setLabourRate(Number(e.target.value))}
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="form-label block text-xs">Lab Amt</label>
                  <input className="form-input w-full text-right bg-gray-100" value={formatIndianNumber(labourAmount)} readOnly />
                </div>
              </div>
            </div>

            {/* Other Charge / Discount */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label block text-xs">Other Charges</label>
                <input
                  type="number"
                  className="form-input w-full text-right"
                  value={otherCharge}
                  onChange={(e) => setOtherCharge(Number(e.target.value))}
                  step="0.01"
                />
              </div>
              <div>
                <label className="form-label block text-xs">Disc. Amt</label>
                <input
                  type="number"
                  className="form-input w-full text-right"
                  value={discountStAmt}
                  onChange={(e) => setDiscountStAmt(Number(e.target.value))}
                  step="0.01"
                />
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="form-label block text-xs">Remarks</label>
              <input
                type="text"
                className="form-input w-full"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
          </div>

          {/* Right side – Summary panel (like ORNATE NX) */}
          <div className="w-[220px] p-4 bg-gray-50 text-xs space-y-1">
            <div className="font-semibold text-gray-700 mb-2 border-b pb-1">Item Summary</div>
            {fieldRow('Label No', item.labelNo)}
            {fieldRow('Group', item.itemName)}
            {fieldRow('Gross Wt.', grossWeight.toFixed(3))}
            {fieldRow('Net Wt.', netWeight.toFixed(3))}
            {fieldRow('Fine Wt.', fineWeight.toFixed(3))}
            {fieldRow('Pcs', pcs)}
            <div className="border-t border-gray-300 mt-2 pt-2">
              <div className="font-semibold text-gray-700 mb-1">Amount</div>
            </div>
            {fieldRow('Metal Amt', formatIndianNumber(metalAmount))}
            {fieldRow('Labour Amt', formatIndianNumber(labourAmount))}
            {fieldRow('Oth. Chrg.', formatIndianNumber(otherCharge))}
            {fieldRow('Discount', formatIndianNumber(discountStAmt))}
            {fieldRow('Total Amt', formatIndianNumber(totalAmount), 'font-bold text-blue-700')}
            <div className="border-t border-gray-300 mt-2 pt-2">
              <div className="font-semibold text-gray-700 mb-1">Tax</div>
            </div>
            {fieldRow('CGST (1.5%)', formatIndianNumber(cgst), 'text-green-700')}
            {fieldRow('SGST (1.5%)', formatIndianNumber(sgst), 'text-green-700')}
            <div className="border-t border-gray-300 mt-2 pt-2">
              {fieldRow('Final Amt.', formatIndianNumber(finalAmount), 'font-bold text-lg text-blue-800')}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 px-4 py-3 border-t bg-gray-50 rounded-b-lg">
          <button onClick={onClose} className="btn-outline text-xs px-5">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-success text-xs px-5">
            ✓ OK - Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
