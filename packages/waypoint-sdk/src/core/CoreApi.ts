import type {
  Action,
  AuditReport,
  Candidate,
  LabelRequest,
  LabelValidation,
  Plan,
  PlanHistory,
  Snapshot,
} from '../types';

/** The string-level contract implemented by the C++ core (TurboModule or host CLI). */
export interface CoreStrings {
  snapshot?(surfaceId: number): string;
  finalize(rawSnapshotJson: string): string;
  audit(snapshotJson: string): string;
  planStep(goal: string, snapshotJson: string, historyJson: string): string;
  parseAction(text: string, candidatesJson: string): string;
  labelRequest(snapshotJson: string, nodeId: number): string;
  validateLabel(snapshotJson: string, nodeId: number, label: string): string;
}

export type ParsedAction = Action | { error: string };

/** Typed view of the core used by the rest of the SDK. */
export interface CoreApi {
  snapshot(surfaceId: number): Snapshot;
  finalize(raw: Snapshot): Snapshot;
  audit(snapshot: Snapshot): AuditReport;
  planStep(goal: string, snapshot: Snapshot, history: PlanHistory): Plan;
  parseAction(text: string, candidates: Candidate[]): ParsedAction;
  labelRequest(snapshot: Snapshot, nodeId: number): LabelRequest;
  validateLabel(snapshot: Snapshot, nodeId: number, label: string): LabelValidation;
}

export class CoreError extends Error {}

function parse<T>(json: string): T {
  const value = JSON.parse(json);
  if (value && typeof value === 'object' && 'error' in value && Object.keys(value).length === 1) {
    throw new CoreError(String(value.error));
  }
  return value as T;
}

function emptySnapshot(surfaceId: number, error: string): Snapshot {
  return { rev: '', surfaceId, viewport: { x: 0, y: 0, w: 0, h: 0 }, nodes: [], error };
}

/** Adapts a CoreStrings implementation to CoreApi; JSON in, JSON out. */
export class JsonCore implements CoreApi {
  constructor(private readonly impl: CoreStrings) {}

  snapshot(surfaceId: number): Snapshot {
    if (!this.impl.snapshot) return emptySnapshot(surfaceId, 'snapshot is not available on this core');
    try {
      const value = JSON.parse(this.impl.snapshot(surfaceId));
      if ('error' in value && !('nodes' in value)) return emptySnapshot(surfaceId, String(value.error));
      return value as Snapshot;
    } catch (e) {
      // RFC §13: a failing walker yields an empty snapshot with an error code.
      return emptySnapshot(surfaceId, e instanceof Error ? e.message : String(e));
    }
  }

  finalize(raw: Snapshot): Snapshot {
    return parse<Snapshot>(this.impl.finalize(JSON.stringify(raw)));
  }

  audit(snapshot: Snapshot): AuditReport {
    const report = parse<AuditReport>(this.impl.audit(JSON.stringify(snapshot)));
    return { ...report, rev: snapshot.rev };
  }

  planStep(goal: string, snapshot: Snapshot, history: PlanHistory): Plan {
    return parse<Plan>(this.impl.planStep(goal, JSON.stringify(snapshot), JSON.stringify(history)));
  }

  parseAction(text: string, candidates: Candidate[]): ParsedAction {
    try {
      return JSON.parse(this.impl.parseAction(text, JSON.stringify(candidates))) as ParsedAction;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  labelRequest(snapshot: Snapshot, nodeId: number): LabelRequest {
    return parse<LabelRequest>(this.impl.labelRequest(JSON.stringify(snapshot), nodeId));
  }

  validateLabel(snapshot: Snapshot, nodeId: number, label: string): LabelValidation {
    return parse<LabelValidation>(this.impl.validateLabel(JSON.stringify(snapshot), nodeId, label));
  }
}

export function isActionError(a: ParsedAction): a is { error: string } {
  return 'error' in a;
}
