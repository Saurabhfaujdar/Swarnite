import { useState, useEffect, useCallback } from 'react';
import { branchManagementAPI } from '../../lib/api';
import { Building2, Plus, Edit2, Trash2, Power, PowerOff, ArrowRightLeft, Eye, ChevronDown, ChevronRight, RefreshCw, Shield, Store } from 'lucide-react';

interface Branch {
  id: number;
  name: string;
  code: string;
  branchType: string;
  isMaster: boolean;
  parentId: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  isActive: boolean;
  isDeleted: boolean;
  companyId: number;
  company?: { id: number; name: string };
  parent?: { id: number; name: string; code: string } | null;
  children?: { id: number; name: string; code: string; isActive: boolean; city: string }[];
  _count?: { children: number; users: number; labels: number; salesVouchers: number };
}

interface BranchStats {
  branchId: number;
  inventory: { total: number; inStock: number; sold: number };
  sales: number;
  purchases: number;
  users: number;
  transfers: { outgoing: number; incoming: number };
}

interface TransferHistory {
  id: number;
  voucherNo: string;
  voucherDate: string;
  issuingBranch: { id: number; name: string; code: string };
  receivingBranch: { id: number; name: string; code: string };
  totalPcs: number;
  totalAmount: number;
  items: { itemName: string; grossWeight: number; pcs: number; totalAmount: number }[];
}

type TabType = 'branches' | 'transfers' | 'audit';

export default function BranchManagement() {
  const [tab, setTab] = useState<TabType>('branches');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [branchStats, setBranchStats] = useState<BranchStats | null>(null);
  const [transfers, setTransfers] = useState<TransferHistory[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [expandedBranch, setExpandedBranch] = useState<number | null>(null);

  // Create branch form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', code: '', address: '', city: '', state: '', phone: '', email: '', gstin: '' });

  // Dialogs
  const [showDisable, setShowDisable] = useState<Branch | null>(null);
  const [showDelete, setShowDelete] = useState<Branch | null>(null);
  const [showEdit, setShowEdit] = useState<Branch | null>(null);
  const [editForm, setEditForm] = useState({ name: '', address: '', city: '', state: '', phone: '', email: '', gstin: '' });

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await branchManagementAPI.list();
      setBranches(res.data.branches || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  const fetchStats = async (branchId: number) => {
    try {
      const res = await branchManagementAPI.stats(branchId);
      setBranchStats(res.data);
    } catch { setBranchStats(null); }
  };

  const fetchTransfers = async () => {
    try {
      const res = await branchManagementAPI.transferHistory();
      setTransfers(res.data.transfers || []);
    } catch { /* ignore */ }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await branchManagementAPI.auditLog({ entityType: 'Branch' });
      setAuditLogs(res.data.logs || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (tab === 'transfers') fetchTransfers();
    if (tab === 'audit') fetchAuditLogs();
  }, [tab]);

  const handleCreate = async () => {
    if (!createForm.name || !createForm.code) return;
    try {
      const masterBranch = branches.find(b => b.isMaster);
      await branchManagementAPI.create({
        ...createForm,
        companyId: masterBranch?.companyId || 1,
        parentId: masterBranch?.id,
      });
      setShowCreate(false);
      setCreateForm({ name: '', code: '', address: '', city: '', state: '', phone: '', email: '', gstin: '' });
      fetchBranches();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create branch');
    }
  };

  const handleDisable = async (branch: Branch) => {
    try {
      await branchManagementAPI.disable(branch.id);
      setShowDisable(null);
      fetchBranches();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to disable branch');
    }
  };

  const handleEnable = async (branchId: number) => {
    try {
      await branchManagementAPI.enable(branchId);
      fetchBranches();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to enable branch');
    }
  };

  const handleDelete = async (branch: Branch) => {
    try {
      await branchManagementAPI.softDelete(branch.id);
      setShowDelete(null);
      fetchBranches();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete branch');
    }
  };

  const handleEdit = async () => {
    if (!showEdit) return;
    try {
      await branchManagementAPI.update(showEdit.id, editForm);
      setShowEdit(null);
      fetchBranches();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update branch');
    }
  };

  const openEdit = (branch: Branch) => {
    setEditForm({
      name: branch.name,
      address: branch.address || '',
      city: branch.city || '',
      state: branch.state || '',
      phone: branch.phone || '',
      email: branch.email || '',
      gstin: branch.gstin || '',
    });
    setShowEdit(branch);
  };

  const selectBranch = (branch: Branch) => {
    setSelectedBranch(branch);
    fetchStats(branch.id);
  };

  const masterBranch = branches.find(b => b.isMaster);
  const childBranches = branches.filter(b => !b.isMaster);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 size={20} className="text-jewel-gold" />
          <h1 className="text-lg font-bold text-gray-800">Branch Management</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-jewel-gold text-white text-xs rounded hover:bg-yellow-600"
          >
            <Plus size={14} /> New Branch
          </button>
          <button onClick={fetchBranches} className="p-1.5 border rounded hover:bg-gray-50">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[
          { key: 'branches' as TabType, label: 'Branches', icon: Building2 },
          { key: 'transfers' as TabType, label: 'Transfer History', icon: ArrowRightLeft },
          { key: 'audit' as TabType, label: 'Audit Log', icon: Shield },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1 px-3 py-2 text-xs border-b-2 transition-colors ${
              tab === key ? 'border-jewel-gold text-jewel-gold font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ═══ BRANCHES TAB ═══ */}
      {tab === 'branches' && (
        <div className="grid grid-cols-3 gap-3">
          {/* Branch Tree */}
          <div className="col-span-2 bg-white rounded border p-3">
            <h2 className="text-sm font-semibold mb-2 text-gray-700">Store Hierarchy</h2>
            {loading ? (
              <p className="text-xs text-gray-400 py-4 text-center">Loading branches...</p>
            ) : (
              <div className="space-y-1">
                {/* Master Branch */}
                {masterBranch && (
                  <div>
                    <div
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer text-xs ${
                        selectedBranch?.id === masterBranch.id ? 'bg-yellow-50 border border-yellow-300' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => selectBranch(masterBranch)}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedBranch(expandedBranch === masterBranch.id ? null : masterBranch.id); }}
                        className="p-0.5"
                      >
                        {expandedBranch === masterBranch.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <Store size={14} className="text-jewel-gold" />
                      <span className="font-semibold">{masterBranch.name}</span>
                      <span className="text-gray-400">({masterBranch.code})</span>
                      <span className="ml-auto px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px] font-medium">MASTER</span>
                    </div>

                    {/* Child branches */}
                    {expandedBranch === masterBranch.id && (
                      <div className="ml-6 space-y-0.5 mt-0.5">
                        {childBranches.length === 0 ? (
                          <p className="text-[10px] text-gray-400 py-1 ml-4">No branch stores yet</p>
                        ) : (
                          childBranches.map(b => (
                            <div
                              key={b.id}
                              className={`flex items-center gap-2 p-2 rounded cursor-pointer text-xs ${
                                selectedBranch?.id === b.id ? 'bg-blue-50 border border-blue-300' : 'hover:bg-gray-50'
                              } ${!b.isActive ? 'opacity-50' : ''}`}
                              onClick={() => selectBranch(b)}
                            >
                              <Building2 size={13} className="text-gray-400" />
                              <span>{b.name}</span>
                              <span className="text-gray-400">({b.code})</span>
                              {b.city && <span className="text-gray-400">• {b.city}</span>}
                              <div className="ml-auto flex items-center gap-1">
                                {!b.isActive && (
                                  <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px]">Disabled</span>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); openEdit(b); }} className="p-1 hover:bg-gray-100 rounded" title="Edit">
                                  <Edit2 size={12} />
                                </button>
                                {b.isActive ? (
                                  <button onClick={(e) => { e.stopPropagation(); setShowDisable(b); }} className="p-1 hover:bg-red-50 rounded text-red-500" title="Disable">
                                    <PowerOff size={12} />
                                  </button>
                                ) : (
                                  <button onClick={(e) => { e.stopPropagation(); handleEnable(b.id); }} className="p-1 hover:bg-green-50 rounded text-green-600" title="Enable">
                                    <Power size={12} />
                                  </button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); setShowDelete(b); }} className="p-1 hover:bg-red-50 rounded text-red-500" title="Delete">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats Panel */}
          <div className="bg-white rounded border p-3">
            {selectedBranch && branchStats ? (
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-1">
                    {selectedBranch.isMaster ? <Store size={14} className="text-jewel-gold" /> : <Building2 size={14} />}
                    {selectedBranch.name}
                  </h3>
                  <p className="text-[10px] text-gray-400">{selectedBranch.code} • {selectedBranch.city || 'No city'}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-blue-50 p-2 rounded">
                    <div className="text-blue-600 font-semibold">{branchStats.inventory.inStock}</div>
                    <div className="text-gray-500">In Stock</div>
                  </div>
                  <div className="bg-green-50 p-2 rounded">
                    <div className="text-green-600 font-semibold">{branchStats.sales}</div>
                    <div className="text-gray-500">Sales</div>
                  </div>
                  <div className="bg-purple-50 p-2 rounded">
                    <div className="text-purple-600 font-semibold">{branchStats.users}</div>
                    <div className="text-gray-500">Users</div>
                  </div>
                  <div className="bg-orange-50 p-2 rounded">
                    <div className="text-orange-600 font-semibold">{branchStats.inventory.sold}</div>
                    <div className="text-gray-500">Sold</div>
                  </div>
                  <div className="bg-cyan-50 p-2 rounded">
                    <div className="text-cyan-600 font-semibold">{branchStats.transfers.outgoing}</div>
                    <div className="text-gray-500">Transfers Out</div>
                  </div>
                  <div className="bg-teal-50 p-2 rounded">
                    <div className="text-teal-600 font-semibold">{branchStats.transfers.incoming}</div>
                    <div className="text-gray-500">Transfers In</div>
                  </div>
                </div>

                {selectedBranch.gstin && (
                  <div className="text-xs text-gray-500">
                    <span className="font-medium">GSTIN:</span> {selectedBranch.gstin}
                  </div>
                )}
                {selectedBranch.phone && (
                  <div className="text-xs text-gray-500">
                    <span className="font-medium">Phone:</span> {selectedBranch.phone}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-400 text-center py-8">
                Select a branch to view details
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ TRANSFERS TAB ═══ */}
      {tab === 'transfers' && (
        <div className="bg-white rounded border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left p-2">Voucher</th>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">From</th>
                <th className="text-left p-2">To</th>
                <th className="text-right p-2">Items</th>
                <th className="text-right p-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-gray-400">No transfers found</td></tr>
              ) : (
                transfers.map(t => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="p-2 font-mono">{t.voucherNo}</td>
                    <td className="p-2">{new Date(t.voucherDate).toLocaleDateString('en-IN')}</td>
                    <td className="p-2">{t.issuingBranch.name}</td>
                    <td className="p-2">{t.receivingBranch.name}</td>
                    <td className="p-2 text-right">{t.totalPcs}</td>
                    <td className="p-2 text-right font-medium">₹{Number(t.totalAmount).toLocaleString('en-IN')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ AUDIT TAB ═══ */}
      {tab === 'audit' && (
        <div className="bg-white rounded border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left p-2">Time</th>
                <th className="text-left p-2">Action</th>
                <th className="text-left p-2">Entity</th>
                <th className="text-left p-2">Branch</th>
                <th className="text-left p-2">User</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-gray-400">No audit logs found</td></tr>
              ) : (
                auditLogs.map((log: any) => (
                  <tr key={log.id} className="border-b hover:bg-gray-50">
                    <td className="p-2">{new Date(log.createdAt).toLocaleString('en-IN')}</td>
                    <td className="p-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        log.action === 'CREATE' ? 'bg-green-100 text-green-700' :
                        log.action === 'DELETE' ? 'bg-red-100 text-red-700' :
                        log.action === 'DISABLE' ? 'bg-orange-100 text-orange-700' :
                        log.action === 'TRANSFER' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-2">{log.entityType} #{log.entityId}</td>
                    <td className="p-2">{log.branch?.name || '—'}</td>
                    <td className="p-2">User #{log.userId}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ DIALOGS ═══ */}

      {/* Create Branch Dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-[480px] space-y-3">
            <h3 className="font-semibold text-sm">Create New Branch Store</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-gray-500 mb-0.5">Branch Name *</label>
                <input className="w-full border rounded px-2 py-1" value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-gray-500 mb-0.5">Branch Code *</label>
                <input className="w-full border rounded px-2 py-1" value={createForm.code} onChange={e => setCreateForm({...createForm, code: e.target.value.toUpperCase()})} />
              </div>
              <div className="col-span-2">
                <label className="block text-gray-500 mb-0.5">Address</label>
                <input className="w-full border rounded px-2 py-1" value={createForm.address} onChange={e => setCreateForm({...createForm, address: e.target.value})} />
              </div>
              <div>
                <label className="block text-gray-500 mb-0.5">City</label>
                <input className="w-full border rounded px-2 py-1" value={createForm.city} onChange={e => setCreateForm({...createForm, city: e.target.value})} />
              </div>
              <div>
                <label className="block text-gray-500 mb-0.5">State</label>
                <input className="w-full border rounded px-2 py-1" value={createForm.state} onChange={e => setCreateForm({...createForm, state: e.target.value})} />
              </div>
              <div>
                <label className="block text-gray-500 mb-0.5">Phone</label>
                <input className="w-full border rounded px-2 py-1" value={createForm.phone} onChange={e => setCreateForm({...createForm, phone: e.target.value})} />
              </div>
              <div>
                <label className="block text-gray-500 mb-0.5">GSTIN</label>
                <input className="w-full border rounded px-2 py-1" value={createForm.gstin} onChange={e => setCreateForm({...createForm, gstin: e.target.value.toUpperCase()})} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 border rounded text-xs">Cancel</button>
              <button onClick={handleCreate} disabled={!createForm.name || !createForm.code} className="px-3 py-1.5 bg-jewel-gold text-white rounded text-xs disabled:opacity-50">Create Branch</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Branch Dialog */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-[480px] space-y-3">
            <h3 className="font-semibold text-sm">Edit Branch: {showEdit.name}</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-gray-500 mb-0.5">Branch Name</label>
                <input className="w-full border rounded px-2 py-1" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-gray-500 mb-0.5">City</label>
                <input className="w-full border rounded px-2 py-1" value={editForm.city} onChange={e => setEditForm({...editForm, city: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="block text-gray-500 mb-0.5">Address</label>
                <input className="w-full border rounded px-2 py-1" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} />
              </div>
              <div>
                <label className="block text-gray-500 mb-0.5">Phone</label>
                <input className="w-full border rounded px-2 py-1" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
              </div>
              <div>
                <label className="block text-gray-500 mb-0.5">GSTIN</label>
                <input className="w-full border rounded px-2 py-1" value={editForm.gstin} onChange={e => setEditForm({...editForm, gstin: e.target.value.toUpperCase()})} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowEdit(null)} className="px-3 py-1.5 border rounded text-xs">Cancel</button>
              <button onClick={handleEdit} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Disable Confirmation */}
      {showDisable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-96 space-y-3">
            <h3 className="font-semibold text-sm text-orange-600">Disable Branch?</h3>
            <p className="text-xs text-gray-600">
              Disabling <strong>{showDisable.name}</strong> will prevent any new transactions.
              Existing data will be preserved. You can re-enable it later.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDisable(null)} className="px-3 py-1.5 border rounded text-xs">Cancel</button>
              <button onClick={() => handleDisable(showDisable)} className="px-3 py-1.5 bg-orange-500 text-white rounded text-xs">Disable Branch</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-96 space-y-3">
            <h3 className="font-semibold text-sm text-red-600">Delete Branch?</h3>
            <p className="text-xs text-gray-600">
              This will soft-delete <strong>{showDelete.name}</strong>. The branch will be
              hidden but data will be preserved. This requires no active inventory, sales, or users.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDelete(null)} className="px-3 py-1.5 border rounded text-xs">Cancel</button>
              <button onClick={() => handleDelete(showDelete)} className="px-3 py-1.5 bg-red-600 text-white rounded text-xs">Delete Branch</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
