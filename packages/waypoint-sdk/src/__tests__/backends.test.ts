import { BackendError } from '../llm/LlmBackend';
import { FallbackBackend, LocalBackend } from '../llm/LocalBackend';
import { LoggingBackend, MemoryLog } from '../llm/logging';
import { RemoteBackend, buildChatBody, hostOf, isLoopbackUrl } from '../llm/RemoteBackend';
import type { Spec as LlmSpec } from '../specs/NativeWaypointLlm';
import { ScriptedBackend } from './support/fakeApp';

const req = { system: 'S', prompt: 'P', grammar: 'root ::= "x"', maxTokens: 12 };

function okFetch(body: unknown, status = 200) {
  return jest.fn(async () => ({ ok: status < 400, status, json: async () => body }) as unknown as Response);
}

test('request body carries grammar, temperature 0, seed and prompt caching', () => {
  expect(buildChatBody(req, 7)).toEqual({
    messages: [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'P' },
    ],
    grammar: 'root ::= "x"',
    max_tokens: 12,
    temperature: 0,
    top_k: 1,
    seed: 7,
    cache_prompt: true,
    stream: false,
  });
});

test('remote backend posts to llama-server and reads the reply', async () => {
  const fetchImpl = okFetch({ choices: [{ message: { content: '{"a":"done"}' } }], usage: { prompt_tokens: 350, completion_tokens: 6 } });
  const b = new RemoteBackend({ url: 'http://127.0.0.1:8080/', fetchImpl, isDev: false });
  const r = await b.complete(req);
  expect(r.text).toBe('{"a":"done"}');
  expect(r.promptTokens).toBe(350);
  expect(r.genTokens).toBe(6);
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('http://127.0.0.1:8080/v1/chat/completions');
  expect(JSON.parse(String(init.body)).grammar).toBe('root ::= "x"');
});

test('remote backend maps failures to BackendError codes', async () => {
  const refused = new RemoteBackend({
    url: 'http://127.0.0.1:8080',
    isDev: true,
    fetchImpl: jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
  });
  await expect(refused.complete(req)).rejects.toMatchObject({ code: 'unreachable' });

  const http500 = new RemoteBackend({ url: 'http://127.0.0.1:8080', isDev: true, fetchImpl: okFetch({}, 500) });
  await expect(http500.complete(req)).rejects.toMatchObject({ code: 'bad-response' });

  const noContent = new RemoteBackend({ url: 'http://127.0.0.1:8080', isDev: true, fetchImpl: okFetch({ choices: [] }) });
  await expect(noContent.complete(req)).rejects.toMatchObject({ code: 'bad-response' });

  const hanging = new RemoteBackend({
    url: 'http://127.0.0.1:8080',
    isDev: true,
    timeoutMs: 20,
    fetchImpl: jest.fn(() => new Promise<Response>(() => {})),
  });
  await expect(hanging.complete(req)).rejects.toMatchObject({ code: 'timeout' });
});

test('release builds refuse non-loopback URLs unless opted in', () => {
  expect(() => new RemoteBackend({ url: 'http://192.168.1.20:8080', isDev: false })).toThrow(BackendError);
  expect(() => new RemoteBackend({ url: 'http://192.168.1.20:8080', isDev: false, allowNonLoopback: true })).not.toThrow();
  expect(() => new RemoteBackend({ url: 'http://192.168.1.20:8080', isDev: true })).not.toThrow();
  expect(isLoopbackUrl('http://localhost:8080')).toBe(true);
  expect(isLoopbackUrl('http://[::1]:8080/x')).toBe(true);
  expect(isLoopbackUrl('http://127.0.0.1.evil.com')).toBe(false);
  expect(hostOf('https://user@host')).toBe('user@host');
});

function fakeNative(loadResult: boolean | Error): LlmSpec & { completeCalls: number } {
  return {
    completeCalls: 0,
    load: jest.fn(async () => {
      if (loadResult instanceof Error) throw loadResult;
      return loadResult;
    }),
    async complete(this: { completeCalls: number }) {
      this.completeCalls++;
      return JSON.stringify({ text: '{"a":"ask"}', promptTokens: 10, genTokens: 4, ms: 99 });
    },
    info: () => '{}',
    unload: jest.fn(),
  } as unknown as LlmSpec & { completeCalls: number };
}

test('local backend loads once and returns native results', async () => {
  const native = fakeNative(true);
  const b = new LocalBackend(native, { modelPath: '/data/storage/el2/base/files/m.gguf', sha256: 'abc' });
  expect((await b.complete(req)).text).toBe('{"a":"ask"}');
  await b.complete(req);
  expect(native.load).toHaveBeenCalledTimes(1);
  expect(native.load).toHaveBeenCalledWith('/data/storage/el2/base/files/m.gguf', 2048, 4, 'abc');
  expect((await b.info()).model).toBe('m.gguf');
});

test('missing model falls back to the remote backend, or fails cleanly', async () => {
  const remote = new ScriptedBackend(['{"a":"done"}']);
  const withFallback = new FallbackBackend(new LocalBackend(fakeNative(false), { modelPath: 'x' }), remote);
  expect((await withFallback.complete(req)).text).toBe('{"a":"done"}');
  expect((await withFallback.info()).kind).toBe('scripted');

  const without = new FallbackBackend(new LocalBackend(fakeNative(new Error('dlopen')), { modelPath: 'x' }), null);
  await expect(without.complete(req)).rejects.toMatchObject({ code: 'not-loaded' });
});

test('logging writes one JSON line per call, including failures', async () => {
  const log = new MemoryLog();
  const ok = new LoggingBackend(new ScriptedBackend(['{"a":"done"}']), log.sink);
  ok.purpose = 'guide';
  await ok.complete(req);
  const failing = new LoggingBackend(
    new ScriptedBackend([
      () => {
        throw new Error('boom');
      },
    ]),
    log.sink,
  );
  await expect(failing.complete(req)).rejects.toThrow('boom');
  expect(log.lines).toHaveLength(2);
  const first = JSON.parse(log.lines[0]);
  expect(first).toMatchObject({ backend: 'scripted', model: 'script', purpose: 'guide', prompt: 'P', grammar: 'root ::= "x"', output: '{"a":"done"}' });
  expect(JSON.parse(log.lines[1]).error).toBe('boom');
});
