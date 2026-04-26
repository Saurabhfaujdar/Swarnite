import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from './lib/auth';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import RetailSalesEntry from './pages/Sales/RetailSalesEntry';
import SalesEntryList from './pages/Sales/SalesEntryList';
import SalesVoucherDetail from './pages/Sales/SalesVoucherDetail';
import PurchaseURD from './pages/Purchase/PurchaseURD';
import PurchaseEntryList from './pages/Purchase/PurchaseEntryList';
import LabelPreparation from './pages/Inventory/LabelPreparation';
import LabelEntryList from './pages/Inventory/LabelEntryList';
import CashEntry from './pages/CashBank/CashEntry';
import BranchIssue from './pages/Branch/BranchIssue';
import BranchReceipt from './pages/Branch/BranchReceipt';
import BranchReceiptList from './pages/Branch/BranchReceiptList';
import BranchManagement from './pages/Branch/BranchManagement';
import StockRequest from './pages/Branch/StockRequest';
import LayawayEntry from './pages/Layaway/LayawayEntry';
import LayawayList from './pages/Layaway/LayawayList';
import LayawayDetail from './pages/Layaway/LayawayDetail';
import SavingsSchemeEntry from './pages/SavingsScheme/SavingsSchemeEntry';
import SavingsSchemeList from './pages/SavingsScheme/SavingsSchemeList';
import SavingsSchemeDetail from './pages/SavingsScheme/SavingsSchemeDetail';
import CustomerPaymentList from './pages/Payments/CustomerPaymentList';
import CustomerList from './pages/CRM/CustomerList';
import DailySalesReport from './pages/Reports/DailySalesReport';
import StockReport from './pages/Reports/StockReport';
import CounterWiseReport from './pages/Reports/CounterWiseReport';
import ItemWiseSalesReport from './pages/Reports/ItemWiseSalesReport';
import MasterData from './pages/Masters/MasterData';
import Login from './pages/Login';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  if (!isHydrated) return null; // wait for session check
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        {/* Sales */}
        <Route path="sales/retail" element={<RetailSalesEntry />} />
        <Route path="sales/list" element={<SalesEntryList />} />
        <Route path="sales/:id" element={<SalesVoucherDetail />} />
        {/* Purchase */}
        <Route path="purchase/urd" element={<PurchaseURD />} />
        <Route path="purchase/list" element={<PurchaseEntryList />} />
        {/* Inventory */}
        <Route path="inventory/labels/new" element={<LabelPreparation />} />
        <Route path="inventory/labels" element={<LabelEntryList />} />
        {/* Cash/Bank */}
        <Route path="cash-bank/cash" element={<CashEntry />} />
        {/* Branch */}
        <Route path="branch/issue" element={<BranchIssue />} />
        <Route path="branch/receipt" element={<BranchReceipt />} />
        <Route path="branch/receipt-list" element={<BranchReceiptList />} />
        <Route path="branch/manage" element={<BranchManagement />} />
        <Route path="branch/stock-requests" element={<StockRequest />} />
        {/* Layaway */}
        <Route path="layaway" element={<LayawayEntry />} />
        <Route path="layaway/list" element={<LayawayList />} />
        <Route path="layaway/detail/:id" element={<LayawayDetail />} />
        {/* Savings Scheme */}
        <Route path="savings-scheme" element={<SavingsSchemeEntry />} />
        <Route path="savings-scheme/list" element={<SavingsSchemeList />} />
        <Route path="savings-scheme/detail/:id" element={<SavingsSchemeDetail />} />
        {/* Payments */}
        <Route path="payments" element={<CustomerPaymentList />} />
        {/* CRM */}
        <Route path="crm/customers" element={<CustomerList />} />
        {/* Reports */}
        <Route path="reports/daily-sales" element={<DailySalesReport />} />
        <Route path="reports/stock" element={<StockReport />} />
        <Route path="reports/counter-wise" element={<CounterWiseReport />} />
        <Route path="reports/item-wise-sales" element={<ItemWiseSalesReport />} />
        {/* Masters */}
        <Route path="masters" element={<MasterData />} />
      </Route>
    </Routes>
  );
}

export default App;
