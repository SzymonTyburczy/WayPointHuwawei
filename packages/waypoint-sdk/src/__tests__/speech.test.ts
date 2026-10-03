import type { Spec } from '../specs/NativeWaypointPlatform';
import { PlatformSpeechInput, type EventSource, type SpeechEvent } from '../voice/SpeechInput';

function fakes(startResult: boolean | Error = true) {
  const listeners: Array<(e: SpeechEvent) => void> = [];
  const events: EventSource = {
    addListener: (_name, l) => {
      listeners.push(l);
      return { remove: () => listeners.splice(listeners.indexOf(l), 1) };
    },
  };
  const native = {
    startListening: jest.fn(async () => {
      if (startResult instanceof Error) throw startResult;
      return startResult;
    }),
    stopListening: jest.fn(async () => {}),
  } as unknown as Spec;
  const emit = (e: SpeechEvent) => [...listeners].forEach((l) => l(e));
  return { events, native, emit, listeners };
}

test('partial results stream, the final one resolves', async () => {
  const { events, native, emit, listeners } = fakes();
  const input = new PlatformSpeechInput(native, events);
  const partials: string[] = [];
  const p = input.listen('pl-PL', (t) => partials.push(t));
  emit({ type: 'partial', text: 'powiększ' });
  emit({ type: 'final', text: 'powiększ tekst' });
  await expect(p).resolves.toEqual({ text: 'powiększ tekst' });
  expect(partials).toEqual(['powiększ']);
  expect(native.startListening).toHaveBeenCalledWith('pl-PL');
  expect(native.stopListening).toHaveBeenCalled();
  expect(listeners).toHaveLength(0);
});

test('denied permission resolves with an error instead of hanging', async () => {
  const { events, native } = fakes(false);
  await expect(new PlatformSpeechInput(native, events).listen('en-US')).resolves.toMatchObject({ text: '', error: expect.stringContaining('permission') });
});

test('engine errors and end-of-speech keep the last partial transcript', async () => {
  const { events, native, emit } = fakes();
  const input = new PlatformSpeechInput(native, events);
  const p = input.listen('en-US');
  emit({ type: 'partial', text: 'make the text' });
  emit({ type: 'error', message: 'network' });
  await expect(p).resolves.toEqual({ text: 'make the text', error: 'network' });
  const q = input.listen('en-US');
  emit({ type: 'end' });
  await expect(q).resolves.toEqual({ text: '' });
});

test('timeout and cancel', async () => {
  const { events, native } = fakes();
  const input = new PlatformSpeechInput(native, events, 20);
  await expect(input.listen('en-US')).resolves.toEqual({ text: '' });
  const p = input.listen('en-US');
  input.cancel();
  await expect(p).resolves.toEqual({ text: '' });
});
