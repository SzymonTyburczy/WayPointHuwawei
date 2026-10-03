// results.md from the raw evaluation output.
import type { BackendInfo } from '../../packages/waypoint-sdk/src/llm/LlmBackend';
import type { AuditEval } from './runAudit';
import type { Trial } from './runGuide';
import { median, pct, percentile, wilson } from './stats';

export interface RunMeta {
  date: string;
  backend: BackendInfo;
  url?: string;
  seed: number;
  temperature: number;
  maxSteps: number;
  coreCommit?: string;
}

export function successTable(trials: Trial[]): Array<{ condition: string; successes: number; n: number; text: string }> {
  const rows = [];
  for (const c of ['A', 'B', 'C'] as const) {
    const ts = trials.filter((t) => t.condition === c);
    if (ts.length === 0) continue;
    const s = ts.filter((t) => t.success).length;
    const w = wilson(s, ts.length);
    rows.push({ condition: c, successes: s, n: ts.length, text: `${s}/${ts.length} (${pct(w.p)}; 95% CI ${pct(w.low)}–${pct(w.high)})` });
  }
  return rows;
}

export function renderReport(meta: RunMeta, audit: AuditEval | null, trials: Trial[]): string {
  const L: string[] = [];
  L.push('# Waypoint evaluation results', '');
  L.push(`Generated ${meta.date} by \`eval/src/cli.ts\`. Raw logs sit next to this file.`, '');
  L.push('| Setting | Value |', '| --- | --- |');
  L.push(`| Backend | ${meta.backend.kind} (${meta.backend.model})${meta.url ? ` at ${meta.url}` : ''} |`);
  L.push(`| Temperature / seed | ${meta.temperature} / ${meta.seed} |`);
  L.push(`| Step limit | ${meta.maxSteps} |`);
  L.push('| App | simulated demo app (`eval/src/simulator.ts`), host |');
  if (meta.coreCommit) L.push(`| Commit | ${meta.coreCommit} |`);
  L.push('');
  if (meta.backend.kind === 'baseline') {
    L.push(
      '> **This run uses the lexical baseline, not a language model.** It shows that the harness works and gives a',
      '> floor. Numbers about Waypoint\'s guide come from a run against `llama-server` (see eval/README.md).',
      '',
    );
  }

  if (trials.length) {
    L.push('## M1 — Guide success rate', '');
    L.push('| Condition | Success | ', '| --- | --- |');
    const names: Record<string, string> = { A: 'A — defective', B: 'B — auto-fixed (accepted suggestions)', C: 'C — hand-fixed' };
    for (const r of successTable(trials)) L.push(`| ${names[r.condition]} | ${r.text} |`);
    L.push('');
    L.push('Per task (successes out of phrasings):', '');
    const taskIds = [...new Set(trials.map((t) => t.task))].sort((a, b) => a - b);
    const conds = [...new Set(trials.map((t) => t.condition))];
    L.push(`| Task | ${conds.join(' | ')} |`, `| --- | ${conds.map(() => '---').join(' | ')} |`);
    for (const id of taskIds) {
      const cells = conds.map((c) => {
        const ts = trials.filter((t) => t.task === id && t.condition === c);
        return `${ts.filter((t) => t.success).length}/${ts.length}`;
      });
      L.push(`| ${id} | ${cells.join(' | ')} |`);
    }
    L.push('');
    const reasons = new Map<string, number>();
    for (const t of trials.filter((x) => !x.success)) reasons.set(`${t.condition}:${t.stop}`, (reasons.get(`${t.condition}:${t.stop}`) ?? 0) + 1);
    if (reasons.size) {
      L.push('Failure reasons: ' + [...reasons.entries()].map(([k, v]) => `${k} ×${v}`).join(', '), '');
    }

    const ms = trials.flatMap((t) => t.callMs);
    L.push('## M4 — Step latency', '');
    if (meta.backend.kind === 'baseline') {
      L.push('Not meaningful for the baseline (no model).', '');
    } else {
      L.push(`${ms.length} model calls: median ${(median(ms) / 1000).toFixed(2)} s, p90 ${(percentile(ms, 0.9) / 1000).toFixed(2)} s.`, '');
    }
  }

  if (audit) {
    L.push('## M2 — Audit recall and precision', '');
    L.push('| Rule | Seeded | TP | FP | FN | Recall | Precision |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const r of audit.rules) {
      L.push(`| ${r.rule} | ${r.seeded} | ${r.tp} | ${r.fp} | ${r.fn} | ${r.tp}/${r.seeded} | ${r.tp}/${r.tp + r.fp} |`);
    }
    const tp = audit.rules.reduce((a, r) => a + r.tp, 0);
    const seeded = audit.rules.reduce((a, r) => a + r.seeded, 0);
    const fp = audit.rules.reduce((a, r) => a + r.fp, 0);
    L.push(`| **All** | ${seeded} | ${tp} | ${fp} | ${seeded - tp} | ${tp}/${seeded} | ${tp}/${tp + fp} |`, '');
    if (audit.falsePositives.length) {
      L.push('Findings outside the seeded list (review by hand):', '');
      for (const f of audit.falsePositives) L.push(`- ${f.rule} \`${f.testID}\` on ${f.screen}: ${f.message}`);
      L.push('');
    }
    if (audit.missed.length) {
      L.push('Missed seeded defects:', '');
      for (const d of audit.missed) L.push(`- ${d.rule} \`${d.testID}\` on ${d.screen}`);
      L.push('');
    }
    L.push(`Text over images, contrast not computed: ${audit.contrastUnknown}.`, '');

    L.push('## M3 — Label acceptance', '');
    const l = audit.labels;
    L.push(
      `${l.accepted}/${l.r1Defects} R1 defects received a suggestion from the accepted list ` +
        `(${l.fromModel} from the model, ${l.fromFallback} low-confidence fallbacks, ${l.r1Defects - l.suggested} without a suggestion).`,
      '',
    );
    L.push('| testID | Suggestion | Source | Accepted |', '| --- | --- | --- | --- |');
    for (const r of l.rows) L.push(`| ${r.testID} | ${r.label ?? '—'} | ${r.confidence ?? '—'} | ${r.accepted ? 'yes' : 'no'} |`);
    const rej = Object.entries(audit.suggestStats.rejected);
    L.push('');
    L.push(`Model calls: ${audit.suggestStats.asked}; rejected by the validator: ${rej.length ? rej.map(([k, v]) => `${k} ×${v}`).join(', ') : 'none'}.`, '');
  }

  L.push('## Threats to validity', '');
  L.push('- We wrote the app, the tasks and the phrasings, so the set is biased toward what works.');
  L.push('- Thirty trials per condition is small; the intervals are wide.');
  L.push('- The host simulator mirrors the demo app\'s layout and props but is not the emulator; device runs are authoritative.');
  L.push('');
  return L.join('\n');
}
