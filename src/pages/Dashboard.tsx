import { useQuery } from '@tanstack/react-query';
import { reportsAPI, mastersAPI } from '../lib/api';
import { formatCurrency, formatWeight } from '../lib/utils';
import { ShoppingCart, Package, Tag, Users, TrendingUp, TrendingDown, Scale } from 'lucide-react';

export default function Dashboard() {
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsAPI.dashboard().then((r) => r.data),
  });

  const stats = [
    {
      label: "Today's Sales",
      value: formatCurrency(dashboard?.todaySales?.amount || 0),
      count: `${dashboard?.todaySales?.count || 0} vouchers`,
      icon: TrendingUp,
      color: 'bg-green-500',
    },
    {
      label: "Today's Purchase",
      value: formatCurrency(dashboard?.todayPurchases?.amount || 0),
      count: `${dashboard?.todayPurchases?.count || 0} vouchers`,
      icon: TrendingDown,
      color: 'bg-orange-500',
    },
    {
      label: 'Total Stock',
      value: `${dashboard?.totalStock || 0} pcs`,
      count: 'In stock items',
      icon: Tag,
      color: 'bg-blue-500',
    },
    {
      label: 'Total Customers',
      value: dashboard?.totalCustomers || 0,
      count: 'Active accounts',
      icon: Users,
      color: 'bg-purple-500',
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="panel">
            <div className="panel-body flex items-start gap-3">
              <div className={`${stat.color} p-2 rounded-lg`}>
                <stat.icon size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p className="text-lg font-bold text-gray-800">{stat.value}</p>
                <p className="text-[10px] text-gray-400">{stat.count}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Metal Rates */}
      <div className="panel">
        <div className="panel-header flex items-center gap-2">
          <Scale size={14} />
          Latest Metal Rates
        </div>
        <div className="panel-body">
          {dashboard?.latestRates && dashboard.latestRates.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metal</th>
                  <th>Purity</th>
                  <th className="text-right">Rate (₹/gm)</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.latestRates.map((rate: any, i: number) => (
                  <tr key={i}>
                    <td>{rate.metalType?.name}</td>
                    <td>{rate.purityCode}</td>
                    <td className="text-right font-medium">{formatCurrency(rate.rate)}</td>
                    <td>{new Date(rate.date).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 text-center py-4">
              No metal rates configured. Go to Housekeeping &gt; Metal Rate to add rates.
            </p>
          )}
        </div>
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-6 gap-2">
        {[
          { label: 'Sales Entry', icon: ShoppingCart, to: '/sales/retail', key: 'F1' },
          { label: 'Purchase Entry', icon: Package, to: '/purchase/urd', key: 'F2' },
          { label: 'Cash Entry', icon: ShoppingCart, to: '/cash-bank/cash', key: 'F3' },
          { label: 'Label Entry', icon: Tag, to: '/inventory/labels/new', key: 'F4' },
          { label: 'Daily Report', icon: TrendingUp, to: '/reports/daily-sales', key: 'F5' },
          { label: 'Stock Report', icon: Scale, to: '/reports/stock', key: 'F6' },
        ].map((item) => (
          <a
            key={item.label}
            href={item.to}
            className="fn-key flex flex-col items-center gap-1 rounded hover:shadow-md transition-shadow"
          >
            <item.icon size={20} className="text-blue-600" />
            <span className="text-xs font-medium">{item.label}</span>
            <span className="fn-key-label">({item.key})</span>
          </a>
        ))}
      </div>
    </div>
  );
}
