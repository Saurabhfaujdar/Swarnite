import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Home, ShoppingCart, Package, CreditCard, ArrowLeftRight,
  BarChart3, Users, Clock, Settings, Tag, Wallet, Building2
} from 'lucide-react';
import { getFinancialYear } from '../../lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/sales/retail', icon: ShoppingCart, label: 'Sales Entry' },
  { to: '/sales/list', icon: ShoppingCart, label: 'Sales List' },
  { to: '/purchase/urd', icon: Package, label: 'Purchase (URD)' },
  { to: '/inventory/labels', icon: Tag, label: 'Labels' },
  { to: '/cash-bank/cash', icon: CreditCard, label: 'Cash Entry' },
  { to: '/branch/receipt-list', icon: ArrowLeftRight, label: 'Branch' },
  { to: '/branch/manage', icon: Building2, label: 'Store Mgmt' },
  { to: '/layaway/list', icon: Clock, label: 'LayAway' },
  { to: '/payments', icon: Wallet, label: 'Payments' },
  { to: '/payments/list', icon: Wallet, label: 'Payment List' },
  { to: '/crm/customers', icon: Users, label: 'Customers' },
  { to: '/reports/daily-sales', icon: BarChart3, label: 'Reports' },
  { to: '/masters', icon: Settings, label: 'Masters' },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-48 bg-jewel-dark text-white flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="p-3 border-b border-gray-700">
          <h1 className="text-lg font-bold text-jewel-gold">JewelERP</h1>
          <p className="text-[10px] text-gray-400">Jewelry Management System</p>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 text-xs hover:bg-jewel-accent transition-colors ${
                  isActive ? 'bg-jewel-accent text-jewel-gold border-l-2 border-jewel-gold' : 'text-gray-300'
                }`
              }
            >
              <Icon size={14} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-gray-700 text-[10px] text-gray-400">
          <div>User: Admin</div>
          <div>FY: {getFinancialYear()}</div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top tabs bar */}
        <div className="bg-white border-b border-gray-200 px-2 py-1 flex items-center gap-1 text-xs flex-shrink-0">
          <span className="text-gray-500">
            {location.pathname === '/' ? 'Dashboard' : location.pathname.replace(/\//g, ' > ').slice(3)}
          </span>
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-gray-100 p-3">
          <Outlet />
        </main>

        {/* Status Bar */}
        <div className="status-bar no-print">
          <span>My Favourite Reports</span>
          <span>
            [User : Admin] - ({getFinancialYear()}) | JewelERP v1.0.0
          </span>
        </div>
      </div>
    </div>
  );
}
