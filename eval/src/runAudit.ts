// M2 (audit recall and precision per rule) and M3 (label acceptance) over every
// screen of the demo app in condition A (RFC-001 §12).
import { suggestLabels, type SuggestStats } from '../../packages/waypoint-sdk/src/audit/suggest';
import type { CoreApi } from '../../packages/waypoint-sdk/src/core/CoreApi';
import type { LlmBackend } from '../../packages/waypoint-sdk/src/llm/LlmBackend';
import type { RuleId } from '../../packages/waypoint-sdk/src/types';
import { Simulator } from './simulator';

export interface Defect {
  rule: RuleId;
  testID: string;
  screen: string;
  acceptedLabels?: string[];
}

export interface FoundFinding {
  rule: RuleId;
  testID: string;
  screen: string;
  severity: string;
  message: string;
  suggestion?: { label: string; confidence?: string };
}

export interface RuleScore {
  rule: RuleId;
  seeded: number;
  tp: number;
  fp: number;
  fn: number;
  recall: number;
  precision: number;
}

export interface AuditEval {
  findings: FoundFinding[]; // unique by (rule, testID), first screen wins
  rules: RuleScore[];
  falsePositives: FoundFinding[];
  missed: Defect[];
  labels: {
    r1Defects: number;
    suggested: number;
    fromModel: number;
    fromFallback: number;
    accepted: number; // M3: suggestion is in acceptedLabels
    rows: Array<{ testID: string; label?: string; confidence?: string; accepted: boolean }>;
  };
  overrides: Record<string, string>; // condition B
  contrastUnknown: number;
  suggestStats: SuggestStats;
}

const RULES: RuleId[] = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];

export async function runAudit(core: CoreApi, backend: LlmBackend | null, defects: Defect[]): Promise<AuditEval> {
  const sim = new Simulator(core, 'A');
  const seen = new Map<string, FoundFinding>();
  let contrastUnknown = 0;
  const total: SuggestStats = { asked: 0, accepted: 0, rejected: {}, fallbacks: 0, backendFailures: 0 };

  for (const screen of Simulator.screenIds()) {
    sim.open(screen);
    const snap = sim.snapshot();
    const byId = new Map(snap.nodes.map((n) => [n.id, n]));
    const raw = core.audit(snap);
    contrastUnknown += raw.contrastUnknown;
    const { report, stats } = await suggestLabels(core, backend, snap, raw);
    total.asked += stats.asked;
    total.accepted += stats.accepted;
    total.fallbacks += stats.fallbacks;
    total.backendFailures += stats.backendFailures;
    for (const [k, v] of Object.entries(stats.rejected)) total.rejected[k] = (total.rejected[k] ?? 0) + v;
    for (const f of report.findings) {
      const testID = byId.get(f.nodeId)?.testID ?? `#${f.nodeId}@${screen}`;
      const key = `${f.rule} ${testID}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        rule: f.rule,
        testID,
        screen,
        severity: f.severity,
        message: f.message,
        suggestion: f.suggestion ? { label: f.suggestion.label, confidence: f.suggestion.confidence } : undefined,
      });
    }
  }

  const findings = [...seen.values()];
  const defectKeys = new Set(defects.map((d) => `${d.rule} ${d.testID}`));
  const foundKeys = new Set(findings.map((f) => `${f.rule} ${f.testID}`));
  const rules = RULES.map((rule): RuleScore => {
    const seeded = defects.filter((d) => d.rule === rule).length;
    const tp = findings.filter((f) => f.rule === rule && defectKeys.has(`${f.rule} ${f.testID}`)).length;
    const fp = findings.filter((f) => f.rule === rule && !defectKeys.has(`${f.rule} ${f.testID}`)).length;
    return { rule, seeded, tp, fp, fn: seeded - tp, recall: seeded ? tp / seeded : 1, precision: tp + fp ? tp / (tp + fp) : 1 };
  });

  const r1 = defects.filter((d) => d.rule === 'R1');
  const rows = r1.map((d) => {
    const s = seen.get(`R1 ${d.testID}`)?.suggestion;
    const accepted = !!s && (d.acceptedLabels ?? []).some((a) => a.toLowerCase() === s.label.toLowerCase());
    return { testID: d.testID, label: s?.label, confidence: s?.confidence, accepted };
  });

  const overrides: Record<string, string> = {};
  for (const f of findings) {
    if ((f.rule === 'R1' || f.rule === 'R6') && f.suggestion && !f.testID.startsWith('#')) overrides[f.testID] = f.suggestion.label;
  }

  return {
    findings,
    rules,
    falsePositives: findings.filter((f) => !defectKeys.has(`${f.rule} ${f.testID}`)),
    missed: defects.filter((d) => !foundKeys.has(`${d.rule} ${d.testID}`)),
    labels: {
      r1Defects: r1.length,
      suggested: rows.filter((r) => r.label).length,
      fromModel: rows.filter((r) => r.confidence === 'model').length,
      fromFallback: rows.filter((r) => r.confidence === 'low').length,
      accepted: rows.filter((r) => r.accepted).length,
      rows,
    },
    overrides,
    contrastUnknown,
    suggestStats: total,
  };
}
