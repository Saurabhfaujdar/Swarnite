import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mastersAPI, inventoryAPI } from '../../lib/api';
import toast from 'react-hot-toast';

type Tab = 'items' | 'groups' | 'prefixes' | 'metalTypes' | 'purities' | 'counters' | 'salesmen' | 'rates';

const tabs: { key: Tab; label: string }[] = [
  { key: 'items', label: 'Items' },
  { key: 'groups', label: 'Item Groups' },
  { key: 'prefixes', label: 'Label Prefixes' },
  { key: 'metalTypes', label: 'Metal Types' },
  { key: 'purities', label: 'Purities' },
  { key: 'counters', label: 'Counters' },
  { key: 'salesmen', label: 'Salesmen' },
  { key: 'rates', label: 'Metal Rates' },
];

export default function MasterData() {
  const [activeTab, setActiveTab] = useState<Tab>('items');

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="panel">
        <div className="panel-header">Housekeeping — Master Data Management</div>
        <div className="panel-body p-0">
          <div className="flex border-b">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === t.key
                    ? 'border-blue-600 text-blue-700 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'items' && <ItemsTab />}
        {activeTab === 'groups' && <ItemGroupsTab />}
        {activeTab === 'prefixes' && <PrefixesTab />}
        {activeTab === 'metalTypes' && <MetalTypesTab />}
        {activeTab === 'purities' && <PuritiesTab />}
        {activeTab === 'counters' && <CountersTab />}
        {activeTab === 'salesmen' && <SalesmenTab />}
        {activeTab === 'rates' && <MetalRatesTab />}
      </div>
    </div>
  );
}

/* ============================================================
   ITEMS TAB
   ============================================================ */
function ItemsTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', itemGroupId: 0, metalTypeId: 0, purityId: 0, description: '', mrp: '' });

  const { data: items, isLoading } = useQuery({ queryKey: ['items-list'], queryFn: () => inventoryAPI.items().then((r) => r.data) });
  const { data: groups } = useQuery({ queryKey: ['item-groups'], queryFn: () => mastersAPI.itemGroups().then((r) => r.data) });
  const { data: metals } = useQuery({ queryKey: ['metal-types'], queryFn: () => mastersAPI.metalTypes().then((r) => r.data) });
  const { data: purities } = useQuery({ queryKey: ['purities'], queryFn: () => mastersAPI.purities().then((r) => r.data) });

  const create = useMutation({
    mutationFn: (d: any) => inventoryAPI.createItem(d),
    onSuccess: () => { toast.success('Item created'); qc.invalidateQueries({ queryKey: ['items-list'] }); setShowForm(false); resetForm(); },
    onError: () => toast.error('Failed to create item'),
  });

  const resetForm = () => setForm({ name: '', code: '', itemGroupId: 0, metalTypeId: 0, purityId: 0, description: '', mrp: '' });

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error('Item name is required');
    if (!form.code.trim()) return toast.error('Item code is required');
    if (!form.itemGroupId) return toast.error('Select an item group');
    if (!form.metalTypeId) return toast.error('Select a metal type');
    if (!form.purityId) return toast.error('Select a purity');
    create.mutate({ ...form, mrp: form.mrp ? Number(form.mrp) : undefined });
  };

  return (
    <div className="panel">
      <div className="panel-header flex justify-between items-center">
        <span>Items ({items?.length || 0})</span>
        <button className="btn-primary text-xs" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ New Item'}
        </button>
      </div>

      {showForm && (
        <div className="panel-body border-b bg-blue-50">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="form-label block text-xs">Item Name *</label>
              <input className="form-input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Gold Anklet 22KT" />
            </div>
            <div>
              <label className="form-label block text-xs">Item Code *</label>
              <input className="form-input w-full uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="e.g. GANKT22" />
            </div>
            <div>
              <label className="form-label block text-xs">Item Group *</label>
              <select className="form-select w-full" value={form.itemGroupId} onChange={(e) => setForm({ ...form, itemGroupId: Number(e.target.value) })}>
                <option value={0}>Select Group</option>
                {groups?.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label block text-xs">Metal Type *</label>
              <select className="form-select w-full" value={form.metalTypeId} onChange={(e) => setForm({ ...form, metalTypeId: Number(e.target.value) })}>
                <option value={0}>Select Metal</option>
                {metals?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label block text-xs">Purity *</label>
              <select className="form-select w-full" value={form.purityId} onChange={(e) => setForm({ ...form, purityId: Number(e.target.value) })}>
                <option value={0}>Select Purity</option>
                {purities?.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
            </div>
            <div>
              <label className="form-label block text-xs">MRP (optional)</label>
              <input type="number" className="form-input w-full text-right" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} placeholder="Fixed price" />
            </div>
            <div>
              <label className="form-label block text-xs">Description</label>
              <input className="form-input w-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex items-end">
              <button onClick={handleSubmit} className="btn-success text-xs px-6" disabled={create.isPending}>
                {create.isPending ? 'Saving...' : '💾 Save Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-body p-0">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Code</th>
              <th>Group</th>
              <th>Metal</th>
              <th>Purity</th>
              <th className="text-right">MRP</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-6 text-gray-400">Loading...</td></tr>
            ) : items?.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-6 text-gray-400">No items found</td></tr>
            ) : (
              items?.map((i: any) => (
                <tr key={i.id}>
                  <td>{i.id}</td>
                  <td className="font-medium">{i.name}</td>
                  <td>{i.code}</td>
                  <td>{i.itemGroup?.name || '-'}</td>
                  <td>{i.metalType?.name || '-'}</td>
                  <td>{i.purity?.code || '-'}</td>
                  <td className="text-right">{i.mrp ? Number(i.mrp).toLocaleString('en-IN') : '-'}</td>
                  <td className="text-gray-500">{i.description || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   ITEM GROUPS TAB
   ============================================================ */
function ItemGroupsTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', metalTypeId: 0, hsnCode: '711319' });

  const { data: groups, isLoading } = useQuery({ queryKey: ['item-groups'], queryFn: () => mastersAPI.itemGroups().then((r) => r.data) });
  const { data: metals } = useQuery({ queryKey: ['metal-types'], queryFn: () => mastersAPI.metalTypes().then((r) => r.data) });

  const create = useMutation({
    mutationFn: (d: any) => mastersAPI.createItemGroup(d),
    onSuccess: () => { toast.success('Item group created'); qc.invalidateQueries({ queryKey: ['item-groups'] }); setShowForm(false); setForm({ name: '', code: '', metalTypeId: 0, hsnCode: '711319' }); },
    onError: () => toast.error('Failed to create group'),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error('Group name is required');
    if (!form.code.trim()) return toast.error('Group code is required');
    if (!form.metalTypeId) return toast.error('Select a metal type');
    create.mutate(form);
  };

  return (
    <div className="panel">
      <div className="panel-header flex justify-between items-center">
        <span>Item Groups ({groups?.length || 0})</span>
        <button className="btn-primary text-xs" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ New Group'}
        </button>
      </div>

      {showForm && (
        <div className="panel-body border-b bg-blue-50">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="form-label block text-xs">Group Name *</label>
              <input className="form-input w-40" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Anklet" />
            </div>
            <div>
              <label className="form-label block text-xs">Code *</label>
              <input className="form-input w-24 uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="e.g. ANK" maxLength={5} />
            </div>
            <div>
              <label className="form-label block text-xs">Metal Type *</label>
              <select className="form-select w-32" value={form.metalTypeId} onChange={(e) => setForm({ ...form, metalTypeId: Number(e.target.value) })}>
                <option value={0}>Select</option>
                {metals?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label block text-xs">HSN Code</label>
              <input className="form-input w-24" value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
            </div>
            <button onClick={handleSubmit} className="btn-success text-xs px-6" disabled={create.isPending}>
              {create.isPending ? 'Saving...' : '💾 Save'}
            </button>
          </div>
        </div>
      )}

      <div className="panel-body p-0">
        <table className="data-table w-full">
          <thead><tr><th>ID</th><th>Name</th><th>Code</th><th>Metal Type</th><th>HSN</th><th>CGST %</th><th>SGST %</th></tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-6 text-gray-400">Loading...</td></tr>
            ) : groups?.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-6 text-gray-400">No groups found</td></tr>
            ) : (
              groups?.map((g: any) => (
                <tr key={g.id}>
                  <td>{g.id}</td>
                  <td className="font-medium">{g.name}</td>
                  <td>{g.code}</td>
                  <td>{g.metalType?.name || '-'}</td>
                  <td>{g.hsnCode || '-'}</td>
                  <td className="text-right">{Number(g.cgstRate).toFixed(1)}</td>
                  <td className="text-right">{Number(g.sgstRate).toFixed(1)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   LABEL PREFIXES TAB
   ============================================================ */
function PrefixesTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ prefix: '', itemGroupId: 0 });

  const { data: prefixes, isLoading } = useQuery({ queryKey: ['label-prefixes'], queryFn: () => inventoryAPI.prefixes().then((r) => r.data) });
  const { data: groups } = useQuery({ queryKey: ['item-groups'], queryFn: () => mastersAPI.itemGroups().then((r) => r.data) });

  const create = useMutation({
    mutationFn: (d: any) => inventoryAPI.createPrefix(d),
    onSuccess: () => { toast.success('Prefix created'); qc.invalidateQueries({ queryKey: ['label-prefixes'] }); setShowForm(false); setForm({ prefix: '', itemGroupId: 0 }); },
    onError: () => toast.error('Failed to create prefix (may already exist)'),
  });

  const handleSubmit = () => {
    if (!form.prefix.trim()) return toast.error('Prefix is required');
    if (!form.itemGroupId) return toast.error('Select an item group');
    create.mutate(form);
  };

  return (
    <div className="panel">
      <div className="panel-header flex justify-between items-center">
        <span>Label Prefixes ({prefixes?.length || 0})</span>
        <button className="btn-primary text-xs" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ New Prefix'}
        </button>
      </div>

      {showForm && (
        <div className="panel-body border-b bg-blue-50">
          <div className="flex gap-3 items-end">
            <div>
              <label className="form-label block text-xs">Prefix Code *</label>
              <input className="form-input w-24 uppercase" value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="e.g. GA" maxLength={5} />
            </div>
            <div>
              <label className="form-label block text-xs">Item Group *</label>
              <select className="form-select w-48" value={form.itemGroupId} onChange={(e) => setForm({ ...form, itemGroupId: Number(e.target.value) })}>
                <option value={0}>Select Group</option>
                {groups?.map((g: any) => <option key={g.id} value={g.id}>{g.name} ({g.code})</option>)}
              </select>
            </div>
            <button onClick={handleSubmit} className="btn-success text-xs px-6" disabled={create.isPending}>
              {create.isPending ? 'Saving...' : '💾 Save'}
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Label prefix determines the label number format. E.g., prefix "GA" → labels GA/1, GA/2, GA/3...
          </p>
        </div>
      )}

      <div className="panel-body p-0">
        <table className="data-table w-full">
          <thead><tr><th>ID</th><th>Prefix</th><th>Item Group</th><th className="text-right">Last Number</th><th>Status</th></tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-6 text-gray-400">Loading...</td></tr>
            ) : prefixes?.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-6 text-gray-400">No prefixes found</td></tr>
            ) : (
              prefixes?.map((p: any) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td className="font-medium">{p.prefix}</td>
                  <td>{p.itemGroup?.name || '-'}</td>
                  <td className="text-right">{p.lastNumber}</td>
                  <td><span className="text-green-600 text-xs">Active</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   METAL TYPES TAB
   ============================================================ */
function MetalTypesTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '' });

  const { data: metals, isLoading } = useQuery({ queryKey: ['metal-types'], queryFn: () => mastersAPI.metalTypes().then((r) => r.data) });

  const create = useMutation({
    mutationFn: (d: any) => mastersAPI.createMetalType(d),
    onSuccess: () => { toast.success('Metal type created'); qc.invalidateQueries({ queryKey: ['metal-types'] }); setShowForm(false); setForm({ name: '', code: '' }); },
    onError: () => toast.error('Failed to create metal type'),
  });

  return (
    <div className="panel">
      <div className="panel-header flex justify-between items-center">
        <span>Metal Types ({metals?.length || 0})</span>
        <button className="btn-primary text-xs" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ New Metal Type'}
        </button>
      </div>

      {showForm && (
        <div className="panel-body border-b bg-blue-50">
          <div className="flex gap-3 items-end">
            <div>
              <label className="form-label block text-xs">Name *</label>
              <input className="form-input w-40" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Platinum" />
            </div>
            <div>
              <label className="form-label block text-xs">Code *</label>
              <input className="form-input w-24 uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. PT" maxLength={5} />
            </div>
            <button onClick={() => { if (!form.name || !form.code) return toast.error('Fill all fields'); create.mutate(form); }} className="btn-success text-xs px-6" disabled={create.isPending}>
              💾 Save
            </button>
          </div>
        </div>
      )}

      <div className="panel-body p-0">
        <table className="data-table w-full">
          <thead><tr><th>ID</th><th>Name</th><th>Code</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={3} className="text-center py-6 text-gray-400">Loading...</td></tr> :
              metals?.map((m: any) => (<tr key={m.id}><td>{m.id}</td><td className="font-medium">{m.name}</td><td>{m.code}</td></tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   PURITIES TAB
   ============================================================ */
function PuritiesTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', percentage: '' });

  const { data: purities, isLoading } = useQuery({ queryKey: ['purities'], queryFn: () => mastersAPI.purities().then((r) => r.data) });

  const create = useMutation({
    mutationFn: (d: any) => mastersAPI.createPurity(d),
    onSuccess: () => { toast.success('Purity created'); qc.invalidateQueries({ queryKey: ['purities'] }); setShowForm(false); setForm({ name: '', code: '', percentage: '' }); },
    onError: () => toast.error('Failed to create purity'),
  });

  return (
    <div className="panel">
      <div className="panel-header flex justify-between items-center">
        <span>Purities ({purities?.length || 0})</span>
        <button className="btn-primary text-xs" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ New Purity'}
        </button>
      </div>

      {showForm && (
        <div className="panel-body border-b bg-blue-50">
          <div className="flex gap-3 items-end">
            <div>
              <label className="form-label block text-xs">Name *</label>
              <input className="form-input w-32" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 14 KT" />
            </div>
            <div>
              <label className="form-label block text-xs">Code *</label>
              <input className="form-input w-24 uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. 14KT" maxLength={6} />
            </div>
            <div>
              <label className="form-label block text-xs">Percentage *</label>
              <input type="number" step="0.01" className="form-input w-24 text-right" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} placeholder="58.33" />
            </div>
            <button onClick={() => {
              if (!form.name || !form.code || !form.percentage) return toast.error('Fill all fields');
              create.mutate({ ...form, percentage: Number(form.percentage) });
            }} className="btn-success text-xs px-6" disabled={create.isPending}>
              💾 Save
            </button>
          </div>
        </div>
      )}

      <div className="panel-body p-0">
        <table className="data-table w-full">
          <thead><tr><th>ID</th><th>Name</th><th>Code</th><th className="text-right">Percentage %</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={4} className="text-center py-6 text-gray-400">Loading...</td></tr> :
              purities?.map((p: any) => (
                <tr key={p.id}><td>{p.id}</td><td className="font-medium">{p.name}</td><td>{p.code}</td><td className="text-right">{Number(p.percentage).toFixed(2)}</td></tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   COUNTERS TAB
   ============================================================ */
function CountersTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', branchId: 1 });

  const { data: counters, isLoading } = useQuery({ queryKey: ['counters'], queryFn: () => mastersAPI.counters().then((r) => r.data) });

  const create = useMutation({
    mutationFn: (d: any) => mastersAPI.createCounter(d),
    onSuccess: () => { toast.success('Counter created'); qc.invalidateQueries({ queryKey: ['counters'] }); setShowForm(false); setForm({ name: '', code: '', branchId: 1 }); },
    onError: () => toast.error('Failed to create counter'),
  });

  return (
    <div className="panel">
      <div className="panel-header flex justify-between items-center">
        <span>Counters ({counters?.length || 0})</span>
        <button className="btn-primary text-xs" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ New Counter'}
        </button>
      </div>

      {showForm && (
        <div className="panel-body border-b bg-blue-50">
          <div className="flex gap-3 items-end">
            <div>
              <label className="form-label block text-xs">Counter Name *</label>
              <input className="form-input w-40" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Counter 3" />
            </div>
            <div>
              <label className="form-label block text-xs">Code *</label>
              <input className="form-input w-24 uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. C3" maxLength={5} />
            </div>
            <button onClick={() => {
              if (!form.name || !form.code) return toast.error('Fill all fields');
              create.mutate(form);
            }} className="btn-success text-xs px-6" disabled={create.isPending}>
              💾 Save
            </button>
          </div>
        </div>
      )}

      <div className="panel-body p-0">
        <table className="data-table w-full">
          <thead><tr><th>ID</th><th>Name</th><th>Code</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={3} className="text-center py-6 text-gray-400">Loading...</td></tr> :
              counters?.map((c: any) => (
                <tr key={c.id}><td>{c.id}</td><td className="font-medium">{c.name}</td><td>{c.code}</td></tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   SALESMEN TAB
   ============================================================ */
function SalesmenTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', mobile: '' });

  const { data: salesmen, isLoading } = useQuery({ queryKey: ['salesmen'], queryFn: () => mastersAPI.salesmen().then((r) => r.data) });

  const create = useMutation({
    mutationFn: (d: any) => mastersAPI.createSalesman(d),
    onSuccess: () => { toast.success('Salesman created'); qc.invalidateQueries({ queryKey: ['salesmen'] }); setShowForm(false); setForm({ name: '', code: '', mobile: '' }); },
    onError: () => toast.error('Failed to create salesman'),
  });

  return (
    <div className="panel">
      <div className="panel-header flex justify-between items-center">
        <span>Salesmen ({salesmen?.length || 0})</span>
        <button className="btn-primary text-xs" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ New Salesman'}
        </button>
      </div>

      {showForm && (
        <div className="panel-body border-b bg-blue-50">
          <div className="flex gap-3 items-end">
            <div>
              <label className="form-label block text-xs">Name *</label>
              <input className="form-input w-40" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rahul Sharma" />
            </div>
            <div>
              <label className="form-label block text-xs">Code *</label>
              <input className="form-input w-24 uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. RS" maxLength={5} />
            </div>
            <div>
              <label className="form-label block text-xs">Mobile</label>
              <input className="form-input w-32" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="9876543210" maxLength={10} />
            </div>
            <button onClick={() => {
              if (!form.name || !form.code) return toast.error('Fill required fields');
              create.mutate(form);
            }} className="btn-success text-xs px-6" disabled={create.isPending}>
              💾 Save
            </button>
          </div>
        </div>
      )}

      <div className="panel-body p-0">
        <table className="data-table w-full">
          <thead><tr><th>ID</th><th>Name</th><th>Code</th><th>Mobile</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={4} className="text-center py-6 text-gray-400">Loading...</td></tr> :
              salesmen?.map((s: any) => (
                <tr key={s.id}><td>{s.id}</td><td className="font-medium">{s.name}</td><td>{s.code}</td><td>{s.mobile || '-'}</td></tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   METAL RATES TAB
   ============================================================ */
function MetalRatesTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ metalTypeId: 0, purityCode: '', rate: '', date: new Date().toISOString().slice(0, 10) });

  const { data: rates, isLoading } = useQuery({ queryKey: ['metal-rates-latest'], queryFn: () => mastersAPI.latestRates().then((r) => r.data) });
  const { data: metals } = useQuery({ queryKey: ['metal-types'], queryFn: () => mastersAPI.metalTypes().then((r) => r.data) });
  const { data: purities } = useQuery({ queryKey: ['purities'], queryFn: () => mastersAPI.purities().then((r) => r.data) });

  const create = useMutation({
    mutationFn: (d: any) => mastersAPI.createMetalRate(d),
    onSuccess: () => { toast.success('Rate updated'); qc.invalidateQueries({ queryKey: ['metal-rates-latest'] }); setShowForm(false); setForm({ metalTypeId: 0, purityCode: '', rate: '', date: new Date().toISOString().slice(0, 10) }); },
    onError: () => toast.error('Failed to save rate'),
  });

  return (
    <div className="panel">
      <div className="panel-header flex justify-between items-center">
        <span>Latest Metal Rates ({rates?.length || 0})</span>
        <button className="btn-primary text-xs" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ Set Rate'}
        </button>
      </div>

      {showForm && (
        <div className="panel-body border-b bg-blue-50">
          <div className="flex gap-3 items-end">
            <div>
              <label className="form-label block text-xs">Metal Type *</label>
              <select className="form-select w-32" value={form.metalTypeId} onChange={(e) => setForm({ ...form, metalTypeId: Number(e.target.value) })}>
                <option value={0}>Select</option>
                {metals?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label block text-xs">Purity Code *</label>
              <select className="form-select w-28" value={form.purityCode} onChange={(e) => setForm({ ...form, purityCode: e.target.value })}>
                <option value="">Select</option>
                {purities?.map((p: any) => <option key={p.code} value={p.code}>{p.code}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label block text-xs">Rate (₹/gm) *</label>
              <input type="number" step="0.01" className="form-input w-32 text-right" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="e.g. 6500" />
            </div>
            <div>
              <label className="form-label block text-xs">Date</label>
              <input type="date" className="form-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <button onClick={() => {
              if (!form.metalTypeId || !form.purityCode || !form.rate) return toast.error('Fill all fields');
              create.mutate({ ...form, rate: Number(form.rate) });
            }} className="btn-success text-xs px-6" disabled={create.isPending}>
              💾 Save
            </button>
          </div>
        </div>
      )}

      <div className="panel-body p-0">
        <table className="data-table w-full">
          <thead><tr><th>Metal</th><th>Purity</th><th className="text-right">Rate (₹/gm)</th><th>Date</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={4} className="text-center py-6 text-gray-400">Loading...</td></tr> :
              rates?.map((r: any, idx: number) => (
                <tr key={idx}>
                  <td className="font-medium">{r.metalType?.name || '-'}</td>
                  <td>{r.purityCode}</td>
                  <td className="text-right font-medium">{Number(r.rate).toLocaleString('en-IN')}</td>
                  <td>{new Date(r.date).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
