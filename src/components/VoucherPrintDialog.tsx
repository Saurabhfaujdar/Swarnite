import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { salesAPI } from '../lib/api';
import { formatIndianNumber, formatWeight, calculateGST, numberToWords } from '../lib/utils';
import TaxInvoice, { type InvoiceData, type InvoiceItem } from './TaxInvoice';
import toast from 'react-hot-toast';

interface VoucherPrintDialogProps {
  /** Sales voucher ID to load and print */
  voucherId: number;
  onClose: () => void;
}

// Shop / company details (would come from settings in production)
const SHOP = {
  name: 'JAIGURU JEWELS LLP',
  gstin: '09AATFJ3777G1ZO',
  bankAccountName: 'JAIGURU JEWELS LLP',
  bankAccountNo: '42206799212',
  bankIfsc: 'SBIN0011409',
  bankName: 'BHOTIA PARAO, HALDWANI',
};

const VOUCHER_FORMATS = [
  'GST Sales Voucher (A4) Jai Guru NB',
  'GST Sales Voucher (A4) Standard',
  'GST Sales Voucher (A5) Compact',
  'Estimate / Quotation (A4)',
];

const TEMPLATES = [
  'bill_orn_5',
  'bill_orn_4',
  'bill_orn_3',
  'bill_orn_2',
  'bill_orn_1',
];

/**
 * Voucher Print Dialog — matches ORNATE NX style dialog with:
 * Voucher Format, No of Copies, Template, WhatsApp Text,
 * and action buttons: Setup, Upload Doc, WhatsApp, View, Print, Close
 */
export default function VoucherPrintDialog({ voucherId, onClose }: VoucherPrintDialogProps) {
  const [voucherFormat, setVoucherFormat] = useState(VOUCHER_FORMATS[0]);
  const [copies, setCopies] = useState(1);
  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [whatsappText, setWhatsappText] = useState('invoice');
  const [showPreview, setShowPreview] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Fetch voucher data
  const { data: voucher, isLoading, error } = useQuery({
    queryKey: ['sales-voucher', voucherId],
    queryFn: () => salesAPI.get(voucherId).then((r) => r.data),
    enabled: voucherId > 0,
  });

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPreview) setShowPreview(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, showPreview]);

  // Build invoice data from voucher
  const buildInvoiceData = useCallback((): InvoiceData | null => {
    if (!voucher) return null;

    const account = voucher.account || {};
    const taxable = Number(voucher.taxableAmount || 0);
    const gst = calculateGST(taxable);
    const discount = Number(voucher.discountAmount || 0);
    const productTotal = taxable + discount;
    const amountPaid = Number(voucher.cashAmount || 0) + Number(voucher.bankAmount || 0) +
      Number(voucher.cardAmount || 0) + Number(voucher.oldGoldAmount || 0);

    const items: InvoiceItem[] = (voucher.items || []).map((item: any, idx: number) => ({
      sNo: idx + 1,
      description: item.itemName || item.item?.name || 'Jewellery Item',
      hsnCode: item.item?.hsnCode || '711311',
      purity: item.item?.purity?.name || item.label?.item?.purity?.name || 'Gold',
      pcs: item.pcs || 1,
      grossWt: Number(item.grossWeight || 0),
      netWt: Number(item.netWeight || 0),
      amount: Number(item.totalAmount || 0),
    }));

    const invoiceDate = new Date(voucher.voucherDate).toLocaleDateString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

    // Extract state code from GSTIN (first 2 chars)
    const buyerStateCode = account.gstin ? account.gstin.substring(0, 2) : '';

    return {
      sellerName: SHOP.name,
      sellerGstin: SHOP.gstin,
      buyerName: account.name || 'Walk-in Customer',
      buyerAddress: [account.address, account.city, account.state, account.pincode].filter(Boolean).join(', '),
      buyerContact: account.mobile || account.phone || '',
      buyerState: account.state || 'Uttarakhand',
      buyerStateCode,
      buyerGstin: account.gstin || '',
      buyerPan: account.pan || '',
      invoiceDate,
      invoiceNo: voucher.voucherNo || '',
      items,
      productTotal,
      discount,
      valueAfterDiscount: taxable,
      cgstRate: 1.5,
      cgstAmount: Number(voucher.cgstAmount || gst.cgst),
      sgstRate: 1.5,
      sgstAmount: Number(voucher.sgstAmount || gst.sgst),
      igstRate: 0,
      igstAmount: Number(voucher.igstAmount || 0),
      taxAmountAfterTax: Number(voucher.voucherAmount || 0),
      cashAmount: Number(voucher.cashAmount || 0),
      bankAmount: Number(voucher.bankAmount || 0),
      cardAmount: Number(voucher.cardAmount || 0),
      oldPurchaseAmount: Number(voucher.oldGoldAmount || 0),
      amountPaid,
      balance: Number(voucher.dueAmount || 0),
      bankAccountName: SHOP.bankAccountName,
      bankAccountNo: SHOP.bankAccountNo,
      bankIfsc: SHOP.bankIfsc,
      bankName: SHOP.bankName,
    };
  }, [voucher]);

  // Print function
  const handlePrint = useCallback(() => {
    const invoiceData = buildInvoiceData();
    if (!invoiceData) {
      toast.error('No voucher data to print');
      return;
    }

    // Open print in new window (no features string → opens as tab, avoids popup-blocker issues)
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print');
      return;
    }

    const itemsHtml = invoiceData.items.map((item) => `
      <tr style="border-bottom: 1px solid #e0e0e0;">
        <td style="padding: 6px 4px; text-align: center; border-right: 1px solid #eee;">${item.sNo}</td>
        <td style="padding: 6px 4px; border-right: 1px solid #eee;">${item.description}</td>
        <td style="padding: 6px 4px; text-align: center; border-right: 1px solid #eee;">${item.hsnCode}</td>
        <td style="padding: 6px 4px; text-align: center; border-right: 1px solid #eee;">${item.purity}</td>
        <td style="padding: 6px 4px; text-align: center; border-right: 1px solid #eee;">${item.pcs}</td>
        <td style="padding: 6px 4px; text-align: right; border-right: 1px solid #eee;">${formatWeight(item.grossWt)}</td>
        <td style="padding: 6px 4px; text-align: right; border-right: 1px solid #eee;">${formatWeight(item.netWt)}</td>
        <td style="padding: 6px 4px; text-align: right;">${formatIndianNumber(item.amount)}</td>
      </tr>
    `).join('');

    const totalWords = numberToWords(invoiceData.taxAmountAfterTax);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Tax Invoice - ${invoiceData.invoiceNo}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 0; padding: 20px; }
          table { width: 100%; border-collapse: collapse; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px;">
          <div style="flex: 1;">
            <div style="margin-bottom: 4px;"><strong>NAME</strong>&nbsp;&nbsp;${invoiceData.buyerName}</div>
            <div style="margin-bottom: 4px;"><strong>ADDRESS</strong>&nbsp;&nbsp;${invoiceData.buyerAddress}</div>
            <div style="margin-bottom: 4px;"><strong>CONTACT</strong>&nbsp;&nbsp;${invoiceData.buyerContact}</div>
            <div style="margin-bottom: 4px;"><strong>STATE</strong>&nbsp;&nbsp;${invoiceData.buyerState}</div>
            <div style="margin-bottom: 4px;"><strong>STATE CODE</strong>&nbsp;&nbsp;${invoiceData.buyerStateCode}</div>
            <div><strong>GSTIN</strong>&nbsp;${invoiceData.buyerGstin}&nbsp;&nbsp;&nbsp;&nbsp;<strong>PAN</strong>&nbsp;${invoiceData.buyerPan}</div>
          </div>
          <div style="text-align: right; min-width: 250px;">
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 2px;">${invoiceData.sellerName}</div>
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 6px;">TAX INVOICE</div>
            <div style="margin-bottom: 2px;"><strong>DATE</strong>&nbsp;${invoiceData.invoiceDate}</div>
            <div style="margin-bottom: 2px;"><strong>GSTIN NO.</strong>&nbsp;${invoiceData.sellerGstin}</div>
            <div><strong>INVOICE NO.</strong>&nbsp;${invoiceData.invoiceNo}</div>
          </div>
        </div>

        <!-- Items Table -->
        <table style="margin-bottom: 10px;">
          <thead>
            <tr style="background: #f5f5f5; border-bottom: 2px solid #000; border-top: 1px solid #000;">
              <th style="padding: 6px 4px; text-align: left; border-right: 1px solid #ccc; width: 40px;">S. No.</th>
              <th style="padding: 6px 4px; text-align: left; border-right: 1px solid #ccc;">DESCRIPTION OF GOODS</th>
              <th style="padding: 6px 4px; text-align: center; border-right: 1px solid #ccc; width: 70px;">HSN CODE</th>
              <th style="padding: 6px 4px; text-align: center; border-right: 1px solid #ccc; width: 60px;">PURITY</th>
              <th style="padding: 6px 4px; text-align: center; border-right: 1px solid #ccc; width: 40px;">PCS</th>
              <th style="padding: 6px 4px; text-align: right; border-right: 1px solid #ccc; width: 70px;">Gross Wt.</th>
              <th style="padding: 6px 4px; text-align: right; border-right: 1px solid #ccc; width: 70px;">Net Wt.</th>
              <th style="padding: 6px 4px; text-align: right; width: 90px;">AMOUNT<br/><span style="font-size:10px">(Rs.) (P.)</span></th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <!-- Rate / Payment / Tax Section -->
        <div style="display: flex; border-top: 2px solid #000;">
          <div style="flex: 1; padding: 8px; border-right: 1px solid #ccc;">
            <div style="margin-bottom: 6px;"><strong>RATE</strong></div>
            <div style="margin-bottom: 6px;"><strong>Advance</strong></div>
            <div style="margin-bottom: 4px;"><strong>PAYMENT DETAILS :-</strong></div>
            ${invoiceData.cashAmount > 0 ? `<div style="padding-left: 12px; margin-bottom: 4px;">Cash: <span style="float: right; margin-right: 10px;">${formatIndianNumber(invoiceData.cashAmount)}</span></div>` : ''}
            ${invoiceData.bankAmount > 0 ? `<div style="padding-left: 12px; margin-bottom: 4px;">Bank: <span style="float: right; margin-right: 10px;">${formatIndianNumber(invoiceData.bankAmount)}</span></div>` : ''}
            ${invoiceData.cardAmount > 0 ? `<div style="padding-left: 12px; margin-bottom: 4px;">Card: <span style="float: right; margin-right: 10px;">${formatIndianNumber(invoiceData.cardAmount)}</span></div>` : ''}
            <div style="margin-top: 8px;"><strong>OLD PURCHASE :-</strong>${invoiceData.oldPurchaseAmount > 0 ? `<span style="float: right; margin-right: 10px;">${formatIndianNumber(invoiceData.oldPurchaseAmount)}</span>` : ''}</div>
          </div>
          <div style="width: 280px; padding: 8px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span><strong>Product total value</strong></span><span>${formatIndianNumber(invoiceData.productTotal)}</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span><strong>Discount</strong></span><span>${invoiceData.discount > 0 ? formatIndianNumber(invoiceData.discount) : ''}</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; border-top: 1px solid #ccc; padding-top: 4px;"><span><strong>Value after discount</strong></span><span>${formatIndianNumber(invoiceData.valueAfterDiscount)}</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Add CGST @ ${invoiceData.cgstRate} %</span><span>${formatIndianNumber(invoiceData.cgstAmount)}</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Add SGST @ ${invoiceData.sgstRate} %</span><span>${formatIndianNumber(invoiceData.sgstAmount)}</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Add IGST @ ${invoiceData.igstRate} %</span><span>${invoiceData.igstAmount > 0 ? formatIndianNumber(invoiceData.igstAmount) : ''}</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; border-top: 2px solid #000; padding-top: 4px; font-weight: bold;"><span>Tax amount after tax</span><span>${formatIndianNumber(invoiceData.taxAmountAfterTax)}</span></div>
            <div style="font-size: 11px;"><strong>Total amount in words</strong> ${totalWords}</div>
          </div>
        </div>

        <!-- Bank Details / Amount Paid -->
        <div style="display: flex; border-top: 2px solid #000;">
          <div style="flex: 1; padding: 8px; border-right: 1px solid #ccc;">
            <div style="font-weight: bold; margin-bottom: 6px;">BANK ACCOUNT DETAILS :-</div>
            <div style="margin-bottom: 2px;">Bank account name: ${invoiceData.bankAccountName}</div>
            <div style="margin-bottom: 2px;">Bank account no: ${invoiceData.bankAccountNo}</div>
            <div style="margin-bottom: 2px;">Bank branch IFSC: ${invoiceData.bankIfsc}</div>
            <div style="margin-bottom: 2px;">Bank name: ${invoiceData.bankName}</div>
          </div>
          <div style="width: 280px; padding: 8px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-weight: bold;"><span>Amount Paid</span><span>${formatIndianNumber(invoiceData.amountPaid)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span><strong>Balance</strong></span><span>${invoiceData.balance !== 0 ? formatIndianNumber(invoiceData.balance) : ''}</span></div>
          </div>
        </div>

        <!-- Terms -->
        <div style="border-top: 2px solid #000; padding: 8px;">
          <div style="font-weight: bold; margin-bottom: 4px;">TERMS & CONDITIONS</div>
          <div style="font-size: 9px; line-height: 1.4; color: #333;">
            <p style="margin: 2px 0;">&#8226; The consumer can get the purity of the hallmarked jewellery / artefacts verified from any of the BIS recognized A&H centre.</p>
            <p style="margin: 2px 0;">&#8226; Hallmarking Charges @Rs.35/- per piece.</p>
            <p style="margin: 2px 0;">&#8226; The above value includes gold value, cost of stones, product making charges, GST & other taxes (as applicable).</p>
            <p style="margin: 2px 0;">&#8226; 24% interest will be charged on the bill if not paid as per the payment terms.</p>
            <p style="margin: 2px 0;">&#8226; All disputes subject to Haldwani jurisdiction only.</p>
            <p style="margin: 2px 0;">&#8226; E. & O. E.</p>
          </div>
          <div style="text-align: right; font-style: italic; font-size: 11px; margin-top: 4px;">Certified that the particulars given above are true & correct</div>
        </div>

        <!-- Signatures -->
        <div style="display: flex; justify-content: space-between; padding: 30px 20px 10px; border-top: 1px solid #ccc;">
          <div style="font-weight: bold;">Authorised Signature</div>
          <div style="font-weight: bold;">Customer Signature</div>
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();

    // Focus the window so the print dialog appears in front, not behind the main window
    printWindow.focus();

    // Wait for the browser to finish parsing and rendering, then print
    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        toast.error('Print failed — please try again');
      }
    };

    // Use the window's load event (fires when document.write content finishes loading)
    printWindow.addEventListener('load', doPrint);
    // Fallback in case 'load' doesn't fire (some browsers with document.write)
    setTimeout(doPrint, 1000);
  }, [buildInvoiceData]);

  // View invoice in-page
  const handleView = useCallback(() => {
    if (!voucher) {
      toast.error('No voucher data');
      return;
    }
    setShowPreview(true);
  }, [voucher]);

  // WhatsApp share — open whatsapp with a text message
  const handleWhatsApp = useCallback(() => {
    if (!voucher) return;
    const account = voucher.account || {};
    const phone = (account.mobile || account.phone || '').replace(/\D/g, '');
    const msg = encodeURIComponent(
      `Dear ${account.name || 'Customer'},\n\n` +
      `Your ${whatsappText} ${voucher.voucherNo} dated ${new Date(voucher.voucherDate).toLocaleDateString('en-IN')} ` +
      `for Rs. ${formatIndianNumber(voucher.voucherAmount)} has been generated.\n\n` +
      `Thank you for shopping at ${SHOP.name}!`
    );
    const url = phone
      ? `https://wa.me/91${phone}?text=${msg}`
      : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
  }, [voucher, whatsappText]);

  const invoiceData = buildInvoiceData();

  return (
    <>
      {/* ── Main Dialog (Voucher Print) ─────────────────────── */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-lg shadow-2xl w-[520px] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b rounded-t-lg">
            <h3 className="text-sm font-semibold">🖨️ Voucher Print</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-red-500 text-lg leading-none">&times;</button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {isLoading && (
              <div className="text-center text-gray-500 py-4">Loading voucher data...</div>
            )}
            {error && (
              <div className="text-center text-red-500 py-4">Failed to load voucher</div>
            )}

            {voucher && (
              <>
                {/* Voucher info banner */}
                <div className="text-center text-sm bg-blue-50 rounded p-2 border border-blue-200">
                  <span className="font-bold text-blue-700">{voucher.voucherNo}</span>
                  <span className="mx-2 text-gray-400">|</span>
                  <span>{voucher.account?.name || 'Walk-in'}</span>
                  <span className="mx-2 text-gray-400">|</span>
                  <span className="font-bold">{formatIndianNumber(voucher.voucherAmount)} Cr</span>
                </div>

                {/* Format & Template row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label block text-xs font-semibold">Voucher Format</label>
                    <select
                      className="form-select w-full"
                      value={voucherFormat}
                      onChange={(e) => setVoucherFormat(e.target.value)}
                    >
                      {VOUCHER_FORMATS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label block text-xs font-semibold">Template</label>
                    <select
                      className="form-select w-full"
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                    >
                      {TEMPLATES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Copies row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label block text-xs font-semibold">No. Of Copies</label>
                    <input
                      type="number"
                      className="form-input w-full"
                      value={copies}
                      onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))}
                      min={1}
                      max={5}
                    />
                  </div>
                </div>

                {/* WhatsApp Text */}
                <div>
                  <label className="form-label block text-xs font-semibold">Whatsapp Text</label>
                  <textarea
                    className="form-input w-full"
                    rows={2}
                    value={whatsappText}
                    onChange={(e) => setWhatsappText(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50 rounded-b-lg">
            <div className="flex gap-2">
              <button className="btn-outline text-xs px-3 py-2" title="Setup">
                ⚙️ Setup
              </button>
            </div>
            <div className="flex gap-2">
              <button className="btn-outline text-xs px-3 py-2" title="Upload Document">
                📤 Upload Doc
              </button>
              <button
                className="btn-outline text-xs px-3 py-2 border-green-500 text-green-700 hover:bg-green-50"
                onClick={handleWhatsApp}
                disabled={!voucher}
                title="Share via WhatsApp"
              >
                💬 Whatsapp
              </button>
              <button
                className="btn-primary text-xs px-3 py-2"
                onClick={handleView}
                disabled={!voucher}
                title="Preview invoice"
              >
                👁️ View
              </button>
              <button
                className="btn-success text-xs px-3 py-2"
                onClick={handlePrint}
                disabled={!voucher}
                title="Print invoice"
              >
                🖨️ Print
              </button>
              <button
                className="btn-danger text-xs px-3 py-2"
                onClick={onClose}
              >
                ✕ Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Invoice Preview Modal ───────────────────────────── */}
      {showPreview && invoiceData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg shadow-2xl flex flex-col" style={{ width: '860px', maxHeight: '95vh' }}>
            {/* Preview header */}
            <div className="flex items-center justify-between px-4 py-2 bg-blue-600 text-white rounded-t-lg">
              <h3 className="text-sm font-semibold">
                Invoice Preview — {invoiceData.invoiceNo}
              </h3>
              <div className="flex gap-2">
                <button
                  className="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1 rounded"
                  onClick={handlePrint}
                >
                  🖨️ Print
                </button>
                <button
                  className="text-white hover:text-red-200 text-lg leading-none"
                  onClick={() => setShowPreview(false)}
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Scrollable invoice content */}
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              <div className="bg-white shadow-lg mx-auto" style={{ maxWidth: '210mm' }}>
                <TaxInvoice ref={invoiceRef} data={invoiceData} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
