import { Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import RetailSalesEntry from './pages/Sales/RetailSalesEntry';
import SalesEntryList from './pages/Sales/SalesEntryList';
import PurchaseURD from './pages/Purchase/PurchaseURD';
import PurchaseEntryList from './pages/Purchase/PurchaseEntryList';
import LabelPreparation from './pages/Inventory/LabelPreparation';
import LabelEntryList from './pages/Inventory/LabelEntryList';
import CashEntry from './pages/CashBank/CashEntry';
import BranchIssue from './pages/Branch/BranchIssue';
import BranchReceipt from './pages/Branch/BranchReceipt';
import BranchReceiptList from './pages/Branch/BranchReceiptList';
import BranchManagement from './pages/Branch/BranchManagement';
import LayawayEntry from './pages/Layaway/LayawayEntry';
import LayawayList from './pages/Layaway/LayawayList';
import CustomerPaymentEntry from './pages/Payments/CustomerPaymentEntry';
import CustomerPaymentList from './pages/Payments/CustomerPaymentList';
import CustomerList from './pages/CRM/CustomerList';
import DailySalesReport from './pages/Reports/DailySalesReport';
import StockReport from './pages/Reports/StockReport';
import CounterWiseReport from './pages/Reports/CounterWiseReport';
import MasterData from './pages/Masters/MasterData';
import Login from './pages/Login';

function App() {
  const navigate = useNavigate();

  // Listen for Electron menu navigation
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.onNavigate) {
      electronAPI.onNavigate((route: string) => {
        navigate(route);
      });
    }
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        {/* Sales */}
        <Route path="sales/retail" element={<RetailSalesEntry />} />
        <Route path="sales/list" element={<SalesEntryList />} />
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
        {/* Layaway */}
        <Route path="layaway" element={<LayawayEntry />} />
        <Route path="layaway/list" element={<LayawayList />} />
        {/* Payments */}
        <Route path="payments" element={<CustomerPaymentEntry />} />
        <Route path="payments/list" element={<CustomerPaymentList />} />
        {/* CRM */}
        <Route path="crm/customers" element={<CustomerList />} />
        {/* Reports */}
        <Route path="reports/daily-sales" element={<DailySalesReport />} />
        <Route path="reports/stock" element={<StockReport />} />
        <Route path="reports/counter-wise" element={<CounterWiseReport />} />
        {/* Masters */}
        <Route path="masters" element={<MasterData />} />
      </Route>
    </Routes>
  );
}

export default App;
