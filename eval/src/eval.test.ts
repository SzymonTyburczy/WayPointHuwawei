import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCliCore } from '../../packages/waypoint-sdk/src/node/cliCore';
import { LexicalBackend, score } from './baseline';
import { Simulator } from './simulator';
import { median, percentile, wilson } from './stats';

test('Wilson interval matches the RFC arithmetic check (24/30)', () => {
  const w = wilson(24, 30);
  assert.equal(w.centre.toFixed(3), '0.766');
  assert.equal(w.halfWidth.toFixed(3), '0.139');
  assert.equal(Math.round(w.low * 100), 63);
  assert.equal(Math.round(w.high * 100), 90);
  assert.equal(wilson(0, 0).p, 0);
  assert.ok(wilson(0, 30).high > 0.1);
});

test('percentiles', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
});

test('baseline score prefers overlapping names', () => {
  assert.ok(score('see my past tickets', 'Tickets') > score('see my past tickets', 'Profile'));
});

const core = createCliCore();

test('simulator renders tabs without names in A and with names in C', () => {
  const a = new Simulator(core, 'A').snapshot();
  const tabsA = a.nodes.filter((n) => n.a11y.role === 'tab');
  assert.equal(tabsA.length, 4);
  assert.ok(tabsA.every((t) => t.name === '' && t.actionable));
  const c = new Simulator(core, 'C').snapshot();
  assert.deepEqual(
    c.nodes.filter((n) => n.a11y.role === 'tab').map((t) => t.name),
    ['Home', 'Tickets', 'Profile', 'Settings'],
  );
});

test('simulator navigation: tab, row, back', () => {
  const sim = new Simulator(core, 'C');
  let snap = sim.snapshot();
  const settings = snap.nodes.find((n) => n.testID === 'tab-settings')!;
  assert.ok(sim.apply({ a: 'tap', id: settings.id, index: 0 }, snap));
  assert.equal(sim.screen, 'settings');
  snap = sim.snapshot();
  const display = snap.nodes.find((n) => n.testID === 'settings-display')!;
  sim.apply({ a: 'tap', id: display.id, index: 0 }, snap);
  assert.equal(sim.screen, 'display');
  assert.ok(sim.canGoBack());
  sim.apply({ a: 'back' }, sim.snapshot());
  assert.equal(sim.screen, 'settings');
  assert.ok(!sim.canGoBack());
});

test('a toggled switch changes rev', () => {
  const sim = new Simulator(core, 'A');
  sim.open('notifications');
  const before = sim.snapshot();
  const push = before.nodes.find((n) => n.testID === 'notif-push')!;
  sim.apply({ a: 'tap', id: push.id, index: 0 }, before);
  assert.notEqual(sim.snapshot().rev, before.rev);
});

test('lexical baseline asks when nothing overlaps', async () => {
  const r = await new LexicalBackend().complete({
    system: '',
    prompt: 'GOAL: make the text bigger\nSCREEN: Home\n[0] tab ""\n[1] tab ""\nHISTORY: none\n',
    grammar: 'root ::= tap',
    maxTokens: 8,
  });
  assert.equal(r.text, '{"a":"ask"}');
});
