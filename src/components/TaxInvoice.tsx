import { forwardRef } from 'react';
import { formatIndianNumber, formatWeight, numberToWords } from '../lib/utils';

export interface InvoiceItem {
  sNo: number;
  description: string;
  hsnCode: string;
  purity: string;
  pcs: number;
  grossWt: number;
  netWt: number;
  amount: number;
}

export interface InvoiceData {
  // Seller info
  sellerName: string;
  sellerGstin: string;
  // Buyer info
  buyerName: string;
  buyerAddress: string;
  buyerContact: string;
  buyerState: string;
  buyerStateCode: string;
  buyerGstin: string;
  buyerPan: string;
  // Invoice details
  invoiceDate: string;
  invoiceNo: string;
  // Items
  items: InvoiceItem[];
  // Totals
  productTotal: number;
  discount: number;
  valueAfterDiscount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  taxAmountAfterTax: number;
  // Payment
  cashAmount: number;
  bankAmount: number;
  cardAmount: number;
  oldPurchaseAmount: number;
  amountPaid: number;
  balance: number;
  // Bank details
  bankAccountName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankName: string;
}

/**
 * Printable Tax Invoice component styled to match ORNATE NX / Jaiguru Jewels format.
 * Rendered inside a hidden container, used by window.print() or html2canvas.
 */
const TaxInvoice = forwardRef<HTMLDivElement, { data: InvoiceData }>(({ data }, ref) => {
  const totalAmountWords = numberToWords(data.taxAmountAfterTax);

  return (
    <div ref={ref} className="tax-invoice-print" style={{ fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#000', background: '#fff', padding: '20px', width: '210mm', margin: '0 auto' }}>
      {/* ── Page 1 ──────────────────────────────────────────── */}
      {/* Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '10px' }}>
        {/* Left: Buyer details */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: '4px' }}>
            <strong>NAME</strong>&nbsp;&nbsp;{data.buyerName}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>ADDRESS</strong>&nbsp;&nbsp;{data.buyerAddress}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>CONTACT</strong>&nbsp;&nbsp;{data.buyerContact}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>STATE</strong>&nbsp;&nbsp;{data.buyerState}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>STATE CODE</strong>&nbsp;&nbsp;{data.buyerStateCode}
          </div>
          <div>
            <strong>GSTIN</strong>&nbsp;{data.buyerGstin}&nbsp;&nbsp;&nbsp;&nbsp;
            <strong>PAN</strong>&nbsp;{data.buyerPan}
          </div>
        </div>

        {/* Right: Seller + Invoice info */}
        <div style={{ textAlign: 'right', minWidth: '250px' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '2px' }}>{data.sellerName}</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '6px' }}>TAX INVOICE</div>
          <div style={{ marginBottom: '2px' }}>
            <strong>DATE</strong>&nbsp;{data.invoiceDate}
          </div>
          <div style={{ marginBottom: '2px' }}>
            <strong>GSTIN NO.</strong>&nbsp;{data.sellerGstin}
          </div>
          <div>
            <strong>INVOICE NO.</strong>&nbsp;{data.invoiceNo}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <thead>
          <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #000', borderTop: '1px solid #000' }}>
            <th style={{ padding: '6px 4px', textAlign: 'left', borderRight: '1px solid #ccc', width: '40px' }}>S. No.</th>
            <th style={{ padding: '6px 4px', textAlign: 'left', borderRight: '1px solid #ccc' }}>DESCRIPTION OF GOODS</th>
            <th style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #ccc', width: '70px' }}>HSN CODE</th>
            <th style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #ccc', width: '60px' }}>PURITY</th>
            <th style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #ccc', width: '40px' }}>PCS</th>
            <th style={{ padding: '6px 4px', textAlign: 'right', borderRight: '1px solid #ccc', width: '70px' }}>Gross Wt.</th>
            <th style={{ padding: '6px 4px', textAlign: 'right', borderRight: '1px solid #ccc', width: '70px' }}>Net Wt.</th>
            <th style={{ padding: '6px 4px', textAlign: 'right', width: '90px' }}>
              <div>AMOUNT</div>
              <div style={{ fontSize: '10px' }}>(Rs.) (P.)</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.sNo} style={{ borderBottom: '1px solid #e0e0e0' }}>
              <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #eee' }}>{item.sNo}</td>
              <td style={{ padding: '6px 4px', borderRight: '1px solid #eee' }}>{item.description}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #eee' }}>{item.hsnCode}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #eee' }}>{item.purity}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #eee' }}>{item.pcs}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right', borderRight: '1px solid #eee' }}>{formatWeight(item.grossWt)}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right', borderRight: '1px solid #eee' }}>{formatWeight(item.netWt)}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{formatIndianNumber(item.amount)}</td>
            </tr>
          ))}
          {/* Fill empty rows for minimum height look */}
          {data.items.length < 5 && Array.from({ length: 5 - data.items.length }).map((_, i) => (
            <tr key={`empty-${i}`} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px 4px', borderRight: '1px solid #eee' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #eee' }}></td>
              <td style={{ borderRight: '1px solid #eee' }}></td>
              <td style={{ borderRight: '1px solid #eee' }}></td>
              <td style={{ borderRight: '1px solid #eee' }}></td>
              <td style={{ borderRight: '1px solid #eee' }}></td>
              <td style={{ borderRight: '1px solid #eee' }}></td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Rate / Payment / Tax Summary Section */}
      <div style={{ display: 'flex', gap: '0', borderTop: '2px solid #000' }}>
        {/* Left: Rate, Advance, Payment Details, Old Purchase */}
        <div style={{ flex: 1, padding: '8px', borderRight: '1px solid #ccc' }}>
          <div style={{ marginBottom: '6px' }}>
            <strong>RATE</strong>
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Advance</strong>
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>PAYMENT DETAILS :-</strong>
          </div>
          <div style={{ paddingLeft: '12px', marginBottom: '4px' }}>
            Cash: <span style={{ float: 'right', marginRight: '10px' }}>{data.cashAmount > 0 ? formatIndianNumber(data.cashAmount) : ''}</span>
          </div>
          {data.bankAmount > 0 && (
            <div style={{ paddingLeft: '12px', marginBottom: '4px' }}>
              Bank: <span style={{ float: 'right', marginRight: '10px' }}>{formatIndianNumber(data.bankAmount)}</span>
            </div>
          )}
          {data.cardAmount > 0 && (
            <div style={{ paddingLeft: '12px', marginBottom: '4px' }}>
              Card: <span style={{ float: 'right', marginRight: '10px' }}>{formatIndianNumber(data.cardAmount)}</span>
            </div>
          )}
          <div style={{ marginTop: '8px' }}>
            <strong>OLD PURCHASE :-</strong>
            {data.oldPurchaseAmount > 0 && (
              <span style={{ float: 'right', marginRight: '10px' }}>{formatIndianNumber(data.oldPurchaseAmount)}</span>
            )}
          </div>
        </div>

        {/* Right: Totals and tax breakdown */}
        <div style={{ width: '280px', padding: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span><strong>Product total value</strong></span>
            <span>{formatIndianNumber(data.productTotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span><strong>Discount</strong></span>
            <span>{data.discount > 0 ? formatIndianNumber(data.discount) : ''}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', borderTop: '1px solid #ccc', paddingTop: '4px' }}>
            <span><strong>Value after discount</strong></span>
            <span>{formatIndianNumber(data.valueAfterDiscount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>Add CGST @ {data.cgstRate} %</span>
            <span>{formatIndianNumber(data.cgstAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>Add SGST @ {data.sgstRate} %</span>
            <span>{formatIndianNumber(data.sgstAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Add IGST @ {data.igstRate} %</span>
            <span>{data.igstAmount > 0 ? formatIndianNumber(data.igstAmount) : ''}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', borderTop: '2px solid #000', paddingTop: '4px', fontWeight: 'bold' }}>
            <span>Tax amount after tax</span>
            <span>{formatIndianNumber(data.taxAmountAfterTax)}</span>
          </div>
          <div style={{ fontSize: '11px', marginBottom: '8px' }}>
            <strong>Total amount in words</strong> {totalAmountWords}
          </div>
        </div>
      </div>

      {/* Amount Paid Row */}
      <div style={{ display: 'flex', borderTop: '2px solid #000' }}>
        {/* Left: Bank Account Details */}
        <div style={{ flex: 1, padding: '8px', borderRight: '1px solid #ccc' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>BANK ACCOUNT DETAILS :-</div>
          <div style={{ marginBottom: '2px' }}>Bank account name: {data.bankAccountName}</div>
          <div style={{ marginBottom: '2px' }}>Bank account no: {data.bankAccountNo}</div>
          <div style={{ marginBottom: '2px' }}>Bank branch IFSC: {data.bankIfsc}</div>
          <div style={{ marginBottom: '2px' }}>Bank name: {data.bankName}</div>
        </div>

        {/* Right: Amount Paid / Balance */}
        <div style={{ width: '280px', padding: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontWeight: 'bold' }}>
            <span>Amount Paid</span>
            <span>{formatIndianNumber(data.amountPaid)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span><strong>Balance</strong></span>
            <span>{data.balance !== 0 ? formatIndianNumber(data.balance) : ''}</span>
          </div>
        </div>
      </div>

      {/* Terms & Conditions */}
      <div style={{ borderTop: '2px solid #000', padding: '8px', marginBottom: '0' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>TERMS & CONDITIONS</div>
        <div style={{ fontSize: '9px', lineHeight: '1.4', color: '#333' }}>
          <p style={{ margin: '2px 0' }}>• The consumer can get the purity of the hallmarked jewellery / artefacts verified from any of the BIS recognized A&H centre. The list of BIS recognized A&H centre along with address and contact details is available on the website www.bis.gov.in</p>
          <p style={{ margin: '2px 0' }}>• Hallmarking Charges @Rs.35/- per piece.</p>
          <p style={{ margin: '2px 0' }}>• The above value includes gold value, cost of stones, product making charges, GST & other taxes (as applicable).</p>
          <p style={{ margin: '2px 0' }}>• 24% interest will be charged on the bill if not paid as per the payment terms.</p>
          <p style={{ margin: '2px 0' }}>• All disputes subject to Haldwani jurisdiction only.</p>
          <p style={{ margin: '2px 0' }}>• E. & O. E.</p>
        </div>
        <div style={{ textAlign: 'right', fontStyle: 'italic', fontSize: '11px', marginTop: '4px' }}>
          Certified that the particulars given above are true & correct
        </div>
      </div>

      {/* Signatures */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '30px 20px 10px', borderTop: '1px solid #ccc' }}>
        <div style={{ fontWeight: 'bold' }}>Authorised Signature</div>
        <div style={{ fontWeight: 'bold' }}>Customer Signature</div>
      </div>
    </div>
  );
});

TaxInvoice.displayName = 'TaxInvoice';
export default TaxInvoice;
