import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsAPI } from '../../lib/api';
import { formatIndianNumber } from '../../lib/utils';
import toast from 'react-hot-toast';
import AccountMasterModal from '../../components/AccountMasterModal';

export default function CustomerList() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('CUSTOMER');
  const [showAccountMaster, setShowAccountMaster] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['accounts-list', search, typeFilter],
    queryFn: () => accountsAPI.list({ search, type: typeFilter }).then((r) => r.data),
  });

  const accounts = data?.accounts || [];

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Filter */}
      <div className="panel">
        <div className="panel-header">Customer / Account Master</div>
        <div className="panel-body flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label block text-xs">Search</label>
            <input className="form-input w-64" placeholder="Name / Mobile / Email / GSTIN..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="form-label block text-xs">Type</label>
            <select className="form-select w-40" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="CUSTOMER">Customer</option>
              <option value="SUPPLIER">Supplier</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <button onClick={() => refetch()} className="btn-primary">🔍 Search</button>
          <button onClick={() => { setEditingAccount(null); setShowAccountMaster(true); }} className="btn-success">+ New Account</button>
        </div>
      </div>

      {/* Table */}
      <div className="panel flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Name</th>
              <th>Mobile</th>
              <th>Email</th>
              <th>City</th>
              <th>GSTIN</th>
              <th>PAN</th>
              <th>Type</th>
              <th className="text-right">Balance</th>
              <th>Bal. Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="text-center py-8">Loading...</td></tr>}
            {!isLoading && accounts.length === 0 && (
              <tr><td colSpan={11} className="text-center py-8 text-gray-400">No accounts found</td></tr>
            )}
            {accounts.map((a: any, idx: number) => (
              <tr key={a.id} className="cursor-pointer hover:bg-blue-50" onDoubleClick={() => { setEditingAccount(a); setShowAccountMaster(true); }}>
                <td>{idx + 1}</td>
                <td className="font-medium">{a.name}</td>
                <td>{a.mobile || '-'}</td>
                <td className="text-xs">{a.email || '-'}</td>
                <td>{a.city || '-'}</td>
                <td className="text-xs font-mono">
                  {a.gstin ? (
                    <span className="flex items-center gap-1">
                      {a.gstin}
                      {a.gstVerified && <span className="text-green-600" title="GST Verified">✓</span>}
                    </span>
                  ) : '-'}
                </td>
                <td className="text-xs">{a.pan || '-'}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    a.type === 'CUSTOMER' ? 'bg-blue-100 text-blue-800' :
                    a.type === 'SUPPLIER' ? 'bg-purple-100 text-purple-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {a.type}
                  </span>
                </td>
                <td className="text-right">{formatIndianNumber(a.closingBalance || 0)}</td>
                <td className="text-xs">{a.balanceType || '-'}</td>
                <td>
                  <button
                    className="text-blue-600 hover:text-blue-800 text-xs underline"
                    onClick={(e) => { e.stopPropagation(); setEditingAccount(a); setShowAccountMaster(true); }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-gray-600">
        {accounts.length} accounts found &nbsp;|&nbsp; Double-click a row to edit &nbsp;|&nbsp; Press F6 in Account Master to search GSTIN
      </div>

      {/* Account Master Modal */}
      <AccountMasterModal
        open={showAccountMaster}
        onClose={() => { setShowAccountMaster(false); setEditingAccount(null); }}
        onSaved={() => { refetch(); }}
        editData={editingAccount}
      />
    </div>
  );
}
