// Remote backend: llama-server on the developer's laptop, reached from the device
// through `hdc rport tcp:8080 tcp:8080` (RFC-001 §10).
import {
  BackendError,
  type BackendInfo,
  type CompletionRequest,
  type CompletionResult,
  type LlmBackend,
} from './LlmBackend';

export interface RemoteBackendOptions {
  url: string; // e.g. http://127.0.0.1:8080
  model?: string; // informational; llama-server serves one model
  timeoutMs?: number; // RFC §13: slower than 8 s counts as unreachable
  seed?: number;
  /** Release builds reject non-loopback URLs unless the integrator opts in (RFC §13). */
  allowNonLoopback?: boolean;
  /** Defaults to __DEV__ when available. */
  isDev?: boolean;
  fetchImpl?: typeof fetch;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function hostOf(url: string): string {
  const m = /^[a-z]+:\/\/(\[[^\]]+\]|[^/:?#]+)/i.exec(url);
  return m ? m[1].toLowerCase() : '';
}

export function isLoopbackUrl(url: string): boolean {
  return LOOPBACK.has(hostOf(url));
}

function devDefault(): boolean {
  const g = globalThis as { __DEV__?: boolean };
  return g.__DEV__ === true;
}

/** Body of a llama-server OpenAI-compatible chat request with a GBNF grammar. */
export function buildChatBody(req: CompletionRequest, seed: number): Record<string, unknown> {
  return {
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
    grammar: req.grammar,
    max_tokens: req.maxTokens,
    temperature: 0,
    top_k: 1,
    seed,
    cache_prompt: true, // the static system prefix stays in the server's KV cache
    stream: false,
  };
}

export class RemoteBackend implements LlmBackend {
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly seed: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: RemoteBackendOptions) {
    this.url = opts.url.replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.seed = opts.seed ?? 0;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    const dev = opts.isDev ?? devDefault();
    if (!dev && !opts.allowNonLoopback && !isLoopbackUrl(this.url)) {
      throw new BackendError(
        `refusing non-loopback backend ${this.url} in a release build; set allowNonLoopback to opt in`,
        'refused',
      );
    }
  }

  async info(): Promise<BackendInfo> {
    return { kind: 'remote', model: this.opts.model ?? 'llama-server' };
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller?.abort();
        reject(new BackendError(`backend did not answer within ${this.timeoutMs} ms`, 'timeout'));
      }, this.timeoutMs);
    });
    try {
      const response = (await Promise.race([
        this.fetchImpl(`${this.url}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildChatBody(req, this.seed)),
          signal: controller?.signal,
        }),
        timeout,
      ])) as Response;
      if (!response.ok) {
        throw new BackendError(`backend answered HTTP ${response.status}`, 'bad-response');
      }
      const body = (await Promise.race([response.json(), timeout])) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new BackendError('backend reply has no message content', 'bad-response');
      return {
        text,
        promptTokens: body.usage?.prompt_tokens ?? 0,
        genTokens: body.usage?.completion_tokens ?? 0,
        ms: Date.now() - started,
      };
    } catch (e) {
      if (e instanceof BackendError) throw e;
      throw new BackendError(`backend unreachable: ${e instanceof Error ? e.message : String(e)}`, 'unreachable');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
