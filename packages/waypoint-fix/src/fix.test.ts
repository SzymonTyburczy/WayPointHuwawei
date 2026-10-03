import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fixSource, lineDiff, readFixes } from './fix';

const fixes = { 'tab-settings': 'Settings', 'icon-help': 'Help', 'quote-me': 'Say "hi"' };

test('JSX: adds accessibilityLabel after a literal testID', () => {
  const src = `export const A = () => (\n  <Pressable testID="tab-settings" onPress={go}>\n    <Image source={gear} />\n  </Pressable>\n);\n`;
  const r = fixSource('A.tsx', src, fixes);
  assert.equal(r.edits.length, 1);
  assert.equal(r.edits[0].line, 2);
  assert.match(r.output, /<Pressable testID="tab-settings" accessibilityLabel="Settings" onPress=\{go\}>/);
});

test('JSX: expression-container testIDs and labels that need escaping', () => {
  const src = `<View testID={'quote-me'} />;`;
  const r = fixSource('B.jsx', src, fixes);
  assert.equal(r.output, `<View testID={'quote-me'} accessibilityLabel={"Say \\"hi\\""} />;`);
});

test('JSX: an existing label is respected and reported', () => {
  const src = `<Pressable accessibilityLabel="Gear" testID="tab-settings" />;`;
  const r = fixSource('C.tsx', src, fixes);
  assert.equal(r.edits.length, 0);
  assert.deepEqual(r.alreadyLabelled, ['tab-settings']);
  assert.equal(r.output, src);
});

test('object literals: spec style with the quote style preserved', () => {
  const src = `export const TABS = [\n  { testID: 'tab-settings', screen: 'settings', icon: 'ic_gear' },\n  { testID: "icon-help", icon: "ic_help" },\n  { testID: 'other' },\n];\n`;
  const r = fixSource('spec.ts', src, fixes);
  assert.equal(r.edits.length, 2);
  assert.match(r.output, /\{ testID: 'tab-settings', label: 'Settings', screen: 'settings', icon: 'ic_gear' \}/);
  assert.match(r.output, /\{ testID: "icon-help", label: "Help", icon: "ic_help" \}/);
  // Idempotent.
  assert.equal(fixSource('spec.ts', r.output, fixes).edits.length, 0);
});

test('object literals: custom property name, existing label kept', () => {
  const src = `const a = { testID: 'tab-settings', accessibilityLabel: 'Prefs' };\nconst b = { testID: 'icon-help' };\n`;
  const r = fixSource('x.ts', src, fixes, { objectProp: 'a11yLabel' });
  assert.equal(r.output, `const a = { testID: 'tab-settings', accessibilityLabel: 'Prefs' };\nconst b = { testID: 'icon-help', a11yLabel: 'Help' };\n`);
});

test('computed testIDs are not matched', () => {
  const src = 'const id = "tab-settings";\n<Pressable testID={id} />;\n';
  assert.equal(fixSource('D.tsx', src, fixes).edits.length, 0);
});

test('diff shows only changed lines', () => {
  const d = lineDiff('a.ts', 'x\ny\nz', 'x\nY\nz');
  assert.equal(d, '--- a/a.ts\n+++ b/a.ts\n@@ -2 +2 @@\n-y\n+Y\n');
  assert.equal(lineDiff('a.ts', 'same', 'same'), '');
});

test('reads every fixes format Waypoint produces', () => {
  assert.deepEqual(readFixes({ a: 'A', n: 1 }), { a: 'A' });
  assert.deepEqual(readFixes({ overrides: { a: 'A' } }), { a: 'A' });
  assert.deepEqual(readFixes({ fixes: { a: 'A' } }), { a: 'A' });
  assert.deepEqual(readFixes([{ testID: 'a', suggestion: { label: 'A' } }, { testID: 'b' }]), { a: 'A' });
  assert.throws(() => readFixes('nope'));
});
