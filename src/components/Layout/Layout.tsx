import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Home, ShoppingCart, Package, ArrowLeftRight,
  BarChart3, Users, Clock, Settings, Tag, Wallet, Building2, LogOut, PiggyBank
} from 'lucide-react';
import { getFinancialYear } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth';
import { stockRequestAPI, savingsSchemeAPI } from '../../lib/api';

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/sales/retail', icon: ShoppingCart, label: 'Sales Entry' },
  { to: '/sales/list', icon: ShoppingCart, label: 'Sales List' },
  { to: '/purchase/urd', icon: Package, label: 'Purchase (URD)' },
  { to: '/inventory/labels', icon: Tag, label: 'Labels' },
  { to: '/branch/receipt-list', icon: ArrowLeftRight, label: 'Branch' },
  { to: '/branch/stock-requests', icon: Package, label: 'Stock Requests' },
  { to: '/branch/manage', icon: Building2, label: 'Store Mgmt' },
  { to: '/layaway/list', icon: Clock, label: 'LayAway' },
  { to: '/savings-scheme/list', icon: PiggyBank, label: 'Savings Scheme' },
  { to: '/payments', icon: Wallet, label: 'Payments' },
  { to: '/crm/customers', icon: Users, label: 'Customers' },
  { to: '/reports/daily-sales', icon: BarChart3, label: 'Reports' },
  { to: '/masters', icon: Settings, label: 'Masters' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  // Pending incoming stock-transfer requests for the user's branch.
  // Polled every 30s so the sidebar badge acts as a lightweight
  // reminder for branch staff that requests are awaiting action.
  const { data: pendingCount } = useQuery({
    queryKey: ['stock-requests', 'pending-count'],
    queryFn: async () => {
      const res = await stockRequestAPI.pendingCount();
      return res.data as { incoming: number; outgoing: number };
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    enabled: !!user,
  });
  const incomingPending = pendingCount?.incoming ?? 0;

  // Savings-scheme installments inside the auto-reminder window
  // (default: 2 days before due, day-of, 2 days after). Surfaced as
  // a sidebar badge so cashiers see "X reminders to send" at a glance.
  const { data: dueReminders } = useQuery({
    queryKey: ['savings-scheme', 'reminders', 'due'],
    queryFn: async () => {
      const res = await savingsSchemeAPI.dueReminders();
      return res.data as { total: number };
    },
    // Poll less aggressively than stock requests \u2014 the window only
    // shifts at midnight and new installments don't appear hourly.
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
    enabled: !!user,
  });
  const reminderCount = dueReminders?.total ?? 0;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-48 bg-jewel-dark text-white flex flex-col flex-shrink-0 z-10">
        {/* Logo */}
        <div className="p-3 border-b border-gray-700">
          <h1 className="text-lg font-bold text-jewel-gold">JewelERP</h1>
          <p className="text-[10px] text-gray-400">Jewelry Management System</p>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map(({ to, icon: Icon, label }) => {
            const isStockRequests = to === '/branch/stock-requests';
            const isSavingsScheme = to === '/savings-scheme/list';
            const stockBadge = isStockRequests && incomingPending > 0;
            const reminderBadge = isSavingsScheme && reminderCount > 0;
            const showBadge = stockBadge || reminderBadge;
            const badgeCount = stockBadge ? incomingPending : reminderCount;
            const badgeTestId = stockBadge ? 'stock-requests-badge' : 'savings-reminders-badge';
            const badgeTitle = stockBadge
              ? `${incomingPending} pending incoming stock request${incomingPending === 1 ? '' : 's'}`
              : `${reminderCount} savings installment reminder${reminderCount === 1 ? '' : 's'} due`;
            return (
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
                <span className="flex-1">{label}</span>
                {showBadge && (
                  <span
                    data-testid={badgeTestId}
                    title={badgeTitle}
                    aria-label={badgeTitle}
                    className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none"
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-gray-700 text-[10px] text-gray-400 flex-shrink-0">
          <div>{user?.fullName ?? 'User'}</div>
          <div>{user?.branch?.name ?? ''}</div>
          <div>FY: {getFinancialYear()}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 mt-2 text-gray-400 hover:text-red-400 transition-colors"
          >
            <LogOut size={12} />
            <span>Logout</span>
          </button>
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

        {/* Page Content (flex column so pages can use h-full / flex-1) */}
        <main className="flex-1 overflow-auto bg-gray-100 p-3 flex flex-col min-h-0">
          <Outlet />
        </main>

        {/* Status Bar (inline flex child — no longer position:fixed) */}
        <div className="status-bar no-print">
          <span>My Favourite Reports</span>
          <span>
            [{user?.fullName ?? 'User'} : {user?.branch?.name ?? ''}] - ({getFinancialYear()}) | JewelERP v1.0.0
          </span>
        </div>
      </div>
    </div>
  );
}
