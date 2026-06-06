/**
 * SupplierOrderTimeline
 * ─────────────────────
 * Vertical timeline showing state transitions for a supplier order.
 */
import { Clock, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';

interface StateEntry {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  reason?: string | null;
  changedBy?: { name?: string } | null;
  changedById?: number;
}

export default function SupplierOrderTimeline({ history }: { history: StateEntry[] }) {
  if (!history || history.length === 0) {
    return <p className="text-xs text-gray-400 italic">No status history yet.</p>;
  }

  return (
    <div className="relative pl-6 space-y-4">
      <div className="absolute left-2.5 top-2 bottom-2 w-px bg-gray-200" />
      {history.map((entry, idx) => {
        const isLast = idx === history.length - 1;
        const isCancelled = entry.toStatus === 'CANCELLED';
        const isClosed = entry.toStatus === 'CLOSED';
        const IconComp = isCancelled ? XCircle : isClosed ? CheckCircle2 : isLast ? ArrowRight : Clock;
        const iconColor = isCancelled ? 'text-red-500' : isClosed ? 'text-green-500' : isLast ? 'text-blue-500' : 'text-gray-400';

        return (
          <div key={entry.id} className="relative flex items-start gap-3">
            <div className={`absolute -left-3.5 mt-0.5 ${iconColor}`}>
              <IconComp size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-800">
                  {formatStatus(entry.toStatus)}
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(entry.changedAt).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
              {entry.reason && (
                <p className="text-[11px] text-gray-500 mt-0.5">{entry.reason}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).toLowerCase().replace(/^\w/, c => c.toUpperCase());
}
