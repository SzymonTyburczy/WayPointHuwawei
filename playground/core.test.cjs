// The browser build must answer exactly like the native CLI.
// node playground/core.test.cjs  (needs cpp/build-wasm/waypoint.wasm and cpp/build*/waypoint-cli)
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const WaypointCore = require('./waypoint-core.js');
const root = path.resolve(__dirname, '..');
const wasmPath = process.env.WAYPOINT_WASM || path.join(root, 'cpp/build-wasm/waypoint.wasm');
const cli = process.env.WAYPOINT_CLI || path.join(root, 'cpp/build/waypoint-cli');
const golden = path.join(root, 'cpp/core/tests/golden');

const native = (cmd, req) => {
  try {
    return execFileSync(cli, [cmd], { input: JSON.stringify(req), encoding: 'utf8' }).trim();
  } catch (e) {
    return String(e.stdout).trim();
  }
};

test('wasm answers exactly like the native core on every golden snapshot', async () => {
  const core = await WaypointCore.load(fs.readFileSync(wasmPath));
  const files = fs.readdirSync(golden).filter((f) => f.endsWith('.snapshot.json'));
  assert.ok(files.length >= 39);
  for (const f of files) {
    const snapshot = JSON.parse(fs.readFileSync(path.join(golden, f), 'utf8'));
    for (const cmd of ['finalize', 'audit', 'announce']) {
      assert.equal(core.callRaw(cmd, JSON.stringify({ snapshot })), native(cmd, { snapshot }), `${cmd} ${f}`);
    }
    const plan = { goal: 'make the text bigger', snapshot, history: { steps: [], canGoBack: true } };
    assert.equal(core.callRaw('plan', JSON.stringify(plan)), native('plan', plan), `plan ${f}`);
  }
  assert.equal(core.traps, 0);
});

test('a throw in the core becomes an error, and the core keeps working', async () => {
  const core = await WaypointCore.load(fs.readFileSync(wasmPath));
  const bad = core.call('label-request', { snapshot: { nodes: [] }, nodeId: 42 });
  assert.match(bad.error, /trapped/);
  await core.recover();
  assert.deepEqual(core.call('contrast', { fg: '#999999', bg: '#FFFFFF' }), { ratio: 2.849027755287037 });
  assert.match(core.call('nope', {}).error, /unknown command/);
});
