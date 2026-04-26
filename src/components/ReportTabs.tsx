import { NavLink } from 'react-router-dom';

const reportTabs = [
  { to: '/reports/daily-sales', label: 'Daily Sales' },
  { to: '/reports/item-wise-sales', label: 'Item-Wise Sales' },
  { to: '/reports/stock', label: 'Stock' },
  { to: '/reports/counter-wise', label: 'Counter-Wise' },
];

export default function ReportTabs() {
  return (
    <div className="flex gap-1 bg-white rounded border p-1">
      {reportTabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              isActive
                ? 'bg-jewel-royal text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
