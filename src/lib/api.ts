import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from './auth';
import { getConfig } from './config';

const api = axios.create({
  baseURL: getConfig().apiUrl,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send refresh cookie on all requests
});

// ─── Request interceptor: attach access token from memory ────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response interceptor: auto-refresh on 401 ──────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: Error) => void;
}> = [];

function processQueue(error: Error | null, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else if (token) p.resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Only attempt refresh for 401s on non-auth endpoints
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        // Another refresh is in flight — queue this request
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await useAuthStore.getState().refreshAccessToken();
        if (newToken) {
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } else {
          processQueue(new Error('Refresh failed'), null);
          useAuthStore.getState().logout();
          window.location.href = '/login';
        }
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        useAuthStore.getState().logout();
        window.location.href = '/login';
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// ============================================================
// API Service Functions
// ============================================================

// Sales
export const salesAPI = {
  list: (params?: any) => api.get('/sales', { params }),
  get: (id: number) => api.get(`/sales/${id}`),
  create: (data: any) => api.post('/sales', data),
  update: (id: number, data: any) => api.put(`/sales/${id}`, data),
  cancel: (id: number) => api.delete(`/sales/${id}`),
};

// Purchase
export const purchaseAPI = {
  list: (params?: any) => api.get('/purchase', { params }),
  get: (id: number) => api.get(`/purchase/${id}`),
  create: (data: any) => api.post('/purchase', data),
  cancel: (id: number) => api.delete(`/purchase/${id}`),
};

// Inventory
export const inventoryAPI = {
  labels: (params?: any) => api.get('/inventory/labels', { params }),
  getLabel: (id: number) => api.get(`/inventory/labels/${id}`),
  searchLabel: (labelNo: string) => api.get('/inventory/labels/search', { params: { labelNo } }),
  createLabel: (data: any) => api.post('/inventory/labels', data),
  createBatch: (data: any) => api.post('/inventory/labels/batch', data),
  updateLabel: (id: number, data: any) => api.put(`/inventory/labels/${id}`, data),
  deleteLabel: (id: number) => api.delete(`/inventory/labels/${id}`),
  items: () => api.get('/inventory/items'),
  createItem: (data: any) => api.post('/inventory/items', data),
  counterReport: (params?: any) => api.get('/inventory/counter-report', { params }),
  stockSummary: () => api.get('/inventory/stock-summary'),
  prefixes: () => api.get('/inventory/prefixes'),
  createPrefix: (data: any) => api.post('/inventory/prefixes', data),
};

// Accounts
export const accountsAPI = {
  list: (params?: any) => api.get('/accounts', { params }),
  get: (id: number) => api.get(`/accounts/${id}`),
  ledger: (id: number, params?: any) => api.get(`/accounts/${id}/ledger`, { params }),
  history: (id: number, params?: any) => api.get(`/accounts/${id}/history`, { params }),
  create: (data: any) => api.post('/accounts', data),
  update: (id: number, data: any) => api.put(`/accounts/${id}`, data),
  outstanding: (id: number) => api.get(`/accounts/${id}/outstanding`),
  gstSearch: (gstin: string) => api.post('/accounts/gstin-search', { gstin }),
};

// Cash/Bank
export const cashBankAPI = {
  cashList: (params?: any) => api.get('/cash-bank/cash', { params }),
  createCash: (data: any) => api.post('/cash-bank/cash', data),
  bankList: (params?: any) => api.get('/cash-bank/bank', { params }),
  createBank: (data: any) => api.post('/cash-bank/bank', data),
  journalList: () => api.get('/cash-bank/journal'),
  createJournal: (data: any) => api.post('/cash-bank/journal', data),
};

// Branch
export const branchAPI = {
  list: (params?: any) => api.get('/branch/transfers', { params }),
  transfers: (params?: any) => api.get('/branch/transfers', { params }),
  getTransfer: (id: number) => api.get(`/branch/transfers/${id}`),
  getByTransferNo: (no: string) => api.get(`/branch/transfers/by-no/${no}`),
  createIssue: (data: any) => api.post('/branch/issue', data),
  createReceipt: (data: any) => api.post('/branch/receipt', data),
  receiveTransfer: (data: any) => api.post('/branch/receive', data),
};

// Branch Management
export const branchManagementAPI = {
  list: (params?: any) => api.get('/branches', { params }),
  get: (id: number) => api.get(`/branches/${id}`),
  children: (id: number) => api.get(`/branches/${id}/children`),
  stats: (id: number) => api.get(`/branches/${id}/stats`),
  create: (data: any) => api.post('/branches', data),
  update: (id: number, data: any) => api.put(`/branches/${id}`, data),
  disable: (id: number) => api.put(`/branches/${id}/disable`),
  enable: (id: number) => api.put(`/branches/${id}/enable`),
  softDelete: (id: number) => api.delete(`/branches/${id}`),
  permanentDelete: (id: number) => api.delete(`/branches/${id}/permanent`),
  transfer: (data: any) => api.post('/branches/transfer', data),
  transferHistory: (params?: any) => api.get('/branches/transfer/history', { params }),
  auditLog: (params?: any) => api.get('/branches/audit-log', { params }),
  branchUsers: (id: number) => api.get(`/branches/${id}/users`),
  createBranchUser: (id: number, data: any) => api.post(`/branches/${id}/user`, data),
  updateBranchUser: (branchId: number, userId: number, data: any) => api.put(`/branches/${branchId}/user/${userId}`, data),
};

// Stock Requests
export const stockRequestAPI = {
  branches: () => api.get('/stock-requests/branches'),
  browse: (params?: any) => api.get('/stock-requests/browse', { params }),
  list: (params?: any) => api.get('/stock-requests', { params }),
  pendingCount: () => api.get('/stock-requests/pending-count'),
  get: (id: number) => api.get(`/stock-requests/${id}`),
  create: (data: any) => api.post('/stock-requests', data),
  approve: (id: number) => api.put(`/stock-requests/${id}/approve`),
  reject: (id: number, reason?: string) => api.put(`/stock-requests/${id}/reject`, { reason }),
};

// Layaway
export const layawayAPI = {
  list: (params?: any) => api.get('/layaway', { params }),
  get: (id: number) => api.get(`/layaway/${id}`),
  byVoucherNo: (voucherNo: string) => api.get('/layaway/by-voucher', { params: { voucherNo } }),
  create: (data: any) => api.post('/layaway', data),
  update: (id: number, data: any) => api.put(`/layaway/${id}`, data),
  addPayment: (id: number, data: any) => api.post(`/layaway/${id}/payment`, data),
  conversionPreview: (id: number) => api.get(`/layaway/${id}/conversion-preview`),
  convert: (id: number, data: any) => api.post(`/layaway/${id}/convert`, data),
  cancel: (id: number, reason?: string) => api.delete(`/layaway/${id}`, { data: { reason } }),
};

// Masters
export const mastersAPI = {
  metalTypes: () => api.get('/masters/metal-types'),
  createMetalType: (data: any) => api.post('/masters/metal-types', data),
  itemGroups: () => api.get('/masters/item-groups'),
  createItemGroup: (data: any) => api.post('/masters/item-groups', data),
  purities: () => api.get('/masters/purities'),
  createPurity: (data: any) => api.post('/masters/purities', data),
  metalRates: (params?: any) => api.get('/masters/metal-rates', { params }),
  latestRates: () => api.get('/masters/metal-rates/latest'),
  createMetalRate: (data: any) => api.post('/masters/metal-rates', data),
  refreshMetalRates: () => api.post('/masters/metal-rates/refresh'),
  salesmen: () => api.get('/masters/salesmen'),
  createSalesman: (data: any) => api.post('/masters/salesmen', data),
  deleteSalesman: (id: number) => api.delete(`/masters/salesmen/${id}`),
  counters: (params?: any) => api.get('/masters/counters', { params }),
  createCounter: (data: any) => api.post('/masters/counters', data),
  branches: () => api.get('/masters/branches'),
  gstConfig: () => api.get('/masters/gst-config'),
  company: () => api.get('/masters/company'),
  saveCompany: (data: any) => api.post('/masters/company', data),
};

// Reports
export const reportsAPI = {
  dailySales: (params?: any) => api.get('/reports/daily-sales', { params }),
  dailyPurchase: (params?: any) => api.get('/reports/daily-purchase', { params }),
  stock: (params?: any) => api.get('/reports/stock', { params }),
  gst: (params?: any) => api.get('/reports/gst', { params }),
  outstanding: (params?: any) => api.get('/reports/outstanding', { params }),
  dashboard: () => api.get('/reports/dashboard'),
  branches: () => api.get('/reports/branches'),
  itemWiseSales: (params?: any) => api.get('/reports/item-wise-sales', { params }),
};

// Customer Payments
export const customerPaymentsAPI = {
  list: (params?: any) => api.get('/customer-payments', { params }),
  get: (id: number) => api.get(`/customer-payments/${id}`),
  create: (data: any) => api.post('/customer-payments', data),
  cancel: (id: number) => api.delete(`/customer-payments/${id}`),
  balanceHistory: (accountId: number, params?: any) => api.get(`/customer-payments/balance/${accountId}`, { params }),
};

// Savings Scheme
export const savingsSchemeAPI = {
  list: (params?: any) => api.get('/savings-scheme', { params }),
  get: (id: number) => api.get(`/savings-scheme/${id}`),
  create: (data: any) => api.post('/savings-scheme', data),
  payInstallment: (id: number, data: any) => api.post(`/savings-scheme/${id}/installment`, data),
  markMissed: (id: number) => api.put(`/savings-scheme/${id}/mark-missed`),
  redeem: (id: number) => api.put(`/savings-scheme/${id}/redeem`),
  cancel: (id: number) => api.delete(`/savings-scheme/${id}`),
  dueReminders: (params?: { daysBefore?: number; daysAfter?: number }) =>
    api.get('/savings-scheme/reminders/due', { params }),
};

// Files / Attachments
export const filesAPI = {
  upload: (entityType: string, entityId: number, files: File[], category = 'document') => {
    const formData = new FormData();
    formData.append('entityType', entityType);
    formData.append('entityId', String(entityId));
    formData.append('category', category);
    files.forEach((f) => formData.append('files', f));
    return api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: (entityType: string, entityId: number) =>
    api.get(`/files/entity/${entityType}/${entityId}`),
  getMeta: (id: number) => api.get(`/files/${id}`),
  getDownloadUrl: (id: number) => api.get(`/files/${id}/url`),
  remove: (id: number) => api.delete(`/files/${id}`),
};

// Repairs
export const repairAPI = {
  dashboard: () => api.get('/repairs/dashboard'),
  list: (params?: any) => api.get('/repairs', { params }),
  get: (id: number) => api.get(`/repairs/${id}`),
  create: (data: any) => api.post('/repairs', data),
  update: (id: number, data: any) => api.put(`/repairs/${id}`, data),
  setStatus: (id: number, toState: string, remarks?: string) =>
    api.patch(`/repairs/${id}/status`, { toState, remarks }),
  addItem: (id: number, data: any) => api.post(`/repairs/${id}/items`, data),
  addPhoto: (id: number, data: any) => api.post(`/repairs/${id}/photos`, data),
  assignKariger: (id: number, data: any) => api.post(`/repairs/${id}/assign-kariger`, data),
  returnFromKariger: (id: number, data: any) => api.post(`/repairs/${id}/return-from-kariger`, data),
  weightAdjustment: (id: number, data: any) => api.post(`/repairs/${id}/weight-adjustment`, data),
  addCharge: (id: number, data: any) => api.post(`/repairs/${id}/charges`, data),
  generateInvoice: (id: number) => api.post(`/repairs/${id}/invoice`),
  recordPayment: (id: number, data: any) => api.post(`/repairs/${id}/invoice/payment`, data),
  approve: (id: number, remarks?: string) => api.post(`/repairs/${id}/approve`, { remarks }),
  deliver: (id: number, data: any) => api.post(`/repairs/${id}/deliver`, data),
  report: (type: string) => api.get(`/repairs/reports/${type}`),
};

// Supplier Orders
export const supplierOrderAPI = {
  dashboard: () => api.get('/supplier-orders/dashboard'),
  list: (params?: any) => api.get('/supplier-orders', { params }),
  get: (id: number) => api.get(`/supplier-orders/${id}`),
  create: (data: any) => api.post('/supplier-orders', data),
  update: (id: number, data: any) => api.put(`/supplier-orders/${id}`, data),
  setStatus: (id: number, toStatus: string, reason?: string, managerOverride?: boolean) =>
    api.patch(`/supplier-orders/${id}/status`, { toStatus, reason, managerOverride }),
  send: (id: number, reason?: string) => api.post(`/supplier-orders/${id}/send`, { reason }),
  acknowledge: (id: number, data: any) => api.post(`/supplier-orders/${id}/acknowledge`, data),
  advancePayment: (id: number, data: any) => api.post(`/supplier-orders/${id}/advance-payment`, data),
  receipt: (id: number, data: any) => api.post(`/supplier-orders/${id}/receipt`, data),
  qc: (id: number, receiptId: number, data: any) => api.post(`/supplier-orders/${id}/receipt/${receiptId}/qc`, data),
  invoice: (id: number, data: any) => api.post(`/supplier-orders/${id}/invoice`, data),
  postPurchase: (id: number) => api.post(`/supplier-orders/${id}/post-purchase`),
  payment: (id: number, data: any) => api.post(`/supplier-orders/${id}/payment`, data),
  close: (id: number, reason?: string, managerOverride?: boolean) =>
    api.post(`/supplier-orders/${id}/close`, { reason, managerOverride }),
  cancel: (id: number, reason: string, managerOverride?: boolean) =>
    api.post(`/supplier-orders/${id}/cancel`, { reason, managerOverride }),
  report: (type: string, params?: any) => api.get(`/supplier-orders/reports/${type}`, { params }),
};

// Karigers
export const karigerAPI = {
  list: (params?: any) => api.get('/karigers', { params }),
  get: (id: number) => api.get(`/karigers/${id}`),
  create: (data: any) => api.post('/karigers', data),
  update: (id: number, data: any) => api.put(`/karigers/${id}`, data),
  metalLedger: (id: number) => api.get(`/karigers/${id}/metal-ledger`),
  moneyLedger: (id: number) => api.get(`/karigers/${id}/money-ledger`),
  pay: (id: number, data: any) => api.post(`/karigers/${id}/payment`, data),
};

// Courier
export const courierAPI = {
  rates: (params: any) => api.get('/courier/rates', { params }),
  createShipment: (data: any) => api.post('/courier/shipments', data),
  listShipments: (params?: any) => api.get('/courier/shipments', { params }),
  getShipment: (id: number) => api.get(`/courier/shipments/${id}`),
  cancelShipment: (id: number) => api.post(`/courier/shipments/${id}/cancel`),
};

// Auth
export const authAPI = {
  login: (data: any) => api.post('/auth/login', data),
  refresh: () => api.post('/auth/refresh'),
  logout: () => api.post('/auth/logout'),
  logoutAll: () => api.post('/auth/logout-all'),
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  changePassword: (data: any) => api.put('/auth/change-password', data),
  sessions: () => api.get('/auth/sessions'),
  revokeSession: (id: number) => api.delete(`/auth/sessions/${id}`),
};
