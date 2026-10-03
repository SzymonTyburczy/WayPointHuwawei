// One interface, two backends (RFC-001 §10).

export interface CompletionRequest {
  system: string;
  prompt: string;
  grammar: string; // GBNF
  maxTokens: number;
}

export interface CompletionResult {
  text: string;
  promptTokens: number;
  genTokens: number;
  ms: number;
}

export interface BackendInfo {
  kind: 'remote' | 'local' | 'scripted' | 'baseline';
  model: string;
}

export interface LlmBackend {
  complete(req: CompletionRequest): Promise<CompletionResult>;
  info(): Promise<BackendInfo>;
}

export class BackendError extends Error {
  constructor(
    message: string,
    readonly code: 'unreachable' | 'timeout' | 'bad-response' | 'not-loaded' | 'refused',
  ) {
    super(message);
  }
}

/** Rejects with a BackendError('timeout') when `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new BackendError(`backend did not answer within ${ms} ms`, 'timeout'));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
