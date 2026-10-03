// Accessibility gate for CI: audit every screen, compare with a committed
// baseline, and fail when a screen's score drops or a new finding appears.
//
//   npm run gate -- --demo A --baseline a11y-baseline.json            check the simulated demo app
//   npm run gate -- --snapshots dir/ --baseline a11y-baseline.json    check snapshots pulled from a device
//   … --update                                                       accept the current state as the new baseline
//
// The Markdown summary goes to stdout and, on GitHub Actions, to the job summary.
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';

import type { CoreApi } from '../../packages/waypoint-sdk/src/core/CoreApi';
import { createCliCore } from '../../packages/waypoint-sdk/src/node/cliCore';
import type { Snapshot } from '../../packages/waypoint-sdk/src/types';
import type { Condition } from '../../examples/demo-app/src/app/spec';
import { Simulator } from './simulator';

export interface ScreenResult {
  score: number;
  findings: string[]; // "R1 tab-settings", sorted
}

export type Baseline = { screens: Record<string, ScreenResult> };

export interface GateResult {
  ok: boolean;
  regressions: string[];
  improvements: string[];
  current: Baseline;
  markdown: string;
}

export function auditScreens(core: CoreApi, screens: Array<{ name: string; snapshot: Snapshot }>): Baseline {
  const out: Baseline = { screens: {} };
  for (const { name, snapshot } of screens) {
    const snap = core.finalize(snapshot);
    const report = core.audit(snap);
    const ids = new Map(snap.nodes.map((n) => [n.id, n.testID ?? `#${n.id}`]));
    out.screens[name] = {
      score: report.score?.score ?? 0,
      findings: [...new Set(report.findings.map((f) => `${f.rule} ${ids.get(f.nodeId)}`))].sort(),
    };
  }
  return out;
}

export function compare(baseline: Baseline, current: Baseline): GateResult {
  const regressions: string[] = [];
  const improvements: string[] = [];
  const rows: string[] = [];
  const names = [...new Set([...Object.keys(baseline.screens), ...Object.keys(current.screens)])].sort();
  for (const name of names) {
    const was = baseline.screens[name];
    const now = current.screens[name];
    if (!now) {
      improvements.push(`${name}: screen removed`);
      continue;
    }
    if (!was) {
      if (now.findings.length) regressions.push(`${name}: new screen with ${now.findings.length} finding(s)`);
      rows.push(`| ${name} | new | ${now.score} | ${now.findings.join('<br>') || '—'} | |`);
      continue;
    }
    const added = now.findings.filter((f) => !was.findings.includes(f));
    const fixed = was.findings.filter((f) => !now.findings.includes(f));
    if (now.score < was.score) regressions.push(`${name}: score ${was.score} → ${now.score}`);
    for (const f of added) regressions.push(`${name}: new finding ${f}`);
    if (now.score > was.score) improvements.push(`${name}: score ${was.score} → ${now.score}`);
    for (const f of fixed) improvements.push(`${name}: fixed ${f}`);
    if (added.length || fixed.length || now.score !== was.score) {
      rows.push(`| ${name} | ${was.score} | ${now.score} | ${added.join('<br>') || '—'} | ${fixed.join('<br>') || '—'} |`);
    }
  }
  const ok = regressions.length === 0;
  const md = [
    `## Accessibility gate: ${ok ? 'passed' : 'failed'}`,
    '',
    `${Object.keys(current.screens).length} screens checked · ${regressions.length} regression(s) · ${improvements.length} improvement(s).`,
    '',
  ];
  if (rows.length) md.push('| Screen | Score before | Score now | New findings | Fixed |', '| --- | --- | --- | --- | --- |', ...rows, '');
  if (!ok) md.push('Fix the regressions, or run the gate with `--update` to accept them as the new baseline.', '');
  return { ok, regressions, improvements, current, markdown: md.join('\n') };
}

function flags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    out[argv[i].slice(2)] = next && !next.startsWith('--') ? (i++, next) : 'true';
  }
  return out;
}

function main() {
  const f = flags(process.argv.slice(2));
  const core = createCliCore();
  let screens: Array<{ name: string; snapshot: Snapshot }>;
  if (f.snapshots) {
    const dir = resolve(f.snapshots);
    screens = readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .map((n) => ({ name: basename(n, '.json').replace(/\.snapshot$/, ''), snapshot: JSON.parse(readFileSync(join(dir, n), 'utf8')) }));
  } else {
    const sim = new Simulator(core, (f.demo ?? 'A') as Condition);
    screens = Simulator.screenIds().map((id) => {
      sim.open(id);
      return { name: id, snapshot: sim.rawSnapshot() };
    });
  }
  const current = auditScreens(core, screens);
  const baselinePath = resolve(f.baseline ?? 'a11y-baseline.json');
  if (f.update) {
    writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
    console.log(`Baseline written to ${baselinePath} (${screens.length} screens).`);
    return;
  }
  let baseline: Baseline;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch {
    console.error(`No baseline at ${baselinePath}; create one with --update.`);
    process.exit(2);
  }
  const result = compare(baseline, current);
  console.log(result.markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.markdown + '\n');
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main();
