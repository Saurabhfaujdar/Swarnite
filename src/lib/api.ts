import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jewelerp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('jewelerp_token');
      window.location.href = '/login';
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
};

// Layaway
export const layawayAPI = {
  list: (params?: any) => api.get('/layaway', { params }),
  get: (id: number) => api.get(`/layaway/${id}`),
  create: (data: any) => api.post('/layaway', data),
  update: (id: number, data: any) => api.put(`/layaway/${id}`, data),
  addPayment: (id: number, data: any) => api.post(`/layaway/${id}/payment`, data),
  cancel: (id: number) => api.delete(`/layaway/${id}`),
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
  salesmen: () => api.get('/masters/salesmen'),
  createSalesman: (data: any) => api.post('/masters/salesmen', data),
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
};

// Customer Payments
export const customerPaymentsAPI = {
  list: (params?: any) => api.get('/customer-payments', { params }),
  get: (id: number) => api.get(`/customer-payments/${id}`),
  create: (data: any) => api.post('/customer-payments', data),
  cancel: (id: number) => api.delete(`/customer-payments/${id}`),
  balanceHistory: (accountId: number, params?: any) => api.get(`/customer-payments/balance/${accountId}`, { params }),
};

// Auth
export const authAPI = {
  login: (data: any) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};
