// Evaluation entry point.
//
//   npm run all -- --backend remote --url http://127.0.0.1:8080 --model qwen3-1.7b-q4_k_m
//   npm run all -- --backend lexical           (CI smoke run, no model)
//   npm run audit -- --backend none            (M2 + fallback-only M3)
//   npm run golden                             (regenerate cpp/core/tests/golden/demo_*)
//   npm run report                             (results/report.html, before/after wireframes)
//
// Flags: --backend lexical|remote|none  --url  --model  --conditions A,B,C
//        --tasks 1,2,3  --phrasings 3  --out results/<name>  --seed 0
import { execSync } from 'child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

import { createCliCore } from '../../packages/waypoint-sdk/src/node/cliCore';
import type { LlmBackend } from '../../packages/waypoint-sdk/src/llm/LlmBackend';
import { RemoteBackend } from '../../packages/waypoint-sdk/src/llm/RemoteBackend';
import type { Condition } from '../../examples/demo-app/src/app/spec';
import { LexicalBackend } from './baseline';
import { renderReport, successTable } from './report';
import { runAudit, type Defect } from './runAudit';
import { runGuide, type Task } from './runGuide';
import { renderHtmlReport, type ScreenAudit } from './htmlReport';
import { Simulator } from './simulator';
import { suggestLabels } from '../../packages/waypoint-sdk/src/audit/suggest';
import { screenById } from '../../examples/demo-app/src/app/spec';

import defectsFile from '../defects.json';
import tasksFile from '../tasks.json';

function flags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      out[key] = next && !next.startsWith('--') ? (i++, next) : 'true';
    }
  }
  return out;
}

function makeBackend(f: Record<string, string>): LlmBackend | null {
  switch (f.backend ?? 'lexical') {
    case 'none':
      return null;
    case 'lexical':
      return new LexicalBackend();
    case 'remote':
      return new RemoteBackend({
        url: f.url ?? 'http://127.0.0.1:8080',
        model: f.model,
        seed: Number(f.seed ?? 0),
        timeoutMs: Number(f.timeout ?? 60_000), // the host harness tolerates slow CPUs
        isDev: true,
      });
    default:
      throw new Error(`unknown backend ${f.backend}`);
  }
}

function gitCommit(): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

async function main() {
  const [cmd = 'all', ...rest] = process.argv.slice(2);
  const f = flags(rest);
  const core = createCliCore();
  const defects = defectsFile.defects as Defect[];

  if (cmd === 'golden') return golden(core, defects);
  if (cmd === 'report') return report(core, defects, f);

  const backend = makeBackend(f);
  const info = backend ? await backend.info() : { kind: 'baseline' as const, model: 'none' };
  const out = resolve(__dirname, '..', f.out ?? `results/${info.kind}-${info.model}`.replace(/[^a-zA-Z0-9/._-]/g, '_'));
  mkdirSync(out, { recursive: true });
  const meta = { date: new Date().toISOString(), backend: info, url: f.url, seed: Number(f.seed ?? 0), temperature: 0, maxSteps: tasksFile.maxSteps, coreCommit: gitCommit() };

  let audit = null;
  if (cmd === 'audit' || cmd === 'all') {
    console.error('Auditing every screen of the demo app (condition A)…');
    audit = await runAudit(core, backend, defects);
    writeFileSync(join(out, 'audit.json'), JSON.stringify(audit, null, 2));
    const tp = audit.rules.reduce((a, r) => a + r.tp, 0);
    console.error(`M2: ${tp}/${defects.length} seeded defects found, ${audit.falsePositives.length} other findings`);
    console.error(`M3: ${audit.labels.accepted}/${audit.labels.r1Defects} accepted labels`);
  }

  let trials: Awaited<ReturnType<typeof runGuide>> = [];
  if (cmd === 'guide' || cmd === 'all') {
    if (!backend) throw new Error('the guide needs a backend (--backend lexical|remote)');
    const conditions = (f.conditions ?? 'A,B,C').split(',') as Condition[];
    const wanted = f.tasks ? new Set(f.tasks.split(',').map(Number)) : null;
    const n = Number(f.phrasings ?? 3);
    const tasks = (tasksFile.tasks as Task[]).filter((t) => !wanted || wanted.has(t.id)).map((t) => ({ ...t, phrasings: t.phrasings.slice(0, n) }));
    const overridesB = audit?.overrides ?? (await runAudit(core, backend, defects)).overrides;
    const log: string[] = [];
    trials = await runGuide(core, backend, tasks, conditions, overridesB, tasksFile.maxSteps, (t) => {
      log.push(JSON.stringify(t));
      console.error(`${t.condition} task ${t.task} ${t.success ? 'OK  ' : 'FAIL'} ${t.steps} steps (${t.stop}) "${t.phrasing}"`);
    });
    writeFileSync(join(out, 'trials.jsonl'), log.join('\n') + '\n');
    for (const r of successTable(trials)) console.error(`M1 ${r.condition}: ${r.text}`);
  }

  writeFileSync(join(out, 'results.md'), renderReport(meta, audit, trials));
  console.error(`Wrote ${join(out, 'results.md')}`);
}

/** HTML audit report: every screen before and after accepting the label suggestions. */
async function report(core: ReturnType<typeof createCliCore>, defects: Defect[], f: Record<string, string>) {
  const backend = f.backend && f.backend !== 'none' ? makeBackend(f) : null;
  const info = backend ? await backend.info() : null;
  const { overrides } = await runAudit(core, backend, defects);
  const before = new Simulator(core, 'A');
  const after = new Simulator(core, 'B', overrides);
  const screens: ScreenAudit[] = [];
  for (const id of Simulator.screenIds()) {
    before.open(id);
    after.open(id);
    const b = before.snapshot();
    const a = after.snapshot();
    const { report: withFixes } = await suggestLabels(core, backend, b, core.audit(b));
    screens.push({ id, title: screenById(id).title, before: { snapshot: b, report: withFixes }, after: { snapshot: a, report: core.audit(a) } });
  }
  const source = info && info.kind !== 'baseline' ? `model ${info.model}` : 'no-model fallback labels';
  const html = renderHtmlReport({ app: 'CityRide', generated: new Date().toISOString(), commit: gitCommit(), suggestionSource: source }, screens);
  const out = resolve(__dirname, '..', f.out ?? 'results/report.html');
  writeFileSync(out, html);
  console.error(`Wrote ${out}`);
}

/** Golden snapshots for the C++ tests: every screen in A and C with its expected findings. */
function golden(core: ReturnType<typeof createCliCore>, defects: Defect[]) {
  const dir = resolve(__dirname, '../../cpp/core/tests/golden');
  for (const file of readdirSync(dir)) if (file.startsWith('demo_')) rmSync(join(dir, file));
  let count = 0;
  for (const condition of ['A', 'C'] as Condition[]) {
    const sim = new Simulator(core, condition);
    for (const screen of Simulator.screenIds()) {
      sim.open(screen);
      const raw = sim.rawSnapshot();
      const finalized = core.finalize(raw);
      const visible = new Set(finalized.nodes.filter((n) => n.visible).map((n) => n.testID));
      // In C the hand-written labels fix every R1 and the R6 image; nothing else changes.
      const expected = defects
        .filter((d) => visible.has(d.testID))
        .filter((d) => condition === 'A' || (d.rule !== 'R1' && d.rule !== 'R6'))
        .map((d) => ({ rule: d.rule, testID: d.testID }));
      const stem = `demo_${condition}_${screen}`;
      writeFileSync(join(dir, `${stem}.snapshot.json`), JSON.stringify(raw, null, 1) + '\n');
      writeFileSync(join(dir, `${stem}.expected.json`), JSON.stringify(expected, null, 1) + '\n');
      count++;
    }
  }
  console.error(`Wrote ${count} golden snapshots to ${dir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
