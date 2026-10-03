import { suggestLabels, parseLabelReply } from '../audit/suggest';
import { JsonCore, type CoreStrings } from '../core/CoreApi';
import { createCliCore } from '../node/cliCore';
import { WaypointRuntime } from '../runtime';
import type { Snapshot, UiNode } from '../types';
import { ScriptedBackend } from './support/fakeApp';

const core = createCliCore();

function n(p: Partial<UiNode> & Pick<UiNode, 'id' | 'component' | 'frame'>): UiNode {
  return { parent: 1, depth: 1, visible: true, opacity: 1, a11y: { accessible: false, hidden: false }, actionable: false, name: '', ...p };
}

// RFC §8 example: an unlabelled gear button on the Profile screen.
const profile: Snapshot = core.finalize({
  rev: '',
  surfaceId: 1,
  viewport: { x: 0, y: 0, w: 360, h: 780 },
  nodes: [
    n({ id: 1, parent: null, depth: 0, component: 'View', frame: { x: 0, y: 0, w: 360, h: 780 } }),
    n({ id: 2, component: 'Paragraph', frame: { x: 16, y: 16, w: 200, h: 32 }, text: 'Profile', fontSize: 24 }),
    n({ id: 3, component: 'View', frame: { x: 300, y: 10, w: 48, h: 48 }, a11y: { accessible: true, hidden: false, role: 'button' }, testID: 'header-right' }),
    n({ id: 4, parent: 3, depth: 2, component: 'Image', frame: { x: 312, y: 22, w: 24, h: 24 }, imageSrc: 'ic_gear' }),
    n({ id: 5, component: 'Paragraph', frame: { x: 16, y: 80, w: 300, h: 24 }, text: 'Anna Kowalska' }),
    n({ id: 6, component: 'View', frame: { x: 16, y: 120, w: 200, h: 48 }, a11y: { accessible: true, hidden: false, role: 'button', label: 'Edit profile' } }),
  ],
});

test('a validated model label becomes the suggestion', async () => {
  const report = core.audit(profile);
  expect(report.counts.R1).toBe(1);
  const backend = new ScriptedBackend(['{"label":"Settings"}']);
  const { report: out, stats } = await suggestLabels(core, backend, profile, report);
  const f = out.findings.find((x) => x.rule === 'R1')!;
  expect(f.suggestion).toEqual({ label: 'Settings', patch: 'accessibilityLabel="Settings"', confidence: 'model' });
  expect(stats).toMatchObject({ asked: 1, accepted: 1, fallbacks: 0 });
  expect(backend.calls[0].prompt).toBe(
    'screen: Profile\ncontrol: View role=button image=ic_gear testID=header-right\nbefore: "Profile"\nafter: "Anna Kowalska", "Edit profile"\n',
  );
});

test('a rejected model label falls back to the humanised file name', async () => {
  const report = core.audit(profile);
  for (const [reply, reason] of [
    ['{"label":"Button"}', 'generic'],
    ['{"label":"Edit profile"}', 'duplicate'],
    ['{"label":"Ic gear"}', 'file-name-echo'],
    ['not json', 'unparseable'],
  ]) {
    const { report: out, stats } = await suggestLabels(core, new ScriptedBackend([reply]), profile, report);
    expect(stats.rejected[reason]).toBe(1);
    expect(out.findings.find((x) => x.rule === 'R1')!.suggestion).toEqual({
      label: 'Gear',
      patch: 'accessibilityLabel="Gear"',
      confidence: 'low',
    });
  }
});

test('without a backend only the fallback is offered', async () => {
  const { report: out, stats } = await suggestLabels(core, null, profile, core.audit(profile));
  expect(out.findings.find((x) => x.rule === 'R1')!.suggestion?.confidence).toBe('low');
  expect(stats.asked).toBe(0);
});

test('backend failures stop further model calls but keep the audit', async () => {
  const backend = new ScriptedBackend([
    () => {
      throw new Error('down');
    },
  ]);
  const { stats } = await suggestLabels(core, backend, profile, core.audit(profile), { maxBackendFailures: 1 });
  expect(stats.backendFailures).toBe(1);
});

test('label replies are parsed strictly', () => {
  expect(parseLabelReply(' {"label":"Settings"} ')).toBe('Settings');
  expect(parseLabelReply('{"label":""}')).toBeNull();
  expect(parseLabelReply('Settings')).toBeNull();
});

test('runtime audit never throws when the walker fails', async () => {
  const broken: CoreStrings = {
    snapshot: () => {
      throw new Error('shadow tree unreachable');
    },
    finalize: (s) => s,
    audit: () => '{}',
    planStep: () => '{}',
    parseAction: () => '{}',
    labelRequest: () => '{}',
    validateLabel: () => '{}',
  };
  const rt = new WaypointRuntime(new JsonCore(broken), null, 1);
  const r = await rt.auditWithSnapshot();
  expect(r.snapshot.error).toBe('shadow tree unreachable');
  expect(r.report.findings).toEqual([]);
  expect(r.report.partial).toBe(true);
});

test('core errors surface as exceptions in typed calls and as {error} for actions', () => {
  expect(() => core.audit({ nodes: 'nope' } as unknown as Snapshot)).toThrow();
  expect(core.parseAction('{"a":"tap","id":3}', [])).toEqual({ error: 'id out of range' });
});
