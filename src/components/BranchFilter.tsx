import { useQuery } from '@tanstack/react-query';
import { reportsAPI } from '../lib/api';
import { useAuthStore } from '../lib/auth';

interface BranchFilterProps {
  value: string;
  onChange: (branchId: string) => void;
}

export default function BranchFilter({ value, onChange }: BranchFilterProps) {
  const user = useAuthStore((s) => s.user);
  const isMaster = user?.branch?.isMaster;

  const { data: branches } = useQuery({
    queryKey: ['report-branches'],
    queryFn: () => reportsAPI.branches().then((r) => r.data),
    enabled: !!isMaster,
  });

  if (!isMaster || !branches || branches.length <= 1) return null;

  return (
    <div>
      <label className="form-label block text-xs">Branch</label>
      <select className="form-select w-40" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All Branches</option>
        {branches.map((b: any) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </div>
  );
}
