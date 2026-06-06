/**
 * Repair Intake — capture customer + items + photos.
 *
 * Photos: upload via filesAPI under entityType='RepairIntake' (a
 * temporary bucket), then once the repair is created we register them
 * against the new repairJob via repairAPI.addPhoto. This avoids needing
 * a two-phase commit for the file uploads.
 */
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { repairAPI, mastersAPI, filesAPI, accountsAPI } from '../../lib/api';
import { Camera, Plus, Trash2, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import AccountMasterModal from '../../components/AccountMasterModal';

interface IntakeItem {
  ornamentType: string;
  metalTypeId: number | '';
  purity: string;
  grossWeight: number;
  netWeight: number;
  stoneWeight: number;
  description: string;
  conditionNotes: string;
  hallmarkDetails: string;
  issueDescription: string;
}

const blankItem = (): IntakeItem => ({
  ornamentType: '', metalTypeId: '', purity: '',
  grossWeight: 0, netWeight: 0, stoneWeight: 0,
  description: '', conditionNotes: '', hallmarkDetails: '', issueDescription: '',
});

interface PendingPhoto { file: File; type: 'BEFORE' | 'AFTER' | 'DAMAGE' | 'OTHER'; preview: string }

export default function RepairIntake() {
  const navigate = useNavigate();
  const { data: metalTypesData } = useQuery({
    queryKey: ['masters', 'metalTypes'],
    queryFn: () => mastersAPI.metalTypes().then(r => r.data),
  });
  const metalTypes = metalTypesData?.metalTypes ?? metalTypesData ?? [];

  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerAccountId, setCustomerAccountId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const queryClient = useQueryClient();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: customerResults } = useQuery({
    queryKey: ['accounts', 'repair-customer-search', customerSearch],
    queryFn: () => accountsAPI.list({ search: customerSearch, type: 'CUSTOMER', limit: 10 }).then((r: any) => r.data?.accounts || r.data?.rows || []),
    enabled: customerSearch.length >= 2 && !customerAccountId,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [priority, setPriority] = useState('NORMAL');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [estimatedAmount, setEstimatedAmount] = useState(0);
  const [advanceReceived, setAdvanceReceived] = useState(0);
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [items, setItems] = useState<IntakeItem[]>([blankItem()]);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);

  const updateItem = (i: number, patch: Partial<IntakeItem>) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>, type: PendingPhoto['type']) => {
    const files = Array.from(e.target.files || []);
    const next = files.map(f => ({ file: f, type, preview: URL.createObjectURL(f) }));
    setPhotos(prev => [...prev, ...next]);
    e.target.value = '';
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Rule 3: photos mandatory — at least one BEFORE photo
      const hasBefore = photos.some(p => p.type === 'BEFORE');
      if (!hasBefore) throw new Error('At least one BEFORE photo is required');

      const cleanItems = items.filter(i => i.ornamentType && i.metalTypeId && Number(i.grossWeight) > 0);
      if (cleanItems.length === 0) throw new Error('Add at least one valid item');

      const res = await repairAPI.create({
        customerName, customerMobile,
        customerAccountId: customerAccountId || undefined,
        priority, expectedDeliveryDate: expectedDeliveryDate || undefined,
        estimatedAmount: Number(estimatedAmount), advanceReceived: Number(advanceReceived),
        customerNotes, internalNotes,
        items: cleanItems,
      });
      const repair = res.data.repair;

      // Upload + register photos against the new repair
      if (photos.length > 0) {
        const upload = await filesAPI.upload('RepairJob', repair.id, photos.map(p => p.file), 'image');
        const attachments = upload.data || [];
        await Promise.all(attachments.map((att: any, idx: number) =>
          repairAPI.addPhoto(repair.id, {
            type: photos[idx]?.type || 'OTHER',
            storagePath: att.storagePath,
            mimeType: att.mimeType,
          }).catch(() => undefined),
        ));
      }
      return repair;
    },
    onSuccess: (repair) => {
      toast.success(`Repair ${repair.repairNo} created`);
      navigate(`/repairs/${repair.id}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to create repair');
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">New Repair Intake</h1>
      </div>

      {/* Customer */}
      <section className="bg-white rounded shadow-sm p-3">
        <h2 className="font-semibold text-xs mb-2">Customer</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          <div className="relative md:col-span-2" ref={dropdownRef}>
            <input
              className={`border rounded px-2 py-1.5 w-full ${customerAccountId ? 'bg-green-50 border-green-300' : ''}`}
              placeholder="Search customer by name / mobile..."
              value={customerName}
              onChange={e => {
                setCustomerName(e.target.value);
                setCustomerSearch(e.target.value);
                setCustomerAccountId(null);
                setShowDropdown(true);
              }}
              onFocus={() => {
                if (customerName.length >= 2 && !customerAccountId) setShowDropdown(true);
              }}
            />
            {customerAccountId && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Linked</span>
            )}
            {showDropdown && customerSearch.length >= 2 && !customerAccountId && (
              <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-lg max-h-52 overflow-auto">
                {(customerResults || []).map((c: any) => (
                  <div
                    key={c.id}
                    className="px-3 py-1.5 hover:bg-blue-50 cursor-pointer text-xs border-b flex justify-between"
                    onClick={() => {
                      setCustomerAccountId(c.id);
                      setCustomerName(c.name);
                      setCustomerMobile(c.mobile || '');
                      setCustomerSearch('');
                      setShowDropdown(false);
                    }}
                  >
                    <span><span className="font-medium">{c.name}</span>{c.mobile && <span className="text-gray-400 ml-2">{c.mobile}</span>}</span>
                  </div>
                ))}
                {(customerResults || []).length === 0 && (
                  <div className="px-3 py-2 text-gray-400 text-xs">No matching customers</div>
                )}
                <div
                  className="px-3 py-2 hover:bg-green-50 cursor-pointer text-xs border-t flex items-center gap-1 text-green-700 font-medium"
                  onClick={() => { setShowDropdown(false); setShowCustomerModal(true); }}
                >
                  <UserPlus size={12} /> Create New Customer
                </div>
              </div>
            )}
          </div>
          <input className="border rounded px-2 py-1.5" placeholder="Mobile"
            value={customerMobile} onChange={e => setCustomerMobile(e.target.value)} />
          <select className="border rounded px-2 py-1.5" value={priority} onChange={e => setPriority(e.target.value)}>
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </section>

      {/* Items */}
      <section className="bg-white rounded shadow-sm p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-xs">Repair Items</h2>
          <button onClick={() => setItems(p => [...p, blankItem()])}
            className="text-xs flex items-center gap-1 text-blue-600">
            <Plus size={12}/> Add item
          </button>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-auto" />
            <col className="w-8" />
          </colgroup>
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-2 py-1.5">Ornament</th>
              <th className="text-left px-2 py-1.5">Metal</th>
              <th className="text-left px-2 py-1.5">Purity</th>
              <th className="text-right px-2 py-1.5">Gross (g)</th>
              <th className="text-right px-2 py-1.5">Stone (g)</th>
              <th className="text-right px-2 py-1.5">Net (g)</th>
              <th className="text-left px-2 py-1.5">Issue</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1"><input className="border rounded px-1 py-1 w-full" placeholder="Ring / Chain / …"
                  value={it.ornamentType} onChange={e => updateItem(i, { ornamentType: e.target.value })}/></td>
                <td className="px-2 py-1">
                  <select className="border rounded px-1 py-1 w-full" value={it.metalTypeId}
                    onChange={e => updateItem(i, { metalTypeId: e.target.value ? Number(e.target.value) : '' })}>
                    <option value="">—</option>
                    {(metalTypes as any[]).map((m: any) => (
                      <option key={m.id} value={m.id}>{m.code || m.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1"><input className="border rounded px-1 py-1 w-full" placeholder="22KT"
                  value={it.purity} onChange={e => updateItem(i, { purity: e.target.value })}/></td>
                <td className="px-2 py-1"><input type="number" step="0.001" className="border rounded px-1 py-1 w-full text-right"
                  value={it.grossWeight} onChange={e => updateItem(i, {
                    grossWeight: Number(e.target.value),
                    netWeight: Number(e.target.value) - Number(it.stoneWeight),
                  })}/></td>
                <td className="px-2 py-1"><input type="number" step="0.001" className="border rounded px-1 py-1 w-full text-right"
                  value={it.stoneWeight} onChange={e => updateItem(i, {
                    stoneWeight: Number(e.target.value),
                    netWeight: Number(it.grossWeight) - Number(e.target.value),
                  })}/></td>
                <td className="px-2 py-1"><input type="number" step="0.001" className="border rounded px-1 py-1 w-full text-right"
                  value={it.netWeight} onChange={e => updateItem(i, { netWeight: Number(e.target.value) })}/></td>
                <td className="px-2 py-1"><input className="border rounded px-1 py-1 w-full" placeholder="What to fix"
                  value={it.issueDescription} onChange={e => updateItem(i, { issueDescription: e.target.value })}/></td>
                <td>
                  {items.length > 1 && (
                    <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}
                      className="text-red-500"><Trash2 size={12}/></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {/* Photos */}
      <section className="bg-white rounded shadow-sm p-3">
        <h2 className="font-semibold text-xs mb-2 flex items-center gap-2">
          <Camera size={12}/> Photos <span className="text-[10px] text-red-500">(at least one BEFORE photo required)</span>
        </h2>
        <div className="flex gap-2 flex-wrap">
          {(['BEFORE', 'DAMAGE', 'OTHER'] as const).map(type => (
            <label key={type} className="bg-gray-100 hover:bg-gray-200 cursor-pointer text-xs px-3 py-1.5 rounded">
              + {type}
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => handlePhotoSelect(e, type)}/>
            </label>
          ))}
        </div>
        {photos.length > 0 && (
          <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative group">
                <img src={p.preview} alt="" className="w-full h-20 object-cover rounded border"/>
                <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">{p.type}</span>
                <button onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] hidden group-hover:block">×</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Money + notes + submit */}
      <section className="bg-white rounded shadow-sm p-3 grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
        <label className="flex flex-col">Expected delivery
          <input type="date" className="border rounded px-2 py-1.5"
            value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)}/>
        </label>
        <label className="flex flex-col">Estimated amount (₹)
          <input type="number" className="border rounded px-2 py-1.5 text-right"
            value={estimatedAmount} onChange={e => setEstimatedAmount(Number(e.target.value))}/>
        </label>
        <label className="flex flex-col">Advance received (₹)
          <input type="number" className="border rounded px-2 py-1.5 text-right"
            value={advanceReceived} onChange={e => setAdvanceReceived(Number(e.target.value))}/>
        </label>
        <div></div>
        <label className="md:col-span-2 flex flex-col">Customer notes
          <textarea className="border rounded px-2 py-1.5" rows={2}
            value={customerNotes} onChange={e => setCustomerNotes(e.target.value)}/>
        </label>
        <label className="md:col-span-2 flex flex-col">Internal notes
          <textarea className="border rounded px-2 py-1.5" rows={2}
            value={internalNotes} onChange={e => setInternalNotes(e.target.value)}/>
        </label>
      </section>

      <div className="flex justify-end gap-2">
        <button onClick={() => navigate('/repairs')} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="px-4 py-1.5 text-xs bg-jewel-gold text-jewel-dark font-semibold rounded disabled:opacity-50"
        >
          {createMutation.isPending ? 'Saving…' : 'Create Repair'}
        </button>
      </div>

      {showCustomerModal && (
        <AccountMasterModal
          open={showCustomerModal}
          onClose={() => setShowCustomerModal(false)}
          forceType="CUSTOMER"
          onSaved={(savedAccount: any) => {
            setCustomerAccountId(savedAccount.id);
            setCustomerName(savedAccount.name);
            setCustomerMobile(savedAccount.mobile || '');
            setShowCustomerModal(false);
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
          }}
        />
      )}
    </div>
  );
}
