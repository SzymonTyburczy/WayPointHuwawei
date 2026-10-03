import { GuideSession, type GuideState } from '../guide/GuideSession';
import { BackendError, type CompletionRequest } from '../llm/LlmBackend';
import { createCliCore } from '../node/cliCore';
import { FakeApp, FakeClock, ScriptedBackend, tap, type Screens } from './support/fakeApp';

const core = createCliCore();

const screens: Screens = {
  Home: [
    { name: 'News', to: 'News' },
    { name: 'Settings', to: 'Settings', role: 'tab' },
  ],
  Settings: [
    { name: 'Wi-Fi', to: 'WiFi' },
    { name: 'Display', to: 'Display' },
  ],
  Display: [{ name: 'Font size', to: 'FontSize' }],
  FontSize: [{ name: 'Larger' }],
  News: [{ name: 'Top stories' }],
  WiFi: [{ name: 'Network' }],
};

function session(app: FakeApp, backend: ScriptedBackend | null, extra: Partial<ConstructorParameters<typeof GuideSession>[0]> = {}) {
  const states: GuideState[] = [];
  const s = new GuideSession({
    core,
    backend,
    snapshot: app.snapshot,
    clock: new FakeClock(),
    onStep: app.press,
    onState: (st) => states.push(st),
    ...extra,
  });
  return { s, states };
}

test('happy path: three highlighted steps, then done', async () => {
  const app = new FakeApp(core, screens, 'Home');
  const backend = new ScriptedBackend([tap('Settings'), tap('Display'), tap('Font size'), '{"a":"done"}']);
  const { s, states } = session(app, backend);
  const final = await s.start('make the text bigger');
  expect(final.status).toBe('done');
  expect(final.reason).toBe('done');
  expect(final.caption).toBe('You are there');
  expect(app.screen).toBe('FontSize');
  expect(final.history).toEqual([
    { a: 'tap', name: 'Settings' },
    { a: 'tap', name: 'Display' },
    { a: 'tap', name: 'Font size' },
  ]);
  const captions = states.filter((x) => x.status === 'showing').map((x) => x.caption);
  expect(captions).toEqual(['Tap "Settings"', 'Tap "Display"', 'Tap "Font size"']);
  // The static system prompt is byte-identical across steps (KV-cache prefix).
  expect(new Set(backend.calls.map((c) => c.system)).size).toBe(1);
  // History reaches the model.
  expect(backend.calls[2].prompt).toContain('HISTORY: 1. tap "Settings"; 2. tap "Display"');
});

test('the highlight target carries the frame of the chosen element', async () => {
  const app = new FakeApp(core, screens, 'Home');
  const { s, states } = session(app, new ScriptedBackend([tap('Settings'), '{"a":"done"}']));
  await s.start('settings');
  const shown = states.find((x) => x.status === 'showing')!;
  expect(shown.target?.name).toBe('Settings');
  expect(shown.target?.frame).toEqual({ x: 0, y: 120, w: 360, h: 56 });
});

test('step limit stops after 8 steps', async () => {
  const app = new FakeApp(core, screens, 'Home');
  const backend = new ScriptedBackend([tap('News')]);
  const { s } = session(app, backend, {
    onStep: () => {
      app.tick++; // every step changes the screen, so loop detection never fires
    },
  });
  const final = await s.start('anything');
  expect(final.status).toBe('stopped');
  expect(final.reason).toBe('step-limit');
  expect(final.step).toBe(8);
});

test('loop detection: the same (rev, action) twice stops the guide', async () => {
  const loopScreens: Screens = { A: [{ name: 'Go to B', to: 'B' }], B: [{ name: 'Back to A', to: 'A' }] };
  const app = new FakeApp(core, loopScreens, 'A');
  const backend = new ScriptedBackend([tap('Go to B'), tap('Back to A'), tap('Go to B')]);
  const { s } = session(app, backend);
  const final = await s.start('somewhere else');
  expect(final.reason).toBe('loop');
  expect(final.step).toBe(2);
});

test('no change after the reminder ends with ask', async () => {
  const app = new FakeApp(core, screens, 'Home');
  const { s, states } = session(app, new ScriptedBackend([tap('Settings')]), { onStep: () => {} });
  const final = await s.start('settings');
  expect(final.status).toBe('asking');
  expect(final.reason).toBe('timeout');
  expect(states.some((x) => x.reminder && x.status === 'showing')).toBe(true);
});

test('replies that violate the grammar are retried twice, then ask', async () => {
  const app = new FakeApp(core, screens, 'Home');
  const backend = new ScriptedBackend(['tap settings', '{"a":"tap","id":99}', '{"a":"type"}']);
  const { s } = session(app, backend);
  const final = await s.start('settings');
  expect(backend.calls.length).toBe(3);
  expect(final.status).toBe('asking');
  expect(final.reason).toBe('ask');
});

test('one bad reply followed by a valid one proceeds', async () => {
  const app = new FakeApp(core, screens, 'Home');
  const backend = new ScriptedBackend(['garbage', tap('Settings'), '{"a":"done"}']);
  const { s } = session(app, backend);
  const final = await s.start('settings');
  expect(final.status).toBe('done');
  expect(app.screen).toBe('Settings');
});

test('a reply is discarded when the screen changed during inference', async () => {
  const app = new FakeApp(core, screens, 'Home');
  const backend = new ScriptedBackend([
    (req: CompletionRequest) => {
      app.stack.push('Settings'); // the user navigated while the model was thinking
      return tap('News')(req);
    },
    tap('Display'),
    '{"a":"done"}',
  ]);
  const { s } = session(app, backend);
  const final = await s.start('display');
  expect(final.history).toEqual([{ a: 'tap', name: 'Display' }]);
  expect(final.status).toBe('done');
});

test('backend unreachable stops with a message', async () => {
  const app = new FakeApp(core, screens, 'Home');
  const backend = new ScriptedBackend([
    () => {
      throw new BackendError('backend unreachable: ECONNREFUSED', 'unreachable');
    },
  ]);
  const { s } = session(app, backend);
  const final = await s.start('settings');
  expect(final.status).toBe('stopped');
  expect(final.reason).toBe('backend');
  expect(final.message).toContain('ECONNREFUSED');
});

test('slow backend times out', async () => {
  const app = new FakeApp(core, screens, 'Home');
  const backend = new ScriptedBackend([() => new Promise<string>(() => {})]);
  const { s } = session(app, backend, { options: { backendTimeoutMs: 20 } });
  const final = await s.start('settings');
  expect(final.reason).toBe('backend');
  expect(final.message).toContain('within 20 ms');
});

test('no model at all disables the guide', async () => {
  const app = new FakeApp(core, screens, 'Home');
  const { s } = session(app, null);
  expect((await s.start('settings')).reason).toBe('backend');
});

test('a screen with nothing to tap and no way back stops', async () => {
  const app = new FakeApp(core, { Empty: [] }, 'Empty');
  const { s } = session(app, new ScriptedBackend(['{"a":"done"}']), { canGoBack: () => false });
  const final = await s.start('anything');
  expect(final.reason).toBe('no-candidates');
});

test('a walker error stops the guide instead of crashing', async () => {
  const { s } = session(new FakeApp(core, screens, 'Home'), new ScriptedBackend(['{"a":"done"}']), {
    snapshot: () => ({ rev: '', surfaceId: 1, viewport: { x: 0, y: 0, w: 0, h: 0 }, nodes: [], error: 'shadow tree unreachable' }),
  });
  const final = await s.start('anything');
  expect(final.reason).toBe('snapshot');
});

test('back is offered and followed', async () => {
  const app = new FakeApp(core, screens, 'Home');
  app.stack.push('News');
  const backend = new ScriptedBackend([
    (req) => {
      expect(req.prompt).toContain('ALSO: back');
      return '{"a":"back"}';
    },
    tap('Settings'),
    '{"a":"done"}',
  ]);
  const { s } = session(app, backend);
  const final = await s.start('settings');
  expect(final.status).toBe('done');
  expect(final.history[0]).toEqual({ a: 'back' });
  expect(app.screen).toBe('Settings');
});

test('stop() cancels a running guide', async () => {
  const app = new FakeApp(core, screens, 'Home');
  const { s } = session(app, new ScriptedBackend([tap('Settings')]), {
    onStep: () => {
      setTimeout(() => s.stop(), 0);
    },
    clock: { now: () => 0, sleep: () => new Promise((r) => setTimeout(r, 5)) },
  });
  const final = await s.start('settings');
  expect(final.reason).toBe('cancelled');
});
