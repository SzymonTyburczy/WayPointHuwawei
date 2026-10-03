// One JSON line per model call (RFC-001 §10 "Logging"). Off by default (§13);
// the evaluation and AI_WORKFLOW.md are built from these lines.
import type { BackendInfo, CompletionRequest, CompletionResult, LlmBackend } from './LlmBackend';

export interface CallLogEntry {
  ts: string;
  backend: BackendInfo['kind'];
  model: string;
  purpose?: string;
  system: string;
  prompt: string;
  grammar: string;
  output?: string;
  error?: string;
  promptTokens?: number;
  genTokens?: number;
  ms: number;
}

export type LogSink = (line: string, entry: CallLogEntry) => void;

export class LoggingBackend implements LlmBackend {
  purpose: string | undefined;

  constructor(
    private readonly inner: LlmBackend,
    private readonly sink: LogSink,
  ) {}

  info() {
    return this.inner.info();
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const info = await this.inner.info().catch(() => ({ kind: 'remote' as const, model: 'unknown' }));
    const started = Date.now();
    const base = {
      ts: new Date(started).toISOString(),
      backend: info.kind,
      model: info.model,
      purpose: this.purpose,
      system: req.system,
      prompt: req.prompt,
      grammar: req.grammar,
    };
    try {
      const r = await this.inner.complete(req);
      const entry: CallLogEntry = { ...base, output: r.text, promptTokens: r.promptTokens, genTokens: r.genTokens, ms: r.ms };
      this.sink(JSON.stringify(entry), entry);
      return r;
    } catch (e) {
      const entry: CallLogEntry = { ...base, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
      this.sink(JSON.stringify(entry), entry);
      throw e;
    }
  }
}

/** Keeps the last `limit` lines in memory, e.g. for an in-app "export log" button. */
export class MemoryLog {
  readonly lines: string[] = [];
  constructor(private readonly limit = 500) {}
  sink: LogSink = (line) => {
    this.lines.push(line);
    if (this.lines.length > this.limit) this.lines.shift();
  };
}
