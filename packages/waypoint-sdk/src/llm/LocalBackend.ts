// On-device backend: llama.cpp compiled into the RNOH package (RFC-001 §10).
import type { Spec as LlmSpec } from '../specs/NativeWaypointLlm';
import {
  BackendError,
  type BackendInfo,
  type CompletionRequest,
  type CompletionResult,
  type LlmBackend,
} from './LlmBackend';

export interface LocalBackendOptions {
  /** e.g. /data/storage/el2/base/files/model.gguf, pushed with `hdc file send`. */
  modelPath: string;
  sha256?: string;
  nCtx?: number;
  nThreads?: number;
}

export class LocalBackend implements LlmBackend {
  private loaded: Promise<boolean> | null = null;

  constructor(
    private readonly native: LlmSpec,
    private readonly opts: LocalBackendOptions,
  ) {}

  /** Loads the model once; resolves false when the file is missing or broken. */
  load(): Promise<boolean> {
    if (!this.loaded) {
      this.loaded = this.native
        .load(this.opts.modelPath, this.opts.nCtx ?? 2048, this.opts.nThreads ?? 4, this.opts.sha256 ?? '')
        .catch(() => false);
    }
    return this.loaded;
  }

  async info(): Promise<BackendInfo> {
    const name = this.opts.modelPath.split('/').pop() ?? this.opts.modelPath;
    return { kind: 'local', model: name };
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!(await this.load())) throw new BackendError(`model not loaded: ${this.opts.modelPath}`, 'not-loaded');
    let raw: string;
    try {
      raw = await this.native.complete(req.system, req.prompt, req.grammar, req.maxTokens);
    } catch (e) {
      throw new BackendError(`local inference failed: ${e instanceof Error ? e.message : String(e)}`, 'bad-response');
    }
    const r = JSON.parse(raw) as Partial<CompletionResult>;
    return { text: r.text ?? '', promptTokens: r.promptTokens ?? 0, genTokens: r.genTokens ?? 0, ms: r.ms ?? 0 };
  }

  unload(): void {
    this.native.unload();
    this.loaded = null;
  }
}

/**
 * RFC §13: "Model file missing or fails to load → use the remote backend if
 * configured, otherwise disable the guide." The fallback is chosen once, on the
 * first call, and kept.
 */
export class FallbackBackend implements LlmBackend {
  private chosen: Promise<LlmBackend | null> | null = null;

  constructor(
    private readonly primary: LocalBackend,
    private readonly secondary: LlmBackend | null,
  ) {}

  private choose(): Promise<LlmBackend | null> {
    if (!this.chosen) {
      this.chosen = this.primary.load().then((ok) => (ok ? this.primary : this.secondary));
    }
    return this.chosen;
  }

  async info(): Promise<BackendInfo> {
    const b = await this.choose();
    if (!b) throw new BackendError('no backend available', 'not-loaded');
    return b.info();
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const b = await this.choose();
    if (!b) throw new BackendError('no backend available', 'not-loaded');
    return b.complete(req);
  }
}
