import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesAPI } from '../../lib/api';
import { formatIndianNumber, formatWeight } from '../../lib/utils';
import { useState, useEffect } from 'react';
import VoucherPrintDialog from '../../components/VoucherPrintDialog';
import AccountMasterModal from '../../components/AccountMasterModal';
import toast from 'react-hot-toast';

export default function SalesVoucherDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showPrint, setShowPrint] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Edit state — payment
  const [editCash, setEditCash] = useState(0);
  const [editBank, setEditBank] = useState(0);
  const [editCard, setEditCard] = useState(0);
  const [editUpi, setEditUpi] = useState(0);
  const [editNarration, setEditNarration] = useState('');

  // Edit state — amounts
  const [editDiscount, setEditDiscount] = useState(0);
  const [editRounding, setEditRounding] = useState(0);

  const { data: voucher, isLoading, error } = useQuery({
    queryKey: ['sales-voucher', id],
    queryFn: () => salesAPI.get(Number(id)).then((r) => r.data),
    enabled: !!id,
  });

  // Populate edit fields when voucher loads or edit mode starts
  useEffect(() => {
    if (voucher && editing) {
      setEditCash(Number(voucher.cashAmount || 0));
      setEditBank(Number(voucher.bankAmount || 0));
      setEditCard(Number(voucher.cardAmount || 0));
      setEditUpi(Number(voucher.upiAmount || 0));
      setEditNarration(voucher.narration || '');
      setEditDiscount(Number(voucher.discountAmount || 0));
      setEditRounding(Number(voucher.roundingDiscount || 0));
    }
  }, [voucher, editing]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => salesAPI.update(Number(id), data),
    onSuccess: () => {
      toast.success('Voucher updated');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['sales-voucher', id] });
      queryClient.invalidateQueries({ queryKey: ['sales-list'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading voucher...</div>
      </div>
    );
  }

  if (error || !voucher) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-red-500 text-lg">Voucher not found</div>
        <button className="btn-primary" onClick={() => navigate('/sales/list')}>Back to List</button>
      </div>
    );
  }

  const account = voucher.account || {};
  const items = voucher.items || [];
  const isCancelled = voucher.status === 'CANCELLED' || voucher.status === 'CLOSED';
  const isClosedStatus = voucher.status === 'CLOSED';

  // Payment sources (from voucher or edit state)
  const cash = editing ? editCash : Number(voucher.cashAmount || 0);
  const bank = editing ? editBank : Number(voucher.bankAmount || 0);
  const card = editing ? editCard : Number(voucher.cardAmount || 0);
  const upi = editing ? editUpi : Number(voucher.upiAmount || 0);
  const oldGold = Number(voucher.oldGoldAmount || 0);
  const advance = Number(voucher.advanceAmount || 0);
  // Amount calculations
  const taxableGst = Number(voucher.taxableAmount || 0) + Number(voucher.cgstAmount || 0) + Number(voucher.sgstAmount || 0);
  const discount = editing ? editDiscount : Number(voucher.discountAmount || 0);
  const rounding = editing ? editRounding : Number(voucher.roundingDiscount || 0);
  const voucherAmt = editing ? Math.round(taxableGst - editDiscount - editRounding) : Number(voucher.voucherAmount || 0);
  const editPayment = cash + bank + card + upi + oldGold + advance;
  const editDue = voucherAmt - editPayment;
  const payment = editing ? editPayment : Number(voucher.paymentAmount || 0);
  const due = editing ? editDue : Number(voucher.dueAmount || 0);
  const previousOs = Number(voucher.previousOs || 0);
  const editFinalDue = editDue + previousOs + advance;
  const finalDue = editing ? editFinalDue : Number(voucher.finalDue || 0);

  const handleSaveEdit = () => {
    if (editPayment > voucherAmt) return toast.error('Total payment cannot exceed voucher amount');
    updateMutation.mutate({
      cashAmount: editCash,
      bankAmount: editBank,
      cardAmount: editCard,
      upiAmount: editUpi,
      oldGoldAmount: oldGold,
      advanceAmount: advance,
      paymentAmount: editPayment,
      dueAmount: editDue,
      previousOs,
      finalDue: editFinalDue,
      narration: editNarration,
      discountAmount: editDiscount,
      roundingDiscount: editRounding,
      voucherAmount: voucherAmt,
    });
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/sales/list')} className="text-gray-500 hover:text-gray-700 text-lg" title="Back to list">&larr;</button>
            <span className="font-bold text-base">{voucher.voucherNo}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              voucher.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
              voucher.status === 'CLOSED' ? 'bg-gray-200 text-gray-700' :
              'bg-green-100 text-green-800'
            }`}>
              {voucher.status}
            </span>
          </div>
          <div className="flex gap-2">
            {!isCancelled && !editing && (
              <button className="btn-secondary text-xs" onClick={() => setEditing(true)}>✏️ Edit Voucher</button>
            )}
            {editing && (
              <>
                <button className="btn-primary text-xs" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : '💾 Save'}
                </button>
                <button className="btn-secondary text-xs" onClick={() => setEditing(false)}>Cancel</button>
              </>
            )}
            <button className="btn-primary text-xs" onClick={() => setShowPrint(true)}>🖨️ Print / Preview</button>
            <button className="btn-secondary text-xs" onClick={() => navigate('/sales/list')}>Back to List</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Customer & Voucher Info */}
        <div className="panel">
          <div className="panel-header text-sm flex justify-between items-center">
            <span>Customer & Voucher</span>
            {!isCancelled && (
              <button className="text-blue-600 hover:text-blue-800 text-xs" onClick={() => setShowAccountModal(true)} title="Edit customer details">✏️ Edit</button>
            )}
          </div>
          <div className="panel-body space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Customer</span>
              <span className="font-medium text-right">{account.name || 'Walk-in'}</span>
            </div>
            {account.mobile && (
              <div className="flex justify-between">
                <span className="text-gray-500">Mobile</span>
                <span>{account.mobile}</span>
              </div>
            )}
            {account.address && (
              <div className="flex justify-between">
                <span className="text-gray-500">Address</span>
                <span className="text-right max-w-[60%]">{[account.address, account.city, account.state].filter(Boolean).join(', ')}</span>
              </div>
            )}
            {account.gstin && (
              <div className="flex justify-between">
                <span className="text-gray-500">GSTIN</span>
                <span className="font-mono text-[11px]">{account.gstin}</span>
              </div>
            )}
            <div className="border-t pt-2 mt-2"></div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span>{new Date(voucher.voucherDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Salesman</span>
              <span>{voucher.salesman?.name || '-'}</span>
            </div>
            {voucher.narration && (
              <div className="flex justify-between">
                <span className="text-gray-500">Narration</span>
                <span className="text-right max-w-[60%]">{voucher.narration}</span>
              </div>
            )}
            {voucher.reference && (
              <div className="flex justify-between">
                <span className="text-gray-500">Reference</span>
                <span>{voucher.reference}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Created by</span>
              <span>{voucher.user?.fullName || '-'}</span>
            </div>
          </div>
        </div>

        {/* Amount Summary */}
        <div className="panel">
          <div className="panel-header text-sm">Amount Summary</div>
          <div className="panel-body space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Metal Amount</span>
              <span>{formatIndianNumber(voucher.metalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Labour Amount</span>
              <span>{formatIndianNumber(voucher.labourAmount)}</span>
            </div>
            {Number(voucher.otherCharge) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Other Charges</span>
                <span>{formatIndianNumber(voucher.otherCharge)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Taxable Amount</span>
              <span>{formatIndianNumber(voucher.taxableAmount)}</span>
            </div>
            <div className="flex justify-between text-blue-700">
              <span>CGST</span>
              <span>{formatIndianNumber(voucher.cgstAmount)}</span>
            </div>
            <div className="flex justify-between text-blue-700">
              <span>SGST</span>
              <span>{formatIndianNumber(voucher.sgstAmount)}</span>
            </div>
            {editing ? (
              <>
                <div className="flex justify-between items-center text-orange-600">
                  <span>Discount</span>
                  <input type="number" className="input w-28 text-right text-xs" value={editDiscount} onChange={e => setEditDiscount(Number(e.target.value) || 0)} />
                </div>
                <div className="flex justify-between items-center text-orange-600">
                  <span>Rounding</span>
                  <input type="number" className="input w-28 text-right text-xs" value={editRounding} onChange={e => setEditRounding(Number(e.target.value) || 0)} />
                </div>
              </>
            ) : (
              <>
                {discount > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Discount</span>
                    <span>-{formatIndianNumber(discount)}</span>
                  </div>
                )}
                {rounding > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Rounding</span>
                    <span>-{formatIndianNumber(rounding)}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
              <span>Voucher Amount</span>
              <span className="text-green-700">{formatIndianNumber(voucherAmt)}</span>
            </div>
          </div>
        </div>

        {/* Payment Breakdown */}
        <div className="panel">
          <div className="panel-header text-sm">Payment Details</div>
          <div className="panel-body space-y-2 text-xs">
            {editing ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Cash</span>
                  <input type="number" className="input w-28 text-right text-xs" value={editCash} onChange={e => setEditCash(Number(e.target.value) || 0)} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Bank</span>
                  <input type="number" className="input w-28 text-right text-xs" value={editBank} onChange={e => setEditBank(Number(e.target.value) || 0)} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Card</span>
                  <input type="number" className="input w-28 text-right text-xs" value={editCard} onChange={e => setEditCard(Number(e.target.value) || 0)} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">UPI</span>
                  <input type="number" className="input w-28 text-right text-xs" value={editUpi} onChange={e => setEditUpi(Number(e.target.value) || 0)} />
                </div>
                {oldGold > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Old Gold</span>
                    <span>{formatIndianNumber(oldGold)}</span>
                  </div>
                )}
                {advance > 0 && (
                  <div className="flex justify-between text-purple-700">
                    <span>Advance Used</span>
                    <span>{formatIndianNumber(advance)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t pt-2 mt-1">
                  <span>Total Paid</span>
                  <span className="text-green-700">{formatIndianNumber(editPayment)}</span>
                </div>
                {editDue > 0 && (
                  <div className="flex justify-between font-bold text-red-600">
                    <span>Due Amount</span>
                    <span>{formatIndianNumber(editDue)}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-1"></div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Previous O/S</span>
                  <span className={previousOs > 0 ? 'text-red-600' : previousOs < 0 ? 'text-green-600' : ''}>
                    {formatIndianNumber(Math.abs(previousOs))} {previousOs > 0 ? 'DR' : previousOs < 0 ? 'CR' : ''}
                  </span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Final Due</span>
                  <span className={editFinalDue > 0 ? 'text-red-600' : editFinalDue < 0 ? 'text-green-600' : ''}>
                    {formatIndianNumber(Math.abs(editFinalDue))} {editFinalDue > 0 ? 'DR' : editFinalDue < 0 ? 'CR' : ''}
                  </span>
                </div>
                <div className="border-t pt-2 mt-1">
                  <label className="text-gray-500 block mb-1">Narration</label>
                  <input type="text" className="input w-full text-xs" value={editNarration} onChange={e => setEditNarration(e.target.value)} placeholder="Narration / notes" />
                </div>
              </>
            ) : (
              <>
                {cash > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cash</span>
                    <span>{formatIndianNumber(cash)}</span>
                  </div>
                )}
                {bank > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Bank</span>
                    <span>{formatIndianNumber(bank)}</span>
                  </div>
                )}
                {card > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Card</span>
                    <span>{formatIndianNumber(card)}</span>
                  </div>
                )}
                {upi > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">UPI</span>
                    <span>{formatIndianNumber(upi)}</span>
                  </div>
                )}
                {oldGold > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Old Gold</span>
                    <span>{formatIndianNumber(oldGold)}</span>
                  </div>
                )}
                {advance > 0 && (
                  <div className="flex justify-between text-purple-700">
                    <span>Advance Used</span>
                    <span>{formatIndianNumber(advance)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t pt-2 mt-1">
                  <span>Total Paid</span>
                  <span className="text-green-700">{formatIndianNumber(payment)}</span>
                </div>
                {due > 0 && (
                  <div className="flex justify-between font-bold text-red-600">
                    <span>Due Amount</span>
                    <span>{formatIndianNumber(due)}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-1"></div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Previous O/S</span>
                  <span className={previousOs > 0 ? 'text-red-600' : previousOs < 0 ? 'text-green-600' : ''}>
                    {formatIndianNumber(Math.abs(previousOs))} {previousOs > 0 ? 'DR' : previousOs < 0 ? 'CR' : ''}
                  </span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Final Due</span>
                  <span className={finalDue > 0 ? 'text-red-600' : finalDue < 0 ? 'text-green-600' : ''}>
                    {formatIndianNumber(Math.abs(finalDue))} {finalDue > 0 ? 'DR' : finalDue < 0 ? 'CR' : ''}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="panel flex-1 overflow-auto">
        <div className="panel-header text-sm flex justify-between">
          <span>Items ({items.length})</span>
          <span className="text-gray-400 text-xs font-normal">
            {formatWeight(voucher.totalGrossWeight)} gross / {formatWeight(voucher.totalNetWeight)} net / {voucher.totalPcs} pcs
          </span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Label No</th>
              <th>Item Name</th>
              <th className="text-right">Pcs</th>
              <th className="text-right">Gross Wt</th>
              <th className="text-right">Less Wt</th>
              <th className="text-right">Net Wt</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Metal Amt</th>
              <th className="text-right">Labour</th>
              <th className="text-right">Other</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={item.id}>
                <td>{idx + 1}</td>
                <td className="font-mono text-xs">{item.labelNo || item.label?.labelNo || '-'}</td>
                <td className="font-medium">{item.itemName || item.item?.name || '-'}</td>
                <td className="text-right">{item.pcs}</td>
                <td className="text-right">{formatWeight(item.grossWeight)}</td>
                <td className="text-right">{Number(item.lessWeight) > 0 ? formatWeight(item.lessWeight) : '-'}</td>
                <td className="text-right">{formatWeight(item.netWeight)}</td>
                <td className="text-right">{formatIndianNumber(item.metalRate)}</td>
                <td className="text-right">{formatIndianNumber(item.metalAmount)}</td>
                <td className="text-right">{formatIndianNumber(item.labourAmount)}</td>
                <td className="text-right">{Number(item.otherCharge) > 0 ? formatIndianNumber(item.otherCharge) : '-'}</td>
                <td className="text-right font-bold">{formatIndianNumber(item.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
          {items.length > 1 && (
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td colSpan={3}>Total</td>
                <td className="text-right">{voucher.totalPcs}</td>
                <td className="text-right">{formatWeight(voucher.totalGrossWeight)}</td>
                <td></td>
                <td className="text-right">{formatWeight(voucher.totalNetWeight)}</td>
                <td></td>
                <td className="text-right">{formatIndianNumber(voucher.metalAmount)}</td>
                <td className="text-right">{formatIndianNumber(voucher.labourAmount)}</td>
                <td></td>
                <td className="text-right">{formatIndianNumber(voucher.voucherAmount)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Print Dialog */}
      {showPrint && (
        <VoucherPrintDialog voucherId={Number(id)} onClose={() => setShowPrint(false)} />
      )}

      {/* Account Edit Modal */}
      {showAccountModal && voucher.account && (
        <AccountMasterModal
          open={showAccountModal}
          onClose={() => setShowAccountModal(false)}
          onSaved={() => {
            setShowAccountModal(false);
            queryClient.invalidateQueries({ queryKey: ['sales-voucher', id] });
          }}
          editData={voucher.account}
        />
      )}
    </div>
  );
}
