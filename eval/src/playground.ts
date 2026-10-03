// Builds the self-contained playground page: the WebAssembly core, its loader and
// every demo screen as a raw snapshot, inlined into playground/template.html.
//
//   cpp/wasm/build.sh && npm run playground   →  results/playground.html
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import { createCliCore } from '../../packages/waypoint-sdk/src/node/cliCore';
import { SCREENS, TABS, screenById } from '../../examples/demo-app/src/app/spec';
import { crawl } from './crawl';
import { Simulator } from './simulator';

const root = resolve(__dirname, '../..');
const wasmPath = process.env.WAYPOINT_WASM ?? resolve(root, 'cpp/build-wasm/waypoint.wasm');
if (!existsSync(wasmPath)) {
  console.error(`missing ${wasmPath}; run cpp/wasm/build.sh first`);
  process.exit(1);
}

const core = createCliCore();
const sim = new Simulator(core, 'A');
const screens = SCREENS.map((s) => {
  sim.open(s.id);
  return { id: s.id, title: s.title, root: s.root, raw: sim.rawSnapshot() };
});

// Condition C is condition A plus the hand-written labels.
const hand: Record<string, string> = {};
for (const t of TABS) hand[t.testID] = t.handLabel;
for (const s of SCREENS) {
  if (s.headerAction?.handLabel) hand[s.headerAction.testID] = s.headerAction.handLabel;
  for (const el of s.body) if (el.handLabel) hand[el.testID] = el.handLabel;
}

const edges = crawl(core, 'A').edges.map(({ from, to, testID }) => ({ from, to, testID }));
let commit = 'local';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  // not a git checkout
}

const data = { screens, hand, edges, commit, start: screenById('home').id };
const template = readFileSync(resolve(root, 'playground/template.html'), 'utf8');
const loader = readFileSync(resolve(root, 'playground/waypoint-core.js'), 'utf8');
const html = template
  .split('/*__CORE_JS__*/').join(loader)
  .split('/*__DATA__*/').join(JSON.stringify(data))
  .split('/*__WASM_BASE64__*/').join(readFileSync(wasmPath).toString('base64'));
const out = resolve(__dirname, '..', process.argv[2] ?? 'results/playground.html');
writeFileSync(out, html);
console.error(`Wrote ${out} (${Math.round(html.length / 1024)} KB)`);
