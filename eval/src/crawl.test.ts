import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCliCore } from '../../packages/waypoint-sdk/src/node/cliCore';
import { crawl } from './crawl';

const core = createCliCore();

test('crawl finds every screen and how it is reached', () => {
  const map = crawl(core, 'C');
  assert.equal(map.screens.length, 19);
  const settings = map.screens.find((s) => s.id === 'settings')!;
  assert.equal(settings.depth, 1);
  assert.ok(map.edges.some((e) => e.from === 'home' && e.to === 'settings' && e.testID === 'tab-settings' && e.name === 'Settings'));
  assert.ok(map.edges.some((e) => e.from === 'display' && e.to === 'font-size'));
  assert.ok(map.screens.every((s) => s.byName), 'with hand-written labels every screen is reachable by name');
});

test('without labels most of the app is out of reach for an assistant', () => {
  const map = crawl(core, 'A');
  assert.equal(map.screens.length, 19); // a sighted user still reaches everything
  const reachable = map.screens.filter((s) => s.byName).map((s) => s.id).sort();
  assert.deepEqual(reachable, ['alerts', 'home', 'journey']);
  assert.ok(map.edges.some((e) => e.testID === 'tab-settings' && e.name === ''));
});
