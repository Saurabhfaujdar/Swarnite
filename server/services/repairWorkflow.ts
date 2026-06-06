/**
 * Repair Workflow State Machine
 * ──────────────────────────────
 * Single source of truth for which RepairStatus transitions are
 * allowed, and the only place that should write to RepairStateHistory.
 *
 * Why a state machine and not free-form updates?
 *  - Repairs touch customer-owned gold; an audit needs to be able to
 *    reconstruct exactly when a piece moved between hands.
 *  - Hard-coding allowed transitions stops a route from accidentally
 *    "delivering" a piece that was never QC'd.
 *  - REWORK_REQUIRED and CANCELLED are reachable from many states, so
 *    a simple "next status" enum isn't enough.
 *
 * Public API:
 *  - canTransition(from, to)
 *  - transition(tx, jobId, fromState, toState, userId, remarks?)
 */

import { Prisma, RepairStatus } from '@prisma/client';

// Map: from-status → set of allowed to-statuses.
// Anything not listed here is rejected.
const ALLOWED: Record<RepairStatus, RepairStatus[]> = {
  RECEIVED:                 ['UNDER_INSPECTION', 'CANCELLED'],
  UNDER_INSPECTION:         ['ESTIMATE_PENDING', 'ASSIGNED_TO_KARIGER', 'CANCELLED'],
  ESTIMATE_PENDING:         ['WAITING_CUSTOMER_APPROVAL', 'CANCELLED'],
  WAITING_CUSTOMER_APPROVAL:['ASSIGNED_TO_KARIGER', 'CANCELLED'],
  ASSIGNED_TO_KARIGER:      ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS:              ['RETURNED_BY_KARIGER', 'CANCELLED'],
  RETURNED_BY_KARIGER:      ['QUALITY_CHECK', 'REWORK_REQUIRED'],
  QUALITY_CHECK:            ['READY_FOR_DELIVERY', 'REWORK_REQUIRED'],
  READY_FOR_DELIVERY:       ['DELIVERED', 'REWORK_REQUIRED'],
  REWORK_REQUIRED:          ['ASSIGNED_TO_KARIGER', 'IN_PROGRESS', 'CANCELLED'],
  DELIVERED:                [],   // terminal
  CANCELLED:                [],   // terminal
};

export function canTransition(from: RepairStatus, to: RepairStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function nextStates(from: RepairStatus): RepairStatus[] {
  return ALLOWED[from] ?? [];
}

export class InvalidRepairTransitionError extends Error {
  constructor(public from: RepairStatus, public to: RepairStatus) {
    super(`Cannot transition repair from ${from} to ${to}`);
    this.name = 'InvalidRepairTransitionError';
  }
}

/**
 * Atomically validate, write history, and update the job's status.
 * MUST be called inside a Prisma transaction (`prisma.$transaction`)
 * so the history row + status update commit together.
 */
export async function transition(
  tx: Prisma.TransactionClient,
  jobId: number,
  fromState: RepairStatus,
  toState: RepairStatus,
  userId: number,
  remarks?: string,
): Promise<void> {
  if (fromState === toState) return; // no-op
  if (!canTransition(fromState, toState)) {
    throw new InvalidRepairTransitionError(fromState, toState);
  }
  await tx.repairStateHistory.create({
    data: { repairJobId: jobId, fromState, toState, remarks, changedBy: userId },
  });
  await tx.repairJob.update({
    where: { id: jobId },
    data: { status: toState, updatedBy: userId },
  });
}
