/**
 * Karigers — master list with money/metal balances and quick payment.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { karigerAPI } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import toast from 'react-hot-toast';
import { Plus, Wallet, Scale } from 'lucide-react';

export default function KarigerList() {
  const qc = useQueryClient();
  const isMaster = useAuthStore((s) => s.user?.branch?.isMaster);
  const { data, isLoading } = useQuery({
    queryKey: ['karigers'],
    queryFn: () => karigerAPI.list().then(r => r.data),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mobile, setMobile] = useState('');
  const [specialization, setSpecialization] = useState('');

  const createMu = useMutation({
    mutationFn: () => karigerAPI.create({ name, code, mobile, specialization }),
    onSuccess: () => {
      toast.success('Kariger added');
      setShowCreate(false); setName(''); setCode(''); setMobile(''); setSpecialization('');
      qc.invalidateQueries({ queryKey: ['karigers'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const [payOpen, setPayOpen] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payRemarks, setPayRemarks] = useState('');
  const payMu = useMutation({
    mutationFn: (id: number) => karigerAPI.pay(id, { amount: payAmount, remarks: payRemarks }),
    onSuccess: () => {
      toast.success('Payment recorded');
      setPayOpen(null); setPayAmount(0); setPayRemarks('');
      qc.invalidateQueries({ queryKey: ['karigers'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Karigers</h1>
        {isMaster ? (
          <button onClick={() => setShowCreate(true)}
            className="bg-jewel-gold text-jewel-dark text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1">
            <Plus size={14}/> Add Kariger
          </button>
        ) : (
          <span className="text-[11px] text-gray-500">Only the main branch can add karigars</span>
        )}
      </div>

      <div className="bg-white rounded shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Code</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Mobile</th>
              <th className="text-left p-2">Specialization</th>
              <th className="text-right p-2"><Scale size={10} className="inline"/> Gold (g)</th>
              <th className="text-right p-2"><Wallet size={10} className="inline"/> Owed (₹)</th>
              <th className="text-center p-2">Active</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="p-6 text-center text-gray-400">Loading…</td></tr>
            ) : (data?.karigers || []).length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-gray-400">No karigers yet</td></tr>
            ) : data.karigers.map((k: any) => (
              <tr key={k.id} className="border-b hover:bg-gray-50">
                <td className="p-2 font-mono">{k.code}</td>
                <td className="p-2">{k.name}</td>
                <td className="p-2">{k.mobile || '—'}</td>
                <td className="p-2">{k.specialization || '—'}</td>
                <td className={`p-2 text-right ${Number(k.metalBalance) > 0 ? 'text-blue-700 font-semibold' : ''}`}>
                  {Number(k.metalBalance).toFixed(3)}
                </td>
                <td className={`p-2 text-right ${Number(k.moneyBalance) > 0 ? 'text-green-700 font-semibold' : ''}`}>
                  {new Intl.NumberFormat('en-IN').format(Number(k.moneyBalance))}
                </td>
                <td className="p-2 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${k.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200'}`}>
                    {k.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-2">
                  {Number(k.moneyBalance) > 0 && (
                    <button onClick={() => { setPayOpen(k.id); setPayAmount(Number(k.moneyBalance)); }}
                      className="text-blue-600 hover:underline text-[11px]">Pay</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Add Kariger">
          <div className="space-y-2 text-xs">
            <input className="border rounded px-2 py-1.5 w-full" placeholder="Name *"
              value={name} onChange={e => setName(e.target.value)}/>
            <input className="border rounded px-2 py-1.5 w-full" placeholder="Code (optional, auto-generated)"
              value={code} onChange={e => setCode(e.target.value)}/>
            <input className="border rounded px-2 py-1.5 w-full" placeholder="Mobile"
              value={mobile} onChange={e => setMobile(e.target.value)}/>
            <input className="border rounded px-2 py-1.5 w-full" placeholder="Specialization"
              value={specialization} onChange={e => setSpecialization(e.target.value)}/>
            <button onClick={() => createMu.mutate()} disabled={!name || createMu.isPending}
              className="w-full bg-jewel-gold text-jewel-dark py-1.5 rounded font-semibold disabled:opacity-50">
              {createMu.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {payOpen && (
        <Modal onClose={() => setPayOpen(null)} title="Record Payment to Kariger">
          <div className="space-y-2 text-xs">
            <input type="number" className="border rounded px-2 py-1.5 w-full text-right" placeholder="Amount"
              value={payAmount} onChange={e => setPayAmount(Number(e.target.value))}/>
            <input className="border rounded px-2 py-1.5 w-full" placeholder="Remarks"
              value={payRemarks} onChange={e => setPayRemarks(e.target.value)}/>
            <button onClick={() => payMu.mutate(payOpen)} disabled={!payAmount || payMu.isPending}
              className="w-full bg-green-600 text-white py-1.5 rounded font-semibold disabled:opacity-50">
              {payMu.isPending ? 'Saving…' : 'Confirm Payment'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, title, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded shadow-lg p-4 w-80" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">{title}</h3>
          <button onClick={onClose} className="text-gray-500 text-lg leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
