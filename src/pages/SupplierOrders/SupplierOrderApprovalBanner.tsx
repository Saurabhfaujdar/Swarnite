/**
 * SupplierOrderApprovalBanner
 * ───────────────────────────
 * Shows a warning banner when the order requires approval.
 */
import { AlertTriangle } from 'lucide-react';

interface Props {
  approvalRequired: boolean;
  approvedById?: number | null;
  weightAdjustmentsPending?: number;
}

export default function SupplierOrderApprovalBanner({ approvalRequired, approvedById, weightAdjustmentsPending }: Props) {
  const needsApproval = approvalRequired && !approvedById;
  const hasUnapproved = (weightAdjustmentsPending || 0) > 0;

  if (!needsApproval && !hasUnapproved) return null;

  return (
    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 mb-4">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          {needsApproval && (
            <p className="text-xs text-amber-800 font-medium">
              This order requires manager approval before proceeding.
            </p>
          )}
          {hasUnapproved && (
            <p className="text-xs text-amber-700">
              {weightAdjustmentsPending} weight adjustment(s) pending approval — order cannot be closed until resolved.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
