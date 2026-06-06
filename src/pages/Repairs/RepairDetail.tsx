/**
 * Repair Detail
 * ─────────────
 * Single-page operations console for a repair job. Sections:
 *   1. Header + status + action buttons (transition)
 *   2. Items + photos
 *   3. Workflow timeline (RepairStateHistory)
 *   4. Kariger assignment + return capture
 *   5. Weight adjustment (classified) — operator MUST pick a type
 *   6. Charges + invoice
 *   7. Delivery (gates on invoice settlement unless override)
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { repairAPI, karigerAPI, filesAPI, courierAPI } from '../../lib/api';
import toast from 'react-hot-toast';
import {
  ArrowRight, Wrench, Camera, CheckCircle2, AlertTriangle,
  ClipboardList, Scale, Receipt, Truck,
} from 'lucide-react';
import CourierShipmentPanel from '../../components/CourierShipmentPanel';
import CreateShipmentModal from '../../components/CreateShipmentModal';

const ADJUSTMENT_LABEL: Record<string, string> = {
  NORMAL_WASTAGE: 'Normal Wastage',
  RECOVERABLE_GOLD: 'Recoverable Gold (kariger debt)',
  EXTRA_GOLD_ADDED: 'Extra Gold Added (chargeable)',
  STONE_REMOVAL: 'Stone Removal',
  APPROVED_REDUCTION: 'Approved Reduction',
};

const CHARGE_TYPES = ['LABOR', 'POLISH', 'STONE_REPLACEMENT', 'EXTRA_GOLD', 'URGENCY', 'OTHER'];

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);
}

export default function RepairDetail() {
  const { id } = useParams<{ id: string }>();
  const repairId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['repairs', 'detail', repairId],
    queryFn: () => repairAPI.get(repairId).then(r => r.data),
    enabled: !!repairId,
  });
  const { data: karigersData } = useQuery({
    queryKey: ['karigers', { active: true }],
    queryFn: () => karigerAPI.list({ active: 'true' }).then(r => r.data),
  });

  const repair = data?.repair;
  const allowedNextStates: string[] = data?.allowedNextStates || [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['repairs', 'detail', repairId] });

  // ── Mutations ──────────────────────────────────────────────
  const setStatusMu = useMutation({
    mutationFn: ({ to, remarks }: { to: string; remarks?: string }) =>
      repairAPI.setStatus(repairId, to, remarks),
    onSuccess: () => { toast.success('Status updated'); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  if (isLoading || !repair) return <div className="p-4 text-gray-500">Loading…</div>;

  return (
    <div className="space-y-3">
      <Header repair={repair} onBack={() => navigate('/repairs')} />

      {/* Quick transition buttons */}
      <div className="bg-white rounded shadow-sm p-2 flex gap-2 flex-wrap text-xs">
        <span className="text-gray-500 self-center mr-1">Next:</span>
        {allowedNextStates.length === 0 && <span className="text-gray-400">— terminal —</span>}
        {allowedNextStates.map((s: string) => (
          <button key={s}
            onClick={() => setStatusMu.mutate({ to: s })}
            className="border rounded px-2 py-1 hover:bg-gray-100"
          >
            <ArrowRight size={10} className="inline" /> {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-3">
          <ItemsSection repair={repair} />
          <PhotosSection repair={repair} />
          <WeightAdjustmentSection repair={repair} onChange={refresh} />
          <ChargesAndInvoiceSection repair={repair} onChange={refresh} />
        </div>
        <div className="space-y-3">
          <KarigerSection
            repair={repair}
            karigers={karigersData?.karigers || []}
            onChange={refresh}
          />
          <DeliverySection repair={repair} onChange={refresh} />
          <TimelineSection repair={repair} />
        </div>
      </div>
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────
function Header({ repair, onBack }: any) {
  const status = repair.status as string;
  const statusColor: Record<string, string> = {
    READY_FOR_DELIVERY: 'bg-green-100 text-green-700',
    DELIVERED: 'bg-gray-200 text-gray-700',
    REWORK_REQUIRED: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-red-50 text-red-500',
  };
  return (
    <div className="bg-white rounded shadow-sm p-3">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-xs text-gray-500 hover:underline">← repairs</button>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Wrench size={18}/> {repair.repairNo}
            <span className={`text-xs px-2 py-0.5 rounded ${statusColor[status] || 'bg-blue-100 text-blue-700'}`}>
              {status.replace(/_/g, ' ')}
            </span>
            {repair.priority !== 'NORMAL' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                {repair.priority}
              </span>
            )}
            {repair.approvalRequired && !repair.approvedAt && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 flex items-center gap-1">
                <AlertTriangle size={10}/> Approval needed
              </span>
            )}
          </h1>
        </div>
        <div className="text-right text-xs text-gray-600">
          <div className="font-semibold text-sm text-gray-900">{repair.customerName}</div>
          {repair.customerMobile && <div>{repair.customerMobile}</div>}
          <div>{repair.branch?.name}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[11px]">
        <Field label="Intake" value={new Date(repair.intakeDate).toLocaleDateString('en-IN')} />
        <Field label="Expected" value={repair.expectedDeliveryDate ? new Date(repair.expectedDeliveryDate).toLocaleDateString('en-IN') : '—'} />
        <Field label="Estimated" value={`₹ ${fmtINR(Number(repair.estimatedAmount))}`} />
        <Field label="Advance" value={`₹ ${fmtINR(Number(repair.advanceReceived))}`} />
      </div>
    </div>
  );
}

const Field = ({ label, value }: any) => (
  <div className="bg-gray-50 rounded p-2">
    <div className="text-[10px] text-gray-500 uppercase">{label}</div>
    <div className="font-semibold">{value}</div>
  </div>
);

// ─── Items ──────────────────────────────────────────────────
function ItemsSection({ repair }: any) {
  return (
    <section className="bg-white rounded shadow-sm p-3">
      <h2 className="font-semibold text-xs mb-2 flex items-center gap-2">
        <ClipboardList size={12}/> Items ({repair.items.length})
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-1">Ornament</th>
              <th className="text-left p-1">Metal</th>
              <th className="text-left p-1">Purity</th>
              <th className="text-right p-1">Gross (g)</th>
              <th className="text-right p-1">Net (g)</th>
              <th className="text-right p-1">Returned (g)</th>
              <th className="text-left p-1">Issue</th>
            </tr>
          </thead>
          <tbody>
            {repair.items.map((it: any) => (
              <tr key={it.id} className="border-t">
                <td className="p-1">{it.ornamentType}</td>
                <td className="p-1">{it.metalType?.name}</td>
                <td className="p-1">{it.purity}</td>
                <td className="p-1 text-right">{Number(it.grossWeight).toFixed(3)}</td>
                <td className="p-1 text-right">{Number(it.netWeight).toFixed(3)}</td>
                <td className="p-1 text-right">
                  {it.returnedWeight != null
                    ? <span className={Number(it.returnedWeight) < Number(it.grossWeight) ? 'text-red-600' : ''}>
                        {Number(it.returnedWeight).toFixed(3)}
                      </span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="p-1 text-gray-600">{it.issueDescription || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Photos ─────────────────────────────────────────────────
function PhotosSection({ repair }: any) {
  // We get a `storagePath` on each RepairPhoto, but the file-server's
  // /download endpoint is signature-gated. Pull the attachment list
  // for this repair and request a signed URL per photo on demand.
  const { data: attachments } = useQuery({
    queryKey: ['repair-attachments', repair.id],
    queryFn: () => filesAPI.list('RepairJob', repair.id).then(r => r.data),
    enabled: repair.photos.length > 0,
  });
  const attByPath = useMemo(() => {
    const m = new Map<string, any>();
    (attachments || []).forEach((a: any) => m.set(a.storagePath, a));
    return m;
  }, [attachments]);

  if (repair.photos.length === 0) return null;
  return (
    <section className="bg-white rounded shadow-sm p-3">
      <h2 className="font-semibold text-xs mb-2 flex items-center gap-2">
        <Camera size={12}/> Photos ({repair.photos.length})
      </h2>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {repair.photos.map((p: any) => (
          <PhotoTile key={p.id} photo={p} attachment={attByPath.get(p.storagePath)} />
        ))}
      </div>
    </section>
  );
}

function PhotoTile({ photo, attachment }: any) {
  const { data: urlData } = useQuery({
    queryKey: ['file-url', attachment?.id],
    queryFn: () => filesAPI.getDownloadUrl(attachment.id).then(r => r.data),
    enabled: !!attachment?.id,
    staleTime: 30 * 60_000,
  });
  return (
    <div className="relative">
      {urlData?.url ? (
        <img src={urlData.url} alt={photo.type} className="w-full h-20 object-cover rounded border"/>
      ) : (
        <div className="w-full h-20 rounded border bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">
          loading…
        </div>
      )}
      <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">{photo.type}</span>
    </div>
  );
}

// ─── Kariger ────────────────────────────────────────────────
function KarigerSection({ repair, karigers, onChange }: any) {
  const [karigerId, setKarigerId] = useState<string>('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [ratePerGram, setRatePerGram] = useState(0);
  const [returns, setReturns] = useState<Record<number, string>>({});
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipDirection, setShipDirection] = useState<'to' | 'from'>('to');
  const queryClient = useQueryClient();

  const assignMu = useMutation({
    mutationFn: () => repairAPI.assignKariger(repair.id, {
      karigerId: Number(karigerId),
      expectedReturnDate: expectedReturnDate || undefined,
      ratePerGram: Number(ratePerGram) || undefined,
    }),
    onSuccess: () => { toast.success('Kariger assigned'); onChange(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const cancelShipMu = useMutation({
    mutationFn: (shipmentId: number) => courierAPI.cancelShipment(shipmentId),
    onSuccess: () => {
      toast.success('Shipment cancelled');
      queryClient.invalidateQueries({ queryKey: ['courier-shipments', 'RepairJob', repair.id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to cancel'),
  });

  const returnMu = useMutation({
    mutationFn: () => repairAPI.returnFromKariger(repair.id, {
      itemReturns: repair.items.map((it: any) => ({
        repairItemId: it.id,
        returnedWeight: Number(returns[it.id] ?? it.grossWeight),
      })),
    }),
    onSuccess: () => { toast.success('Return recorded'); onChange(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  return (
    <section className="bg-white rounded shadow-sm p-3 text-xs">
      <h2 className="font-semibold mb-2">Kariger</h2>
      {repair.assignedKariger ? (
        <div className="bg-gray-50 rounded p-2 mb-2">
          <div className="font-semibold">{repair.assignedKariger.name}</div>
          <div className="text-[10px] text-gray-500">{repair.assignedKariger.code}</div>
        </div>
      ) : (
        <div className="space-y-2 mb-2">
          <select className="border rounded px-2 py-1.5 w-full" value={karigerId}
            onChange={e => setKarigerId(e.target.value)}>
            <option value="">Select kariger…</option>
            {karigers.map((k: any) => <option key={k.id} value={k.id}>{k.name} ({k.code})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="border rounded px-2 py-1.5" value={expectedReturnDate}
              onChange={e => setExpectedReturnDate(e.target.value)} />
            <input type="number" placeholder="Rate ₹/g" className="border rounded px-2 py-1.5 text-right"
              value={ratePerGram} onChange={e => setRatePerGram(Number(e.target.value))} />
          </div>
          <button
            disabled={!karigerId || assignMu.isPending}
            onClick={() => assignMu.mutate()}
            className="w-full bg-blue-600 text-white py-1.5 rounded disabled:opacity-50">
            {assignMu.isPending ? 'Assigning…' : 'Assign Kariger'}
          </button>
        </div>
      )}

      {repair.status === 'IN_PROGRESS' && (
        <div className="border-t pt-2 mt-2 space-y-2">
          <div className="font-semibold">Record Return</div>
          {repair.items.map((it: any) => (
            <div key={it.id} className="flex items-center gap-2">
              <span className="flex-1 truncate">{it.ornamentType} ({Number(it.grossWeight).toFixed(3)} g)</span>
              <input type="number" step="0.001" placeholder="Returned (g)"
                className="border rounded px-2 py-1 w-24 text-right"
                value={returns[it.id] ?? ''}
                onChange={e => setReturns(prev => ({ ...prev, [it.id]: e.target.value }))} />
            </div>
          ))}
          <button onClick={() => returnMu.mutate()} disabled={returnMu.isPending}
            className="w-full bg-indigo-600 text-white py-1.5 rounded disabled:opacity-50">
            {returnMu.isPending ? 'Saving…' : 'Mark Returned'}
          </button>
        </div>
      )}

      {/* Courier shipments for this repair */}
      {repair.assignedKariger && (
        <div className="border-t pt-2 mt-2 space-y-2">
          <CourierShipmentPanel
            entityType="RepairJob"
            entityId={repair.id}
            onCancel={(id) => cancelShipMu.mutate(id)}
          />
          <div className="flex gap-1">
            {['ASSIGNED_TO_KARIGER', 'IN_PROGRESS'].includes(repair.status) && (
              <button
                onClick={() => { setShipDirection('to'); setShowShipModal(true); }}
                className="flex-1 text-[10px] border border-blue-200 text-blue-700 py-1 rounded hover:bg-blue-50 flex items-center justify-center gap-1">
                <Truck size={10} /> Ship to Karigar
              </button>
            )}
            {['IN_PROGRESS', 'RETURNED_FROM_KARIGER', 'QC_CHECK'].includes(repair.status) && (
              <button
                onClick={() => { setShipDirection('from'); setShowShipModal(true); }}
                className="flex-1 text-[10px] border border-green-200 text-green-700 py-1 rounded hover:bg-green-50 flex items-center justify-center gap-1">
                <Truck size={10} /> Ship from Karigar
              </button>
            )}
          </div>
        </div>
      )}

      {showShipModal && repair.assignedKariger && (
        <CreateShipmentModal
          open={showShipModal}
          onClose={() => setShowShipModal(false)}
          shipmentType={shipDirection === 'to' ? 'REPAIR_TO_KARIGAR' : 'REPAIR_FROM_KARIGAR'}
          entityType="RepairJob"
          entityId={repair.id}
          pickup={shipDirection === 'to' ? {
            name: repair.branch?.name || 'Shop',
            phone: repair.branch?.phone || '',
            address: repair.branch?.address || '',
            city: repair.branch?.city || '',
            state: repair.branch?.state || '',
            pincode: repair.branch?.pincode || '',
          } : {
            name: repair.assignedKariger.name,
            phone: repair.assignedKariger.mobile || '',
            address: repair.assignedKariger.address || '',
            city: repair.assignedKariger.city || '',
            state: repair.assignedKariger.state || '',
            pincode: repair.assignedKariger.pincode || '',
          }}
          delivery={shipDirection === 'to' ? {
            name: repair.assignedKariger.name,
            phone: repair.assignedKariger.mobile || '',
            address: repair.assignedKariger.address || '',
            city: repair.assignedKariger.city || '',
            state: repair.assignedKariger.state || '',
            pincode: repair.assignedKariger.pincode || '',
          } : {
            name: repair.branch?.name || 'Shop',
            phone: repair.branch?.phone || '',
            address: repair.branch?.address || '',
            city: repair.branch?.city || '',
            state: repair.branch?.state || '',
            pincode: repair.branch?.pincode || '',
          }}
          weightGrams={repair.items.reduce((s: number, it: any) => s + Number(it.grossWeight) * 1000, 0)}
          declaredValue={Number(repair.estimatedAmount) || 5000}
          productName={`Repair #${repair.repairNo}`}
        />
      )}
    </section>
  );
}

// ─── Weight adjustment ──────────────────────────────────────
function WeightAdjustmentSection({ repair, onChange }: any) {
  const [itemId, setItemId] = useState<number | ''>('');
  const [adjustmentType, setAdjustmentType] = useState('');
  const [originalWeight, setOriginalWeight] = useState(0);
  const [finalWeight, setFinalWeight] = useState(0);
  const [ratePerGram, setRatePerGram] = useState(0);
  const [remarks, setRemarks] = useState('');
  const diff = useMemo(() => Number(finalWeight) - Number(originalWeight), [finalWeight, originalWeight]);
  const amount = Math.abs(diff) * Number(ratePerGram);

  const submitMu = useMutation({
    mutationFn: () => repairAPI.weightAdjustment(repair.id, {
      repairItemId: itemId || undefined, adjustmentType,
      originalWeight: Number(originalWeight), finalWeight: Number(finalWeight),
      ratePerGram: Number(ratePerGram), remarks,
    }),
    onSuccess: () => {
      toast.success('Adjustment recorded');
      setAdjustmentType(''); setOriginalWeight(0); setFinalWeight(0); setRatePerGram(0); setRemarks('');
      onChange();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  return (
    <section className="bg-white rounded shadow-sm p-3 text-xs">
      <h2 className="font-semibold mb-2 flex items-center gap-2">
        <Scale size={12}/> Weight Adjustments
      </h2>

      {repair.weightAdjustments.length > 0 && (
        <table className="w-full text-xs mb-3">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-1">Type</th>
              <th className="text-right p-1">Original</th>
              <th className="text-right p-1">Final</th>
              <th className="text-right p-1">Δ (g)</th>
              <th className="text-right p-1">Rate</th>
              <th className="text-right p-1">Amount</th>
              <th className="text-left p-1">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {repair.weightAdjustments.map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="p-1">{ADJUSTMENT_LABEL[a.adjustmentType] || a.adjustmentType}</td>
                <td className="p-1 text-right">{Number(a.originalWeight).toFixed(3)}</td>
                <td className="p-1 text-right">{Number(a.finalWeight).toFixed(3)}</td>
                <td className={`p-1 text-right font-semibold ${Number(a.differenceWeight) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {Number(a.differenceWeight).toFixed(3)}
                </td>
                <td className="p-1 text-right">{Number(a.ratePerGram).toFixed(0)}</td>
                <td className="p-1 text-right">₹{fmtINR(Number(a.amount))}</td>
                <td className="p-1 text-gray-600">{a.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="border-t pt-2 grid grid-cols-1 md:grid-cols-6 gap-2">
        <select className="border rounded px-2 py-1.5 md:col-span-2" value={itemId}
          onChange={e => setItemId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">— item (overall) —</option>
          {repair.items.map((it: any) => (
            <option key={it.id} value={it.id}>{it.ornamentType}</option>
          ))}
        </select>
        <select className="border rounded px-2 py-1.5 md:col-span-2" value={adjustmentType}
          onChange={e => setAdjustmentType(e.target.value)}>
          <option value="">Classification *</option>
          {Object.entries(ADJUSTMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="number" step="0.001" placeholder="Original (g)" className="border rounded px-2 py-1.5 text-right"
          value={originalWeight} onChange={e => setOriginalWeight(Number(e.target.value))} />
        <input type="number" step="0.001" placeholder="Final (g)" className="border rounded px-2 py-1.5 text-right"
          value={finalWeight} onChange={e => setFinalWeight(Number(e.target.value))} />
        <input type="number" placeholder="Rate ₹/g" className="border rounded px-2 py-1.5 text-right md:col-span-2"
          value={ratePerGram} onChange={e => setRatePerGram(Number(e.target.value))} />
        <input placeholder="Remarks" className="border rounded px-2 py-1.5 md:col-span-3"
          value={remarks} onChange={e => setRemarks(e.target.value)} />
        <div className="md:col-span-1 text-xs flex flex-col justify-center">
          <div>Δ: <b>{diff.toFixed(3)} g</b></div>
          <div>₹ <b>{fmtINR(amount)}</b></div>
        </div>
      </div>
      <div className="flex justify-end mt-2">
        <button onClick={() => submitMu.mutate()}
          disabled={!adjustmentType || submitMu.isPending}
          className="bg-purple-600 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50">
          {submitMu.isPending ? 'Saving…' : 'Record Adjustment'}
        </button>
      </div>
    </section>
  );
}

// ─── Charges + invoice + payment ────────────────────────────
function ChargesAndInvoiceSection({ repair, onChange }: any) {
  const [chargeType, setChargeType] = useState('LABOR');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [rate, setRate] = useState(0);

  const [pmt, setPmt] = useState({ cash: 0, bank: 0, card: 0, upi: 0 });

  const addChargeMu = useMutation({
    mutationFn: () => repairAPI.addCharge(repair.id, { chargeType, description, quantity, rate }),
    onSuccess: () => { toast.success('Charge added'); setDescription(''); setQuantity(1); setRate(0); onChange(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const generateMu = useMutation({
    mutationFn: () => repairAPI.generateInvoice(repair.id),
    onSuccess: () => { toast.success('Invoice generated'); onChange(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const payMu = useMutation({
    mutationFn: () => repairAPI.recordPayment(repair.id, pmt),
    onSuccess: () => { toast.success('Payment recorded'); setPmt({ cash: 0, bank: 0, card: 0, upi: 0 }); onChange(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const subtotal = repair.charges.reduce((s: number, c: any) => s + Number(c.amount), 0);

  return (
    <section className="bg-white rounded shadow-sm p-3 text-xs">
      <h2 className="font-semibold mb-2 flex items-center gap-2">
        <Receipt size={12}/> Charges & Invoice
      </h2>

      {repair.charges.length > 0 && (
        <table className="w-full text-xs mb-2">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-1">Type</th>
              <th className="text-left p-1">Description</th>
              <th className="text-right p-1">Qty</th>
              <th className="text-right p-1">Rate</th>
              <th className="text-right p-1">GST%</th>
              <th className="text-right p-1">Amount</th>
            </tr>
          </thead>
          <tbody>
            {repair.charges.map((c: any) => (
              <tr key={c.id} className="border-t">
                <td className="p-1">{c.chargeType}</td>
                <td className="p-1">{c.description}</td>
                <td className="p-1 text-right">{Number(c.quantity)}</td>
                <td className="p-1 text-right">{fmtINR(Number(c.rate))}</td>
                <td className="p-1 text-right">{c.gstApplicable ? Number(c.gstPercent) : 0}</td>
                <td className="p-1 text-right font-semibold">₹{fmtINR(Number(c.amount))}</td>
              </tr>
            ))}
            <tr className="border-t bg-gray-50">
              <td colSpan={5} className="p-1 text-right font-semibold">Subtotal</td>
              <td className="p-1 text-right font-bold">₹{fmtINR(subtotal)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {!repair.invoice ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2">
            <select className="border rounded px-2 py-1.5" value={chargeType}
              onChange={e => setChargeType(e.target.value)}>
              {CHARGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className="border rounded px-2 py-1.5 md:col-span-2" placeholder="Description"
              value={description} onChange={e => setDescription(e.target.value)} />
            <input type="number" step="0.01" className="border rounded px-2 py-1.5 text-right" placeholder="Qty"
              value={quantity} onChange={e => setQuantity(Number(e.target.value))} />
            <input type="number" className="border rounded px-2 py-1.5 text-right" placeholder="Rate"
              value={rate} onChange={e => setRate(Number(e.target.value))} />
            <button onClick={() => addChargeMu.mutate()} disabled={addChargeMu.isPending}
              className="bg-gray-700 text-white rounded px-2">+ Add</button>
          </div>
          {repair.charges.length > 0 && (
            <button onClick={() => generateMu.mutate()} disabled={generateMu.isPending}
              className="bg-green-600 text-white text-xs px-3 py-1.5 rounded">
              Generate Invoice
            </button>
          )}
        </>
      ) : (
        <div className="border rounded p-2 bg-green-50">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono font-semibold">{repair.invoice.invoiceNo}</div>
              <div className="text-[10px] text-gray-500">{new Date(repair.invoice.invoiceDate).toLocaleDateString('en-IN')}</div>
            </div>
            <div className="text-right">
              <div>Total: <b>₹{fmtINR(Number(repair.invoice.totalAmount))}</b></div>
              <div>Paid: ₹{fmtINR(Number(repair.invoice.paidAmount))}</div>
              <div className="text-red-600">Due: <b>₹{fmtINR(Number(repair.invoice.dueAmount))}</b></div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border">{repair.invoice.paymentStatus}</span>
            </div>
          </div>
          {Number(repair.invoice.dueAmount) > 0 && (
            <div className="mt-2 grid grid-cols-5 gap-2">
              {(['cash', 'bank', 'card', 'upi'] as const).map(k => (
                <input key={k} type="number" placeholder={k.toUpperCase()}
                  className="border rounded px-2 py-1 text-right"
                  value={pmt[k]} onChange={e => setPmt({ ...pmt, [k]: Number(e.target.value) })} />
              ))}
              <button onClick={() => payMu.mutate()} disabled={payMu.isPending}
                className="bg-green-600 text-white rounded px-2">Pay</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Delivery ───────────────────────────────────────────────
function DeliverySection({ repair, onChange }: any) {
  const [receivedBy, setReceivedBy] = useState('');
  const [signature, setSignature] = useState('');
  const [override, setOverride] = useState(false);

  const deliverMu = useMutation({
    mutationFn: () => repairAPI.deliver(repair.id, { receivedBy, signature, override }),
    onSuccess: () => { toast.success('Delivered'); onChange(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  if (repair.status === 'DELIVERED') {
    return (
      <section className="bg-white rounded shadow-sm p-3 text-xs">
        <h2 className="font-semibold mb-2 flex items-center gap-2 text-green-700">
          <CheckCircle2 size={12}/> Delivered
        </h2>
        <div>To: <b>{repair.receivedBy}</b></div>
        <div className="text-[10px] text-gray-500">on {new Date(repair.deliveredDate).toLocaleString('en-IN')}</div>
      </section>
    );
  }
  if (repair.status !== 'READY_FOR_DELIVERY') return null;

  return (
    <section className="bg-white rounded shadow-sm p-3 text-xs">
      <h2 className="font-semibold mb-2 flex items-center gap-2">
        <Truck size={12}/> Delivery
      </h2>
      <input className="border rounded px-2 py-1.5 w-full mb-2" placeholder="Received by (collector name) *"
        value={receivedBy} onChange={e => setReceivedBy(e.target.value)} />
      <input className="border rounded px-2 py-1.5 w-full mb-2" placeholder="Signature reference (optional)"
        value={signature} onChange={e => setSignature(e.target.value)} />
      {Number(repair.invoice?.dueAmount ?? 0) > 0 && (
        <label className="flex items-center gap-1 mb-2 text-red-600">
          <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
          Override unpaid (manager only)
        </label>
      )}
      <button onClick={() => deliverMu.mutate()} disabled={!receivedBy || deliverMu.isPending}
        className="w-full bg-green-600 text-white py-1.5 rounded disabled:opacity-50">
        {deliverMu.isPending ? 'Delivering…' : 'Confirm Delivery'}
      </button>
    </section>
  );
}

// ─── Timeline ───────────────────────────────────────────────
function TimelineSection({ repair }: any) {
  return (
    <section className="bg-white rounded shadow-sm p-3 text-xs">
      <h2 className="font-semibold mb-2">Workflow Timeline</h2>
      <ol className="space-y-1">
        {repair.stateHistory.map((h: any) => (
          <li key={h.id} className="flex gap-2">
            <span className="text-gray-400 text-[10px] w-24 shrink-0">
              {new Date(h.changedAt).toLocaleString('en-IN', { hour12: false })}
            </span>
            <span>
              {h.fromState ? (
                <><span className="text-gray-500">{h.fromState.replace(/_/g, ' ')}</span> → </>
              ) : null}
              <b>{h.toState.replace(/_/g, ' ')}</b>
              {h.remarks && <div className="text-[10px] text-gray-500">{h.remarks}</div>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
