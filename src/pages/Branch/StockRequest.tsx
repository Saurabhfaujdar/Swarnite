/**
 * Stock Request — Browse other branches' stock, request items, manage incoming/outgoing requests
 */
import { useState, useEffect, useCallback } from 'react';
import { stockRequestAPI } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { Eye, Send, CheckCircle, XCircle, RefreshCw, Search, Package, ArrowRight, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

interface Branch { id: number; name: string; code: string; }
interface LabelItem {
  id: number; labelNo: string; grossWeight: number; netWeight: number; pcsCount: number;
  status: string; hasPendingRequest?: boolean;
  item: { name: string; itemGroup?: { name: string }; purity?: { name: string }; metalType?: { name: string } };
  branch: { id: number; name: string; code: string };
}
interface RequestItem {
  id: number; labelNo: string; itemName: string; grossWeight: number; netWeight: number; pcs: number; purityName: string | null;
  label?: { status: string };
}
interface StockReq {
  id: number; requestNo: string; requestDate: string; status: string; narration: string | null;
  totalPcs: number; totalGrossWeight: number;
  requestingBranch: Branch; sourceBranch: Branch;
  items: RequestItem[];
  rejectionReason?: string | null;
}

type Tab = 'browse' | 'outgoing' | 'incoming';

export default function StockRequestPage() {
  const user = useAuthStore(s => s.user);
  const myBranchId = user?.branchId;
  const [tab, setTab] = useState<Tab>('browse');
  const [branches, setBranches] = useState<Branch[]>([]);

  // Browse state
  const [selectedBranchId, setSelectedBranchId] = useState<number | ''>('');
  const [browseLabels, setBrowseLabels] = useState<LabelItem[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseLoading, setBrowseLoading] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Set<number>>(new Set());
  const [narration, setNarration] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Requests state
  const [requests, setRequests] = useState<StockReq[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [expandedReq, setExpandedReq] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    stockRequestAPI.branches().then(r => {
      setBranches(r.data.branches || []);
    });
  }, []);

  const fetchBrowse = useCallback(async () => {
    if (!selectedBranchId) return;
    setBrowseLoading(true);
    try {
      const res = await stockRequestAPI.browse({ branchId: selectedBranchId, search: browseSearch || undefined });
      setBrowseLabels(res.data.labels || []);
      setBrowseTotal(res.data.total || 0);
    } catch { toast.error('Failed to load stock'); }
    setBrowseLoading(false);
  }, [selectedBranchId, browseSearch]);

  useEffect(() => { if (selectedBranchId) fetchBrowse(); }, [fetchBrowse, selectedBranchId]);

  const fetchRequests = useCallback(async (direction: 'outgoing' | 'incoming') => {
    setReqLoading(true);
    try {
      const res = await stockRequestAPI.list({ direction });
      setRequests(res.data.requests || []);
    } catch { toast.error('Failed to load requests'); }
    setReqLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'outgoing' || tab === 'incoming') {
      fetchRequests(tab);
    }
  }, [tab, fetchRequests]);

  const toggleLabel = (id: number) => {
    setSelectedLabels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSubmitRequest = async () => {
    if (selectedLabels.size === 0 || !selectedBranchId) return;
    setSubmitting(true);
    try {
      const items = Array.from(selectedLabels).map(labelId => ({ labelId }));
      await stockRequestAPI.create({ sourceBranchId: selectedBranchId, items, narration: narration || undefined });
      toast.success('Stock request sent!');
      setSelectedLabels(new Set());
      setNarration('');
      fetchBrowse();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send request');
    }
    setSubmitting(false);
  };

  const handleApprove = async (id: number) => {
    try {
      await stockRequestAPI.approve(id);
      toast.success('Request approved — stock transferred');
      fetchRequests(tab as 'outgoing' | 'incoming');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve');
    }
  };

  const handleReject = async () => {
    if (rejectId === null) return;
    try {
      await stockRequestAPI.reject(rejectId, rejectReason);
      toast.success('Request rejected');
      setRejectId(null);
      setRejectReason('');
      fetchRequests(tab as 'outgoing' | 'incoming');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reject');
    }
  };

  const otherBranches = branches.filter(b => b.id !== myBranchId);

  const statusBadge = (s: string) => {
    const cls = s === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : s === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{s}</span>;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-jewel-gold" />
          <h1 className="text-lg font-bold text-gray-800">Stock Requests</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: 'browse' as Tab, label: 'Browse Stock', icon: Eye },
          { key: 'outgoing' as Tab, label: 'My Requests', icon: Send },
          { key: 'incoming' as Tab, label: 'Incoming Requests', icon: Clock },
        ]).map(({ key, label, icon: Icon }) => (
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

      {/* ═══ BROWSE STOCK TAB ═══ */}
      {tab === 'browse' && (
        <div className="space-y-3">
          {/* Branch selector + search */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 max-w-xs">
              <label className="block text-xs text-gray-500 mb-0.5">Select Branch to View</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-xs"
                value={selectedBranchId}
                onChange={e => { setSelectedBranchId(Number(e.target.value) || ''); setSelectedLabels(new Set()); }}
              >
                <option value="">— Choose a branch —</option>
                {otherBranches.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>
            {selectedBranchId && (
              <>
                <div className="flex-1 max-w-xs">
                  <label className="block text-xs text-gray-500 mb-0.5">Search</label>
                  <div className="relative">
                    <Search size={13} className="absolute left-2 top-2 text-gray-400" />
                    <input
                      className="w-full border rounded pl-7 pr-2 py-1.5 text-xs"
                      placeholder="Label no or item name..."
                      value={browseSearch}
                      onChange={e => setBrowseSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && fetchBrowse()}
                    />
                  </div>
                </div>
                <button onClick={fetchBrowse} className="p-1.5 border rounded hover:bg-gray-50">
                  <RefreshCw size={14} />
                </button>
              </>
            )}
          </div>

          {/* Labels table */}
          {selectedBranchId ? (
            <>
              <div className="bg-white rounded border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="w-8 p-2"><input type="checkbox" onChange={e => {
                        if (e.target.checked) setSelectedLabels(new Set(browseLabels.filter(l => !l.hasPendingRequest).map(l => l.id)));
                        else setSelectedLabels(new Set());
                      }} checked={selectedLabels.size > 0 && selectedLabels.size === browseLabels.filter(l => !l.hasPendingRequest).length} /></th>
                      <th className="text-left p-2">Label No</th>
                      <th className="text-left p-2">Item</th>
                      <th className="text-left p-2">Group</th>
                      <th className="text-left p-2">Purity</th>
                      <th className="text-right p-2">Gross Wt (g)</th>
                      <th className="text-right p-2">Net Wt (g)</th>
                      <th className="text-center p-2">Pcs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {browseLoading ? (
                      <tr><td colSpan={8} className="p-4 text-center text-gray-400">Loading...</td></tr>
                    ) : browseLabels.length === 0 ? (
                      <tr><td colSpan={8} className="p-4 text-center text-gray-400">No in-stock items found</td></tr>
                    ) : browseLabels.map(l => (
                      <tr key={l.id} className={`border-b ${l.hasPendingRequest ? 'bg-yellow-50 opacity-70' : 'hover:bg-gray-50 cursor-pointer'} ${selectedLabels.has(l.id) ? 'bg-blue-50' : ''}`} onClick={() => !l.hasPendingRequest && toggleLabel(l.id)}>
                        <td className="p-2 text-center"><input type="checkbox" checked={selectedLabels.has(l.id)} disabled={l.hasPendingRequest} onChange={() => !l.hasPendingRequest && toggleLabel(l.id)} /></td>
                        <td className="p-2 font-mono">{l.labelNo}</td>
                        <td className="p-2">{l.item?.name}</td>
                        <td className="p-2 text-gray-500">{l.item?.itemGroup?.name}</td>
                        <td className="p-2 text-gray-500">{l.item?.purity?.name || '—'}</td>
                        <td className="p-2 text-right">{Number(l.grossWeight).toFixed(3)}</td>
                        <td className="p-2 text-right">{Number(l.netWeight).toFixed(3)}</td>
                        <td className="p-2 text-center">{l.pcsCount}{l.hasPendingRequest && <span className="ml-1 text-[9px] text-yellow-600 font-medium">(Requested)</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-gray-500">{browseTotal} items in stock at this branch</div>

              {/* Request panel */}
              {selectedLabels.size > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-800">{selectedLabels.size} item(s) selected</p>
                    <input
                      className="mt-1 w-full border rounded px-2 py-1 text-xs"
                      placeholder="Add a note (optional)..."
                      value={narration}
                      onChange={e => setNarration(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={handleSubmitRequest}
                    disabled={submitting}
                    className="flex items-center gap-1 px-4 py-2 bg-jewel-gold text-white text-xs rounded hover:bg-yellow-600 disabled:opacity-50"
                  >
                    <Send size={13} /> {submitting ? 'Sending...' : 'Request Items'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded border p-8 text-center text-xs text-gray-400">
              <Eye size={32} className="mx-auto mb-2 text-gray-300" />
              Select a branch above to view their available stock
            </div>
          )}
        </div>
      )}

      {/* ═══ OUTGOING / INCOMING REQUESTS TAB ═══ */}
      {(tab === 'outgoing' || tab === 'incoming') && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <button onClick={() => fetchRequests(tab)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          <div className="bg-white rounded border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left p-2">Request #</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">{tab === 'outgoing' ? 'From Branch' : 'Requested By'}</th>
                  <th className="text-center p-2">Items</th>
                  <th className="text-right p-2">Gross Wt</th>
                  <th className="text-center p-2">Status</th>
                  {tab === 'incoming' && <th className="text-center p-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {reqLoading ? (
                  <tr><td colSpan={7} className="p-4 text-center text-gray-400">Loading...</td></tr>
                ) : requests.length === 0 ? (
                  <tr><td colSpan={7} className="p-4 text-center text-gray-400">No requests found</td></tr>
                ) : requests.map(r => (
                  <>
                    <tr
                      key={r.id}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedReq(expandedReq === r.id ? null : r.id)}
                    >
                      <td className="p-2 font-mono">{r.requestNo}</td>
                      <td className="p-2">{new Date(r.requestDate).toLocaleDateString('en-IN')}</td>
                      <td className="p-2">{tab === 'outgoing' ? r.sourceBranch.name : r.requestingBranch.name}</td>
                      <td className="p-2 text-center">{r.totalPcs}</td>
                      <td className="p-2 text-right">{Number(r.totalGrossWeight).toFixed(3)}g</td>
                      <td className="p-2 text-center">{statusBadge(r.status)}</td>
                      {tab === 'incoming' && (
                        <td className="p-2 text-center">
                          {r.status === 'PENDING' && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleApprove(r.id); }}
                                className="flex items-center gap-0.5 px-2 py-1 bg-green-600 text-white rounded text-[10px] hover:bg-green-700"
                              >
                                <CheckCircle size={11} /> Approve
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setRejectId(r.id); }}
                                className="flex items-center gap-0.5 px-2 py-1 bg-red-500 text-white rounded text-[10px] hover:bg-red-600"
                              >
                                <XCircle size={11} /> Reject
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                    {/* Expanded items */}
                    {expandedReq === r.id && (
                      <tr key={`${r.id}-items`}>
                        <td colSpan={7} className="bg-gray-50 p-2">
                          <div className="text-[10px] text-gray-500 mb-1">
                            {tab === 'outgoing'
                              ? <span>Requested from <strong>{r.sourceBranch.name}</strong></span>
                              : <span>Requested by <strong>{r.requestingBranch.name}</strong></span>
                            }
                            {r.narration && <span className="ml-2 italic">— {r.narration}</span>}
                            {r.rejectionReason && <span className="ml-2 text-red-600">Reason: {r.rejectionReason}</span>}
                          </div>
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-0.5">Label No</th>
                                <th className="text-left py-0.5">Item</th>
                                <th className="text-left py-0.5">Purity</th>
                                <th className="text-right py-0.5">Gross Wt</th>
                                <th className="text-center py-0.5">Pcs</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.items.map(item => (
                                <tr key={item.id} className="border-b border-gray-100">
                                  <td className="py-0.5 font-mono">{item.labelNo}</td>
                                  <td className="py-0.5">{item.itemName}</td>
                                  <td className="py-0.5 text-gray-500">{item.purityName || '—'}</td>
                                  <td className="py-0.5 text-right">{Number(item.grossWeight).toFixed(3)}g</td>
                                  <td className="py-0.5 text-center">{item.pcs}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {rejectId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-96 space-y-3">
            <h3 className="font-semibold text-sm text-red-600">Reject Stock Request?</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Reason (optional)</label>
              <input className="w-full border rounded px-2 py-1 text-xs" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Items needed at this branch" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRejectId(null); setRejectReason(''); }} className="px-3 py-1.5 border rounded text-xs">Cancel</button>
              <button onClick={handleReject} className="px-3 py-1.5 bg-red-600 text-white rounded text-xs">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
