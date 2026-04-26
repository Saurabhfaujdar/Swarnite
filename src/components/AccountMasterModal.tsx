import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountsAPI, customerPaymentsAPI } from '../lib/api';
import { formatIndianNumber } from '../lib/utils';
import toast from 'react-hot-toast';
import { Search, X, Shield, Building2, Save, ChevronDown } from 'lucide-react';

/* ============================================================
   Types
   ============================================================ */
interface AccountFormData {
  name: string;
  type: string;
  groupHead: string;
  customerCategory: string;
  mobile: string;
  phone: string;
  email: string;
  blockNo: string;
  building: string;
  street: string;
  area: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  gstVerified: boolean;
  gstTradeName: string;
  gstStatus: string;
  compositionScheme: boolean;
  pan: string;
  aadhar: string;
  idProof: string;
  reference: string;
  remark: string;
  balanceType: string;
  openingBalance: number;
}

interface GSTSearchResult {
  gstin: string;
  valid: boolean;
  stateCode: string;
  stateName: string;
  pan: string;
  tradeName: string;
  legalName: string;
  status: string;
  type: string;
  address: string;
  blockNo: string;
  building: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  existingAccount?: { id: number; name: string; type: string } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (account: any) => void;
  /** Pre-fill data for editing */
  editData?: any;
  /** Lock the type to a specific value */
  forceType?: string;
}

const EMPTY_FORM: AccountFormData = {
  name: '',
  type: 'CUSTOMER',
  groupHead: 'Sundry Debtors',
  customerCategory: 'Normal',
  mobile: '',
  phone: '',
  email: '',
  blockNo: '',
  building: '',
  street: '',
  area: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  gstin: '',
  gstVerified: false,
  gstTradeName: '',
  gstStatus: '',
  compositionScheme: false,
  pan: '',
  aadhar: '',
  idProof: '',
  reference: '',
  remark: '',
  balanceType: 'DR',
  openingBalance: 0,
};

const GROUP_HEADS: Record<string, string[]> = {
  CUSTOMER: ['Sundry Debtors', 'Cash', 'Advance from Customers'],
  SUPPLIER: ['Sundry Creditors', 'Cash', 'Advance to Suppliers'],
  BANK: ['Bank Accounts', 'Bank OCC A/c', 'Bank OD A/c'],
  EXPENSE: ['Direct Expenses', 'Indirect Expenses'],
  INCOME: ['Direct Incomes', 'Indirect Incomes', 'Sales Accounts'],
  CASH: ['Cash-in-Hand'],
  BRANCH: ['Branch / Divisions'],
  SALESMAN: ['Sundry Debtors'],
};

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu',
  'Lakshadweep', 'Andaman & Nicobar Islands',
];

/* ============================================================
   Component
   ============================================================ */
export default function AccountMasterModal({ open, onClose, onSaved, editData, forceType }: Props) {
  const queryClient = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const gstinInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<AccountFormData>({ ...EMPTY_FORM });
  const [showGSTSearch, setShowGSTSearch] = useState(false);
  const [gstSearchInput, setGstSearchInput] = useState('');
  const [gstResult, setGstResult] = useState<GSTSearchResult | null>(null);
  const [activeTab, setActiveTab] = useState<'address' | 'tds' | 'metal' | 'bill' | 'payments' | 'history'>('address');

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      if (editData) {
        setForm({
          ...EMPTY_FORM,
          ...editData,
          openingBalance: Number(editData.closingBalance || editData.openingBalance || 0),
        });
      } else {
        setForm({ ...EMPTY_FORM, type: forceType || 'CUSTOMER' });
      }
      setGstResult(null);
      setGstSearchInput('');
      setShowGSTSearch(false);
      setTimeout(() => nameRef.current?.focus(), 100);
    }
  }, [open, editData, forceType]);

  const updateField = useCallback((field: keyof AccountFormData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // When account category changes, update group head default
  useEffect(() => {
    const heads = GROUP_HEADS[form.type] || ['Sundry Debtors'];
    if (!heads.includes(form.groupHead)) {
      updateField('groupHead', heads[0]);
    }
  }, [form.type]);

  /* ---- GST Search ---- */
  const openGSTSearch = useCallback(() => {
    setGstResult(null);
    setGstSearchInput('');
    setShowGSTSearch(true);
    setTimeout(() => gstinInputRef.current?.focus(), 100);
  }, []);

  const accountId = editData?.id as number | undefined;
  const historyQuery = useQuery({
    queryKey: ['account-history', accountId],
    queryFn: () => accountsAPI.history(accountId!).then(r => r.data),
    enabled: activeTab === 'history' && !!accountId,
  });

  const paymentsQuery = useQuery({
    queryKey: ['account-payments', accountId],
    queryFn: () => customerPaymentsAPI.list({ accountId: accountId! }).then(r => r.data),
    enabled: activeTab === 'payments' && !!accountId,
  });

  const gstSearchMutation = useMutation({
    mutationFn: (gstin: string) => accountsAPI.gstSearch(gstin),
    onSuccess: (res) => {
      const data: GSTSearchResult = res.data;
      setGstResult(data);

      if (data.existingAccount) {
        toast(`GSTIN already linked to: ${data.existingAccount.name}`, { icon: '⚠️' });
      }

      if (data.tradeName || data.legalName) {
        toast.success('GST details fetched successfully');
      } else {
        toast('GSTIN format valid. Enter firm details manually.', { icon: 'ℹ️' });
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Failed to search GSTIN';
      toast.error(msg);
      setGstResult(null);
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F6') {
        e.preventDefault();
        openGSTSearch();
      }
      if (e.key === 'Escape') {
        if (showGSTSearch) {
          setShowGSTSearch(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, showGSTSearch, onClose, openGSTSearch]);

  const handleGSTSearch = useCallback(() => {
    const cleaned = gstSearchInput.trim().toUpperCase();
    if (!cleaned) {
      toast.error('Please enter a GSTIN number');
      gstinInputRef.current?.focus();
      return;
    }
    setGstResult(null);
    gstSearchMutation.mutate(cleaned);
  }, [gstSearchInput, gstSearchMutation]);

  const applyGSTData = useCallback(() => {
    if (!gstResult) return;
    setForm((prev) => ({
      ...prev,
      gstin: gstResult.gstin,
      gstVerified: !!(gstResult.tradeName || gstResult.legalName),
      gstTradeName: gstResult.tradeName || gstResult.legalName || '',
      gstStatus: gstResult.status || '',
      pan: gstResult.pan || prev.pan,
      name: prev.name || gstResult.legalName || gstResult.tradeName || '',
      blockNo: gstResult.blockNo || prev.blockNo,
      building: gstResult.building || prev.building,
      street: gstResult.street || prev.street,
      area: gstResult.area || prev.area,
      city: gstResult.city || prev.city,
      state: gstResult.state || gstResult.stateName || prev.state,
      pincode: gstResult.pincode || prev.pincode,
    }));
    setShowGSTSearch(false);
    toast.success('GST details applied to form');
  }, [gstResult]);

  /* ---- Save ---- */
  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editData ? accountsAPI.update(editData.id, payload) : accountsAPI.create(payload),
    onSuccess: (res) => {
      toast.success(editData ? 'Account updated!' : 'Account created!');
      queryClient.invalidateQueries({ queryKey: ['accounts-list'] });
      queryClient.invalidateQueries({ queryKey: ['customer-modal-search'] });
      if (onSaved) onSaved(res.data);
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to save account'),
  });

  const handleSave = useCallback(() => {
    if (!form.name.trim()) {
      toast.error('Account Name is required');
      nameRef.current?.focus();
      return;
    }

    // Build full address from parts
    const fullAddress = [form.blockNo, form.building, form.street, form.area]
      .filter(Boolean)
      .join(', ') || form.address;

    saveMutation.mutate({
      ...form,
      name: form.name.trim(),
      address: fullAddress,
    });
  }, [form, saveMutation, editData]);

  if (!open) return null;

  const groupHeads = GROUP_HEADS[form.type] || ['Sundry Debtors'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[#f0f0f0] rounded shadow-2xl w-[980px] max-h-[92vh] flex flex-col border border-gray-400">
        {/* ======== Title Bar ======== */}
        <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-blue-700 to-blue-500 text-white rounded-t">
          <div className="flex items-center gap-2">
            <Building2 size={16} />
            <h3 className="text-sm font-semibold">Account Master</h3>
          </div>
          <button onClick={onClose} className="text-white hover:text-red-200 text-lg leading-none">&times;</button>
        </div>

        {/* ======== Body ======== */}
        <div className="flex-1 overflow-auto p-4">
          <div className="flex gap-4">
            {/* ---- Left Column: Main Fields ---- */}
            <div className="flex-1">
              {/* Account Name */}
              <div className="grid grid-cols-[140px_1fr] items-center gap-y-2 gap-x-2">
                <label className="text-xs font-semibold text-right">Account Name</label>
                <input
                  ref={nameRef}
                  type="text"
                  className="form-input w-full text-sm font-semibold"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Enter account name"
                />

                {/* Account Category */}
                <label className="text-xs font-semibold text-right">Account Category</label>
                <select
                  className="form-select w-full text-sm"
                  value={form.type}
                  onChange={(e) => updateField('type', e.target.value)}
                  disabled={!!forceType}
                >
                  <option value="CUSTOMER">Customer</option>
                  <option value="SUPPLIER">Supplier</option>
                  <option value="BANK">Bank</option>
                  <option value="CASH">Cash</option>
                  <option value="EXPENSE">Expense</option>
                  <option value="INCOME">Income</option>
                  <option value="BRANCH">Branch</option>
                  <option value="SALESMAN">Salesman</option>
                </select>

                {/* Group Head */}
                <label className="text-xs font-semibold text-right">Group Head</label>
                <select
                  className="form-select w-full text-sm"
                  value={form.groupHead}
                  onChange={(e) => updateField('groupHead', e.target.value)}
                >
                  {groupHeads.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>

                {/* Opening Balance */}
                <label className="text-xs font-semibold text-right">Opening Balance</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    className="form-input w-32 text-right text-sm"
                    value={form.openingBalance || ''}
                    onChange={(e) => updateField('openingBalance', Number(e.target.value))}
                    step="0.01"
                  />
                  <select
                    className="form-select w-16 text-sm"
                    value={form.balanceType}
                    onChange={(e) => updateField('balanceType', e.target.value)}
                  >
                    <option value="DR">DR</option>
                    <option value="CR">CR</option>
                    <option value="NONE">-</option>
                  </select>
                </div>

                {/* Remark */}
                <label className="text-xs font-semibold text-right align-top pt-1">Remark</label>
                <textarea
                  className="form-input w-full text-sm"
                  rows={2}
                  value={form.remark}
                  onChange={(e) => updateField('remark', e.target.value)}
                  placeholder="Notes / remarks"
                />

                {/* Customer Category */}
                <label className="text-xs font-semibold text-right">Customer Category</label>
                <select
                  className="form-select w-48 text-sm"
                  value={form.customerCategory}
                  onChange={(e) => updateField('customerCategory', e.target.value)}
                >
                  <option value="Normal">Normal</option>
                  <option value="Premium">Premium</option>
                  <option value="VIP">VIP</option>
                  <option value="Wholesale">Wholesale</option>
                  <option value="Corporate">Corporate</option>
                </select>
              </div>
            </div>

            {/* ---- Right Column: GSTIN Status Badge ---- */}
            <div className="w-48 flex flex-col items-center gap-2 pt-1">
              {form.gstVerified && (
                <div className="bg-green-50 border border-green-300 rounded p-2 text-center w-full">
                  <Shield size={20} className="text-green-600 mx-auto mb-1" />
                  <div className="text-[10px] text-green-700 font-semibold">GST VERIFIED</div>
                  <div className="text-[10px] text-green-800 font-mono mt-1">{form.gstin}</div>
                  {form.gstTradeName && (
                    <div className="text-[10px] text-green-700 mt-0.5">{form.gstTradeName}</div>
                  )}
                  {form.gstStatus && (
                    <div className={`text-[10px] mt-0.5 font-semibold ${
                      form.gstStatus === 'Active' ? 'text-green-700' : 'text-orange-600'
                    }`}>
                      Status: {form.gstStatus}
                    </div>
                  )}
                </div>
              )}

              {form.gstin && !form.gstVerified && (
                <div className="bg-yellow-50 border border-yellow-300 rounded p-2 text-center w-full">
                  <div className="text-[10px] text-yellow-700 font-semibold">GSTIN SET</div>
                  <div className="text-[10px] text-yellow-800 font-mono mt-1">{form.gstin}</div>
                  <div className="text-[10px] text-yellow-600 mt-0.5">Not verified via API</div>
                </div>
              )}
            </div>
          </div>

          {/* ======== Tab Section ======== */}
          <div className="mt-4 border border-gray-300 rounded bg-white">
            {/* Tab Headers */}
            <div className="flex border-b border-gray-300 bg-gray-50">
              {([
                { key: 'address', label: 'Address Detail' },
                { key: 'tds', label: 'TDS Entry' },
                { key: 'metal', label: 'Metal Outstanding' },
                { key: 'bill', label: 'Bill To Bill' },
                { key: 'payments', label: 'Payments' },
                ...(editData?.id ? [{ key: 'history' as const, label: 'Sales & OG History' }] : []),
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  className={`px-4 py-2 text-xs font-semibold border-r border-gray-300 transition-colors ${
                    activeTab === tab.key
                      ? 'bg-white text-blue-700 border-b-2 border-b-blue-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-4">
              {activeTab === 'address' && (
                <div className="grid grid-cols-[100px_1fr_100px_1fr] gap-x-3 gap-y-2 items-center">
                  <label className="text-xs font-semibold text-right">Block No.</label>
                  <input
                    type="text"
                    className="form-input text-sm"
                    value={form.blockNo}
                    onChange={(e) => updateField('blockNo', e.target.value)}
                  />
                  <label className="text-xs font-semibold text-right">Building</label>
                  <input
                    type="text"
                    className="form-input text-sm"
                    value={form.building}
                    onChange={(e) => updateField('building', e.target.value)}
                  />

                  <label className="text-xs font-semibold text-right">Street</label>
                  <input
                    type="text"
                    className="form-input text-sm"
                    value={form.street}
                    onChange={(e) => updateField('street', e.target.value)}
                  />
                  <label className="text-xs font-semibold text-right">Area</label>
                  <input
                    type="text"
                    className="form-input text-sm"
                    value={form.area}
                    onChange={(e) => updateField('area', e.target.value)}
                  />

                  <label className="text-xs font-semibold text-right">City</label>
                  <input
                    type="text"
                    className="form-input text-sm"
                    value={form.city}
                    onChange={(e) => updateField('city', e.target.value)}
                  />
                  <label className="text-xs font-semibold text-right">Mobile</label>
                  <input
                    type="text"
                    className="form-input text-sm"
                    value={form.mobile}
                    onChange={(e) => updateField('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                    placeholder="10-digit mobile"
                  />

                  <label className="text-xs font-semibold text-right">E-Mail</label>
                  <input
                    type="email"
                    className="form-input text-sm"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="email@example.com"
                  />
                  <label className="text-xs font-semibold text-right">IT Pan No.</label>
                  <input
                    type="text"
                    className="form-input text-sm uppercase"
                    value={form.pan}
                    onChange={(e) => updateField('pan', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                    maxLength={10}
                    placeholder="ABCDE1234F"
                  />

                  <label className="text-xs font-semibold text-right">State</label>
                  <select
                    className="form-select text-sm"
                    value={form.state}
                    onChange={(e) => updateField('state', e.target.value)}
                  >
                    <option value="">-- Select State --</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <label className="text-xs font-semibold text-right">Reference</label>
                  <input
                    type="text"
                    className="form-input text-sm"
                    value={form.reference}
                    onChange={(e) => updateField('reference', e.target.value)}
                    placeholder="Referred by"
                  />

                  <label className="text-xs font-semibold text-right">Pincode</label>
                  <input
                    type="text"
                    className="form-input text-sm"
                    value={form.pincode}
                    onChange={(e) => updateField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                  />
                  <label className="text-xs font-semibold text-right">Aadhar No.</label>
                  <input
                    type="text"
                    className="form-input text-sm"
                    value={form.aadhar}
                    onChange={(e) => updateField('aadhar', e.target.value.replace(/\D/g, '').slice(0, 12))}
                    maxLength={12}
                    placeholder="12-digit Aadhar"
                  />
                </div>
              )}

              {activeTab === 'tds' && (
                <div className="text-center text-gray-400 py-8 text-sm">
                  TDS Entry — Coming Soon
                </div>
              )}
              {activeTab === 'metal' && (
                <div className="text-center text-gray-400 py-8 text-sm">
                  Metal Outstanding — Coming Soon
                </div>
              )}
              {activeTab === 'bill' && (
                <div className="text-center text-gray-400 py-8 text-sm">
                  Bill To Bill — Coming Soon
                </div>
              )}
              {activeTab === 'payments' && (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {!accountId ? (
                    <div className="text-center text-gray-400 py-8 text-sm">Save the account first to view payments</div>
                  ) : paymentsQuery.isLoading ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Loading payments...</div>
                  ) : paymentsQuery.isError ? (
                    <div className="text-center py-8 text-red-400 text-sm">Failed to load payments</div>
                  ) : !paymentsQuery.data?.payments?.length ? (
                    <div className="text-center text-gray-400 py-8 text-sm">No payments found for this customer</div>
                  ) : (
                    <>
                      {/* Payment Summary */}
                      <div className="grid grid-cols-4 gap-3">
                        {(() => {
                          const payments = paymentsQuery.data.payments;
                          const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.totalAmount || 0), 0);
                          const totalCash = payments.reduce((s: number, p: any) => s + Number(p.cashAmount || 0), 0);
                          const totalBank = payments.reduce((s: number, p: any) => s + Number(p.bankAmount || 0), 0);
                          const totalCard = payments.reduce((s: number, p: any) => s + Number(p.cardAmount || 0), 0);
                          return (
                            <>
                              <div className="bg-green-50 p-2 rounded text-center">
                                <div className="text-[10px] text-gray-500">Total Paid</div>
                                <div className="text-sm font-bold text-green-700">{formatIndianNumber(totalPaid)}</div>
                                <div className="text-[10px] text-gray-400">{payments.length} payments</div>
                              </div>
                              <div className="bg-blue-50 p-2 rounded text-center">
                                <div className="text-[10px] text-gray-500">Cash</div>
                                <div className="text-sm font-bold text-blue-700">{formatIndianNumber(totalCash)}</div>
                              </div>
                              <div className="bg-purple-50 p-2 rounded text-center">
                                <div className="text-[10px] text-gray-500">Bank</div>
                                <div className="text-sm font-bold text-purple-700">{formatIndianNumber(totalBank)}</div>
                              </div>
                              <div className="bg-orange-50 p-2 rounded text-center">
                                <div className="text-[10px] text-gray-500">Card/UPI</div>
                                <div className="text-sm font-bold text-orange-700">{formatIndianNumber(totalCard)}</div>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Payments Table */}
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left p-1.5">Voucher#</th>
                            <th className="text-left p-1.5">Date</th>
                            <th className="text-center p-1.5">Type</th>
                            <th className="text-right p-1.5">Cash</th>
                            <th className="text-right p-1.5">Bank</th>
                            <th className="text-right p-1.5">Card</th>
                            <th className="text-right p-1.5">UPI</th>
                            <th className="text-right p-1.5">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentsQuery.data.payments.map((p: any) => (
                            <tr key={`${p.source}-${p.id}`} className="border-b hover:bg-gray-50">
                              <td className="p-1.5 font-mono">{p.receiptNo}</td>
                              <td className="p-1.5">{new Date(p.paymentDate).toLocaleDateString('en-IN')}</td>
                              <td className="p-1.5 text-center">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  p.source === 'SALE' ? 'bg-orange-100 text-orange-700' :
                                  p.source === 'LAYAWAY' ? 'bg-purple-100 text-purple-700' :
                                  p.source === 'SCHEME' ? 'bg-teal-100 text-teal-700' :
                                  p.paymentType === 'ADVANCE' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {p.source === 'SALE' ? 'Sale' : p.source === 'LAYAWAY' ? 'Layaway' : p.source === 'SCHEME' ? 'Scheme' : p.paymentType === 'ADVANCE' ? 'Advance' : 'Due Payment'}
                                </span>
                              </td>
                              <td className="p-1.5 text-right">{Number(p.cashAmount) > 0 ? formatIndianNumber(Number(p.cashAmount)) : '-'}</td>
                              <td className="p-1.5 text-right">{Number(p.bankAmount) > 0 ? formatIndianNumber(Number(p.bankAmount)) : '-'}</td>
                              <td className="p-1.5 text-right">{Number(p.cardAmount) > 0 ? formatIndianNumber(Number(p.cardAmount)) : '-'}</td>
                              <td className="p-1.5 text-right">{Number(p.upiAmount) > 0 ? formatIndianNumber(Number(p.upiAmount)) : '-'}</td>
                              <td className="p-1.5 text-right font-bold text-green-700">{formatIndianNumber(Number(p.totalAmount))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {historyQuery.isLoading && (
                    <div className="text-center py-8 text-gray-400 text-sm">Loading history...</div>
                  )}
                  {historyQuery.isError && (
                    <div className="text-center py-8 text-red-400 text-sm">Failed to load history</div>
                  )}
                  {historyQuery.data && (
                    <>
                      {/* Summary Cards */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-center">
                          <div className="text-lg font-bold text-blue-700">{historyQuery.data.summary.totalSalesCount}</div>
                          <div className="text-xs text-blue-600">Total Sales</div>
                          <div className="text-sm font-semibold text-blue-800 mt-1">₹{formatIndianNumber(historyQuery.data.summary.totalSalesAmount)}</div>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-center">
                          <div className="text-lg font-bold text-amber-700">{historyQuery.data.summary.totalOGPurchaseCount}</div>
                          <div className="text-xs text-amber-600">Old Gold Purchases</div>
                          <div className="text-sm font-semibold text-amber-800 mt-1">₹{formatIndianNumber(historyQuery.data.summary.totalOGPurchaseAmount)}</div>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 rounded p-3 text-center">
                          <div className="text-lg font-bold text-purple-700">{historyQuery.data.summary.totalLayawayCount}</div>
                          <div className="text-xs text-purple-600">Layaways</div>
                        </div>
                      </div>

                      {/* Sales Table */}
                      {historyQuery.data.sales.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-gray-700 mb-1">Sales Vouchers</h4>
                          <table className="w-full text-xs border border-gray-200">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="border px-2 py-1 text-left">Voucher#</th>
                                <th className="border px-2 py-1 text-left">Date</th>
                                <th className="border px-2 py-1 text-right">Items</th>
                                <th className="border px-2 py-1 text-right">Amount</th>
                                <th className="border px-2 py-1 text-right">Paid</th>
                                <th className="border px-2 py-1 text-right">Due</th>
                              </tr>
                            </thead>
                            <tbody>
                              {historyQuery.data.sales.map((s: any) => (
                                <tr key={s.id} className="hover:bg-gray-50">
                                  <td className="border px-2 py-1 font-mono">{s.voucherNo}</td>
                                  <td className="border px-2 py-1">{new Date(s.voucherDate).toLocaleDateString('en-IN')}</td>
                                  <td className="border px-2 py-1 text-right">{s.items?.length ?? 0}</td>
                                  <td className="border px-2 py-1 text-right">₹{formatIndianNumber(s.voucherAmount)}</td>
                                  <td className="border px-2 py-1 text-right text-green-700">₹{formatIndianNumber(s.paymentAmount)}</td>
                                  <td className="border px-2 py-1 text-right text-red-600">{Number(s.dueAmount) > 0 ? `₹${formatIndianNumber(s.dueAmount)}` : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Old Gold Purchases Table */}
                      {historyQuery.data.oldGoldPurchases.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-gray-700 mb-1">Old Gold Purchases</h4>
                          <table className="w-full text-xs border border-gray-200">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="border px-2 py-1 text-left">Voucher#</th>
                                <th className="border px-2 py-1 text-left">Date</th>
                                <th className="border px-2 py-1 text-right">Gross Wt</th>
                                <th className="border px-2 py-1 text-right">Fine Wt</th>
                                <th className="border px-2 py-1 text-right">Rate</th>
                                <th className="border px-2 py-1 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {historyQuery.data.oldGoldPurchases.map((p: any) => (
                                <tr key={p.id} className="hover:bg-gray-50">
                                  <td className="border px-2 py-1 font-mono">{p.voucherNo}</td>
                                  <td className="border px-2 py-1">{new Date(p.voucherDate).toLocaleDateString('en-IN')}</td>
                                  <td className="border px-2 py-1 text-right">{Number(p.totalGrossWeight).toFixed(3)}g</td>
                                  <td className="border px-2 py-1 text-right">{Number(p.totalFineWeight).toFixed(3)}g</td>
                                  <td className="border px-2 py-1 text-right">₹{formatIndianNumber(p.metalRate)}</td>
                                  <td className="border px-2 py-1 text-right">₹{formatIndianNumber(p.finalAmount || p.totalAmount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Layaways Table */}
                      {historyQuery.data.layaways.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-gray-700 mb-1">Layaways</h4>
                          <table className="w-full text-xs border border-gray-200">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="border px-2 py-1 text-left">Voucher#</th>
                                <th className="border px-2 py-1 text-left">Date</th>
                                <th className="border px-2 py-1 text-right">Pcs</th>
                                <th className="border px-2 py-1 text-right">Amount</th>
                                <th className="border px-2 py-1 text-right">Paid</th>
                                <th className="border px-2 py-1 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {historyQuery.data.layaways.map((l: any) => (
                                <tr key={l.id} className="hover:bg-gray-50">
                                  <td className="border px-2 py-1 font-mono">{l.voucherNo}</td>
                                  <td className="border px-2 py-1">{new Date(l.voucherDate).toLocaleDateString('en-IN')}</td>
                                  <td className="border px-2 py-1 text-right">{l.totalPcs}</td>
                                  <td className="border px-2 py-1 text-right">₹{formatIndianNumber(l.voucherAmount)}</td>
                                  <td className="border px-2 py-1 text-right text-green-700">₹{formatIndianNumber(l.paymentAmount)}</td>
                                  <td className="border px-2 py-1 text-center">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      l.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                                      l.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>{l.status}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {historyQuery.data.sales.length === 0 && historyQuery.data.oldGoldPurchases.length === 0 && historyQuery.data.layaways.length === 0 && (
                        <div className="text-center text-gray-400 py-8 text-sm">No transaction history found</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ======== Composition Scheme & GST Search Trigger ======== */}
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={form.compositionScheme}
                onChange={(e) => updateField('compositionScheme', e.target.checked)}
                className="accent-blue-600"
              />
              <span className="font-semibold">Registered Under Composition Scheme</span>
            </label>

            <button
              className="text-xs text-blue-700 hover:text-blue-900 underline cursor-pointer font-semibold"
              onClick={() => {
                openGSTSearch();
              }}
            >
              Click Here Or Press F6 To Search GSTIN No.
            </button>
          </div>
        </div>

        {/* ======== Footer Buttons ======== */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-300 bg-gray-100 rounded-b">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="btn-success flex items-center gap-1.5 px-6"
          >
            <Save size={14} />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          <button onClick={onClose} className="btn-outline px-6">
            Close
          </button>
        </div>
      </div>

      {/* ============================================================
          GST Search Popup (Overlay on top of Modal)
          ============================================================ */}
      {showGSTSearch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-2xl w-[520px] border border-gray-300">
            {/* Popup Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-400 text-white rounded-t-lg">
              <div className="flex items-center gap-2">
                <Search size={14} />
                <span className="text-sm font-semibold">Search GSTIN</span>
              </div>
              <button
                onClick={() => setShowGSTSearch(false)}
                className="text-white hover:text-red-200"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <label className="text-xs font-bold text-red-600 whitespace-nowrap">GSTIN No</label>
                <input
                  ref={gstinInputRef}
                  type="text"
                  className="form-input flex-1 text-sm uppercase font-mono tracking-wider"
                  value={gstSearchInput}
                  onChange={(e) => setGstSearchInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGSTSearch(); }}
                  placeholder="e.g. 09AAACH7409R1ZZ"
                  maxLength={15}
                />
                <button
                  onClick={handleGSTSearch}
                  disabled={gstSearchMutation.isPending}
                  className="btn-primary flex items-center gap-1 px-3"
                >
                  <Search size={14} />
                  {gstSearchMutation.isPending ? 'Searching...' : 'Search'}
                </button>
              </div>

              {/* Search Results */}
              {gstResult && (
                <div className="border border-gray-200 rounded bg-gray-50 p-3 space-y-2">
                  {/* Status Banner */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold ${
                    gstResult.tradeName || gstResult.legalName
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    <Shield size={14} />
                    {gstResult.tradeName || gstResult.legalName
                      ? 'GSTIN Found — Details Retrieved'
                      : 'GSTIN Format Valid — Manual entry needed'}
                  </div>

                  <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-xs">
                    <span className="font-semibold text-gray-600">GSTIN:</span>
                    <span className="font-mono">{gstResult.gstin}</span>

                    {gstResult.legalName && (
                      <>
                        <span className="font-semibold text-gray-600">Legal Name:</span>
                        <span className="font-semibold">{gstResult.legalName}</span>
                      </>
                    )}
                    {gstResult.tradeName && (
                      <>
                        <span className="font-semibold text-gray-600">Trade Name:</span>
                        <span>{gstResult.tradeName}</span>
                      </>
                    )}
                    {gstResult.status && (
                      <>
                        <span className="font-semibold text-gray-600">Status:</span>
                        <span className={gstResult.status === 'Active' ? 'text-green-700 font-semibold' : 'text-orange-600'}>
                          {gstResult.status}
                        </span>
                      </>
                    )}
                    {gstResult.type && (
                      <>
                        <span className="font-semibold text-gray-600">Type:</span>
                        <span>{gstResult.type}</span>
                      </>
                    )}
                    <span className="font-semibold text-gray-600">State:</span>
                    <span>{gstResult.stateName} ({gstResult.stateCode})</span>

                    <span className="font-semibold text-gray-600">PAN:</span>
                    <span className="font-mono">{gstResult.pan}</span>

                    {gstResult.address && (
                      <>
                        <span className="font-semibold text-gray-600">Address:</span>
                        <span className="text-[11px]">{gstResult.address}</span>
                      </>
                    )}
                  </div>

                  {gstResult.existingAccount && (
                    <div className="bg-orange-50 border border-orange-300 rounded px-3 py-1.5 text-xs text-orange-800">
                      ⚠️ This GSTIN is already linked to account: <strong>{gstResult.existingAccount.name}</strong> ({gstResult.existingAccount.type})
                    </div>
                  )}

                  {/* Apply Button */}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={applyGSTData}
                      className="btn-success text-xs px-4 flex items-center gap-1"
                    >
                      <ChevronDown size={12} />
                      Apply to Form
                    </button>
                  </div>
                </div>
              )}

              {/* Error state */}
              {gstSearchMutation.isError && !gstResult && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">
                  Failed to search GSTIN. Please check the number and try again.
                </div>
              )}
            </div>

            {/* Popup Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              <span className="text-[10px] text-gray-500">Enter 15-character GSTIN and press Enter or click Search</span>
              <button
                onClick={() => setShowGSTSearch(false)}
                className="btn-outline text-xs px-4"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
