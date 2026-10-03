import { GuideSession, type GuideState } from '../guide/GuideSession';
import { createCliCore } from '../node/cliCore';
import { guessLang, normalise, parseUtterance } from '../voice/intents';
import { describePosition, positionOf } from '../voice/messages';
import { VoiceController } from '../voice/VoiceController';
import { FakeApp, FakeClock, ScriptedBackend, tap, type Screens } from './support/fakeApp';

const core = createCliCore();
const viewport = { x: 0, y: 0, w: 360, h: 780 };

describe('intents', () => {
  test.each([
    ['stop', 'stop'],
    ['Stop, please.', 'stop'],
    ['przestań', 'stop'],
    ['Zatrzymaj', 'stop'],
    ['powtórz', 'repeat'],
    ['say that again', 'repeat'],
    ['wróć', 'back'],
    ['go back', 'back'],
    ['dalej', 'next'],
    ['ok done', 'next'],
    ['gdzie jestem?', 'whereAmI'],
    ['Where am I', 'whereAmI'],
    ['co tu jest', 'describe'],
    ["what's here?", 'describe'],
    ['sprawdź dostępność', 'audit'],
    ['pomoc', 'help'],
    ['przeczytaj wszystko', 'readAll'],
    ['read everything', 'readAll'],
    ['', 'empty'],
    ['   ', 'empty'],
  ])('%s → %s', (text, kind) => {
    expect(parseUtterance(text).kind).toBe(kind);
  });

  test('anything else is a goal, with wrapper phrases removed', () => {
    expect(parseUtterance('Help me make the text bigger')).toEqual({ kind: 'goal', goal: 'make the text bigger' });
    expect(parseUtterance('Chcę kupić bilet.')).toEqual({ kind: 'goal', goal: 'kupić bilet' });
    expect(parseUtterance('pomóż mi zmienić język')).toEqual({ kind: 'goal', goal: 'zmienić język' });
    expect(parseUtterance('Turn off notifications')).toEqual({ kind: 'goal', goal: 'Turn off notifications' });
    // A command word inside a longer goal does not trigger the command.
    expect(parseUtterance('stop the notifications')).toEqual({ kind: 'goal', goal: 'stop the notifications' });
  });

  test('normalisation and language guess', () => {
    expect(normalise('  Zażółć gęślą JAŹŃ!! ')).toBe('zazolc gesla jazn');
    expect(guessLang('powiększ tekst')).toBe('pl');
    expect(guessLang('jak kupic bilet')).toBe('pl');
    expect(guessLang('make the text bigger')).toBe('en');
    expect(guessLang('co tu jest?')).toBe('pl');
    expect(guessLang('what is here')).toBe('en');
  });
});

describe('positions', () => {
  test('3 × 3 grid', () => {
    expect(positionOf({ x: 0, y: 716, w: 90, h: 64 }, viewport)).toBe('bottom-left');
    expect(positionOf({ x: 270, y: 716, w: 90, h: 64 }, viewport)).toBe('bottom-right');
    expect(positionOf({ x: 0, y: 360, w: 360, h: 56 }, viewport)).toBe('middle');
    expect(positionOf({ x: 308, y: 4, w: 48, h: 48 }, viewport)).toBe('top-right');
    expect(describePosition({ x: 0, y: 716, w: 90, h: 64 }, viewport, 'pl')).toBe('na dole po lewej');
  });
});

const screens: Screens = {
  Home: [
    { name: 'News', to: 'News' },
    { name: '', to: 'Settings', role: 'tab', testID: 'tab-settings' },
    { name: 'Settings', to: 'Settings', role: 'tab' },
  ],
  Settings: [{ name: 'Display', to: 'Display' }],
  Display: [{ name: 'Font size' }],
  News: [],
};

function setup(replies: ConstructorParameters<typeof ScriptedBackend>[0], lang: 'en' | 'pl' | 'auto' = 'en') {
  const app = new FakeApp(core, screens, 'Home');
  const spoken: string[] = [];
  let state: GuideState = { status: 'idle', goal: '', step: 0, caption: '', reminder: false, history: [] };
  let voice: VoiceController;
  const session = new GuideSession({
    core,
    backend: new ScriptedBackend(replies),
    snapshot: app.snapshot,
    clock: new FakeClock(),
    onStep: app.press,
    onState: (s) => {
      state = s;
      voice.onGuideState(s);
    },
  });
  let running: Promise<GuideState> = Promise.resolve(state);
  voice = new VoiceController({
    core,
    lang,
    takeSnapshot: async () => app.snapshot(),
    startGuide: (goal) => (running = session.start(goal)),
    stopGuide: () => session.stop(),
    getGuide: () => state,
    audit: async () => core.audit(app.snapshot()),
    speak: (t) => {
      spoken.push(t);
    },
    viewport: () => viewport,
  });
  return { app, voice, spoken, finished: () => running };
}

describe('voice controller', () => {
  test('a spoken goal runs the guide and every step is spoken with its position', async () => {
    const { voice, spoken, finished, app } = setup([tap('Settings'), tap('Display'), '{"a":"done"}']);
    const turn = await voice.handle('help me open the display settings');
    expect(turn.intent).toEqual({ kind: 'goal', goal: 'open the display settings' });
    expect(turn.reply).toBe('Okay: open the display settings.');
    await finished();
    expect(app.screen).toBe('Display');
    expect(spoken).toEqual([
      'Okay: open the display settings.',
      'Tap "Settings", at the top.',
      'Tap "Display", at the top.',
      'You are there.',
    ]);
  });

  test('repeat says the last prompt again; help and empty answers', async () => {
    const { voice, spoken } = setup([]);
    expect((await voice.handle('repeat')).reply).toBe('There is nothing to repeat yet.');
    await voice.handle('help');
    await voice.handle('repeat');
    expect(spoken[spoken.length - 1]).toBe(spoken[spoken.length - 2]);
    expect((await voice.handle('')).reply).toContain("didn't catch");
  });

  test('what is here reads names and counts unnamed controls, in Polish', async () => {
    const { voice } = setup([], 'pl');
    const turn = await voice.handle('co tu jest');
    expect(turn.reply).toBe('Ekran Home. 3 elementy do dotknięcia: News i Settings. 1 element nie ma nazwy.');
    expect((await voice.handle('gdzie jestem')).reply).toBe('Jesteś na ekranie Home.');
  });

  test('read everything speaks the screen-reader transcript', async () => {
    const { voice } = setup([]);
    const reply = (await voice.handle('read everything')).reply;
    expect(reply).toBe('Home. News, button. Tab. Settings, tab.'); // the unnamed tab is just "Tab"
  });

  test('audit reports the score', async () => {
    const { voice } = setup([]);
    const reply = (await voice.handle('check accessibility')).reply;
    expect(reply).toMatch(/^Accessibility score \d+ out of 100\. 1 errors, 0 warnings\.$/);
  });

  test('stop by voice cancels a running guide', async () => {
    const { voice, finished } = setup([tap('News')]);
    await voice.handle('go to the news');
    const stop = await voice.handle('stop');
    expect(stop.reply).toBe('Guide stopped.');
    expect((await finished()).reason).toBe('cancelled');
  });

  test('auto language follows the speaker', async () => {
    const { voice } = setup([], 'auto');
    await voice.handle('gdzie jestem');
    expect(voice.language).toBe('pl');
    await voice.handle('where am I');
    expect(voice.language).toBe('en');
  });

  test('a failing speech engine never breaks the flow', async () => {
    const { voice } = setup([]);
    (voice as unknown as { deps: { speak: () => never } }).deps.speak = () => {
      throw new Error('no TTS');
    };
    await expect(voice.handle('help')).resolves.toBeDefined();
  });
});
