import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCliCore } from '../../packages/waypoint-sdk/src/node/cliCore';
import { auditScreens, compare } from './gate';
import { Simulator } from './simulator';

const core = createCliCore();

function demo(condition: 'A' | 'C') {
  const sim = new Simulator(core, condition);
  return auditScreens(
    core,
    Simulator.screenIds().map((id) => {
      sim.open(id);
      return { name: id, snapshot: sim.rawSnapshot() };
    }),
  );
}

test('the same app passes against its own baseline', () => {
  const a = demo('A');
  const r = compare(a, a);
  assert.ok(r.ok);
  assert.equal(r.regressions.length, 0);
});

test('removing labels is caught as a regression, adding them as an improvement', () => {
  const fixed = demo('C');
  const broken = demo('A');
  const r = compare(fixed, broken);
  assert.equal(r.ok, false);
  assert.ok(r.regressions.includes('home: new finding R1 tab-settings'));
  assert.ok(r.regressions.some((x) => /^home: score \d+ → \d+$/.test(x)));
  assert.match(r.markdown, /Accessibility gate: failed/);
  const back = compare(broken, fixed);
  assert.ok(back.ok);
  assert.ok(back.improvements.includes('home: fixed R1 tab-settings'));
});
