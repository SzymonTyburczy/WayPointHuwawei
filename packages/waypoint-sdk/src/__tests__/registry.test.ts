import { JsonCore, type CoreStrings } from '../core/CoreApi';
import { createCliCore, CliCoreStrings } from '../node/cliCore';
import { TargetRegistry, type Measurable } from '../registry/TargetRegistry';
import { WaypointRuntime } from '../runtime';

const core = createCliCore();
const viewport = { x: 0, y: 0, w: 360, h: 780 };

function at(x: number, y: number, w: number, h: number): { current: Measurable } {
  return { current: { measureInWindow: (cb) => cb(x, y, w, h) } };
}

test('registry records become a finalized snapshot in reading order', async () => {
  const reg = new TargetRegistry();
  reg.register(at(0, 716, 90, 64), { testID: 'tab-home', role: 'tab', pressable: true });
  reg.register(at(0, 120, 360, 56), { testID: 'row-display', role: 'button', text: 'Display', pressable: true });
  reg.register(at(16, 16, 200, 32), { component: 'Paragraph', text: 'Settings', fontSize: 22 });
  reg.register(at(400, 0, 10, 10), { testID: 'offscreen', role: 'button', label: 'Hidden away' });
  const snap = core.finalize(await reg.rawSnapshot(1, viewport));
  expect(snap.nodes.map((n) => n.testID ?? n.text ?? n.id)).toEqual([1, 'offscreen', 'Settings', 'row-display', 'tab-home']); // sorted by y, then x
  const row = snap.nodes.find((n) => n.testID === 'row-display')!;
  expect(row.name).toBe('Display');
  expect(row.actionable).toBe(true);
  expect(snap.nodes.find((n) => n.testID === 'offscreen')!.visible).toBe(false);
  expect(snap.rev).toHaveLength(16);
  const report = core.audit(snap);
  expect(report.counts.R1).toBe(1); // the unnamed tab
});

test('unmeasurable refs are skipped and unregistering works', async () => {
  const reg = new TargetRegistry();
  const off = reg.register({ current: null }, { label: 'gone' });
  reg.register({ current: { measureInWindow: () => {} } }, { label: 'never answers' });
  const snap = await reg.rawSnapshot(1, viewport, 10);
  expect(snap.nodes).toHaveLength(1);
  off();
  expect(reg.size).toBe(1);
});

test('auto source falls back to the registry when the walker fails', async () => {
  const strings = new CliCoreStrings();
  const failingWalker: CoreStrings = {
    ...Object.fromEntries(
      (['finalize', 'audit', 'planStep', 'parseAction', 'labelRequest', 'validateLabel'] as const).map((k) => [k, strings[k].bind(strings)]),
    ),
    snapshot: () => JSON.stringify({ rev: '', surfaceId: 1, viewport, nodes: [], error: 'shadow tree unreachable' }),
  } as unknown as CoreStrings;
  const rt = new WaypointRuntime(new JsonCore(failingWalker), null, 1, 'auto');
  rt.viewport = viewport;
  expect((await rt.takeSnapshot()).error).toBe('shadow tree unreachable'); // nothing registered yet
  rt.registry.register(at(0, 100, 360, 56), { testID: 'row', role: 'button', text: 'Display', pressable: true });
  const snap = await rt.takeSnapshot();
  expect(snap.error).toBeUndefined();
  expect(snap.nodes.some((n) => n.testID === 'row' && n.actionable)).toBe(true);
  const { report } = await rt.auditWithSnapshot();
  expect(report.findings).toEqual([]);
});
