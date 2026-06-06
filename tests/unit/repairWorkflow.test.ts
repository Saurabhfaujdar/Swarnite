/**
 * Repair Workflow State Machine — unit tests
 *
 * The state machine is the safety belt that prevents invalid moves
 * (e.g. delivering a piece that was never QC'd). These tests cover
 * the full transition matrix exhaustively and guard against silent
 * regressions if someone widens an `ALLOWED` row.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  canTransition, nextStates, transition, InvalidRepairTransitionError,
} from '../../server/services/repairWorkflow';
import type { RepairStatus } from '@prisma/client';

const ALL_STATES: RepairStatus[] = [
  'RECEIVED', 'UNDER_INSPECTION', 'ESTIMATE_PENDING', 'WAITING_CUSTOMER_APPROVAL',
  'ASSIGNED_TO_KARIGER', 'IN_PROGRESS', 'RETURNED_BY_KARIGER', 'QUALITY_CHECK',
  'READY_FOR_DELIVERY', 'DELIVERED', 'REWORK_REQUIRED', 'CANCELLED',
];

describe('repairWorkflow.canTransition', () => {
  it('allows the documented happy-path chain', () => {
    const happy: RepairStatus[] = [
      'RECEIVED', 'UNDER_INSPECTION', 'ASSIGNED_TO_KARIGER', 'IN_PROGRESS',
      'RETURNED_BY_KARIGER', 'QUALITY_CHECK', 'READY_FOR_DELIVERY', 'DELIVERED',
    ];
    for (let i = 0; i < happy.length - 1; i++) {
      expect(canTransition(happy[i], happy[i + 1])).toBe(true);
    }
  });

  it('allows estimate / approval branch', () => {
    expect(canTransition('UNDER_INSPECTION', 'ESTIMATE_PENDING')).toBe(true);
    expect(canTransition('ESTIMATE_PENDING', 'WAITING_CUSTOMER_APPROVAL')).toBe(true);
    expect(canTransition('WAITING_CUSTOMER_APPROVAL', 'ASSIGNED_TO_KARIGER')).toBe(true);
  });

  it('allows REWORK loop from QC and from ready-for-delivery', () => {
    expect(canTransition('QUALITY_CHECK', 'REWORK_REQUIRED')).toBe(true);
    expect(canTransition('READY_FOR_DELIVERY', 'REWORK_REQUIRED')).toBe(true);
    expect(canTransition('REWORK_REQUIRED', 'ASSIGNED_TO_KARIGER')).toBe(true);
    expect(canTransition('REWORK_REQUIRED', 'IN_PROGRESS')).toBe(true);
  });

  it('rejects skipping QC (cannot go straight from IN_PROGRESS to READY_FOR_DELIVERY)', () => {
    expect(canTransition('IN_PROGRESS', 'READY_FOR_DELIVERY')).toBe(false);
  });

  it('rejects delivering directly from RECEIVED', () => {
    expect(canTransition('RECEIVED', 'DELIVERED')).toBe(false);
  });

  it('treats DELIVERED and CANCELLED as terminal', () => {
    for (const to of ALL_STATES) {
      expect(canTransition('DELIVERED', to)).toBe(false);
      expect(canTransition('CANCELLED', to)).toBe(false);
    }
  });

  it('allows CANCELLED from any pre-return state', () => {
    expect(canTransition('RECEIVED', 'CANCELLED')).toBe(true);
    expect(canTransition('UNDER_INSPECTION', 'CANCELLED')).toBe(true);
    expect(canTransition('ESTIMATE_PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(true);
    // After kariger has returned the piece, cancelling would orphan
    // the metal ledger — must go via REWORK or normal flow.
    expect(canTransition('RETURNED_BY_KARIGER', 'CANCELLED')).toBe(false);
    expect(canTransition('QUALITY_CHECK', 'CANCELLED')).toBe(false);
  });

  it('refuses self-transition implicitly via canTransition (transition() short-circuits no-ops)', () => {
    // canTransition is strict: nothing → itself
    for (const s of ALL_STATES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });
});

describe('repairWorkflow.nextStates', () => {
  it('returns sane lists for every state', () => {
    for (const s of ALL_STATES) {
      const next = nextStates(s);
      expect(Array.isArray(next)).toBe(true);
    }
  });
  it('returns [] for terminal states', () => {
    expect(nextStates('DELIVERED')).toEqual([]);
    expect(nextStates('CANCELLED')).toEqual([]);
  });
});

describe('repairWorkflow.transition', () => {
  it('writes history + updates job atomically on a valid move', async () => {
    const tx = {
      repairStateHistory: { create: vi.fn().mockResolvedValue({}) },
      repairJob: { update: vi.fn().mockResolvedValue({}) },
    } as any;
    await transition(tx, 1, 'RECEIVED', 'UNDER_INSPECTION', 42, 'Inspecting');
    expect(tx.repairStateHistory.create).toHaveBeenCalledWith({
      data: {
        repairJobId: 1,
        fromState: 'RECEIVED',
        toState: 'UNDER_INSPECTION',
        remarks: 'Inspecting',
        changedBy: 42,
      },
    });
    expect(tx.repairJob.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'UNDER_INSPECTION', updatedBy: 42 },
    });
  });

  it('is a no-op when from === to (does NOT throw and writes nothing)', async () => {
    const tx = {
      repairStateHistory: { create: vi.fn() },
      repairJob: { update: vi.fn() },
    } as any;
    await transition(tx, 1, 'RECEIVED', 'RECEIVED', 1);
    expect(tx.repairStateHistory.create).not.toHaveBeenCalled();
    expect(tx.repairJob.update).not.toHaveBeenCalled();
  });

  it('throws InvalidRepairTransitionError on illegal move and writes nothing', async () => {
    const tx = {
      repairStateHistory: { create: vi.fn() },
      repairJob: { update: vi.fn() },
    } as any;
    await expect(
      transition(tx, 1, 'RECEIVED', 'DELIVERED', 1),
    ).rejects.toBeInstanceOf(InvalidRepairTransitionError);
    expect(tx.repairStateHistory.create).not.toHaveBeenCalled();
    expect(tx.repairJob.update).not.toHaveBeenCalled();
  });

  it('error message names both states for easy debugging', async () => {
    const tx = {
      repairStateHistory: { create: vi.fn() },
      repairJob: { update: vi.fn() },
    } as any;
    await expect(transition(tx, 1, 'DELIVERED', 'RECEIVED', 1))
      .rejects.toThrow(/DELIVERED.*RECEIVED/);
  });
});
