// Wiring: backend construction and the runtime object behind WaypointProvider
// and the static Waypoint API (RFC-001 §11). Free of React so it can be tested
// and reused by the evaluation harness.
import { suggestLabels, type SuggestStats } from './audit/suggest';
import type { CoreApi } from './core/CoreApi';
import { GuideSession, type GuideDeps } from './guide/GuideSession';
import type { LlmBackend } from './llm/LlmBackend';
import { FallbackBackend, LocalBackend } from './llm/LocalBackend';
import { LoggingBackend, type LogSink } from './llm/logging';
import { RemoteBackend, type RemoteBackendOptions } from './llm/RemoteBackend';
import { OverrideStore } from './overrides';
import type { Spec as LlmSpec } from './specs/NativeWaypointLlm';
import type { AuditReport, Snapshot } from './types';

export type RemoteConfig = { kind: 'remote' } & RemoteBackendOptions;
export type LocalConfig = {
  kind: 'local';
  modelPath: string;
  sha256?: string;
  nCtx?: number;
  nThreads?: number;
  /** Used when the model is missing or fails to load (RFC §13). */
  fallback?: RemoteConfig;
};
export type BackendConfig = RemoteConfig | LocalConfig | { kind: 'none' } | { kind: 'custom'; backend: LlmBackend };

export function createBackend(config: BackendConfig, nativeLlm: LlmSpec | null, log?: LogSink): LlmBackend | null {
  let backend: LlmBackend | null;
  switch (config.kind) {
    case 'none':
      backend = null;
      break;
    case 'custom':
      backend = config.backend;
      break;
    case 'remote':
      backend = new RemoteBackend(config);
      break;
    case 'local': {
      const remote = config.fallback ? new RemoteBackend(config.fallback) : null;
      backend = nativeLlm ? new FallbackBackend(new LocalBackend(nativeLlm, config), remote) : remote;
      break;
    }
  }
  return backend && log ? new LoggingBackend(backend, log) : backend;
}

export interface AuditResult {
  report: AuditReport;
  snapshot: Snapshot;
  stats: SuggestStats;
}

export class WaypointRuntime {
  readonly overrides = new OverrideStore();

  constructor(
    readonly core: CoreApi,
    readonly backend: LlmBackend | null,
    public surfaceId: number,
  ) {}

  snapshot(): Snapshot {
    return this.core.snapshot(this.surfaceId);
  }

  /** Snapshot, rules and label suggestions in one call. Never throws. */
  async auditWithSnapshot(): Promise<AuditResult> {
    const snapshot = this.snapshot();
    const empty: SuggestStats = { asked: 0, accepted: 0, rejected: {}, fallbacks: 0, backendFailures: 0 };
    if (snapshot.error) {
      const report: AuditReport = {
        rev: snapshot.rev,
        findings: [],
        counts: { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, errors: 0, warnings: 0 },
        contrastUnknown: 0,
        partial: true,
        nodeCount: 0,
      };
      return { report, snapshot, stats: empty };
    }
    const report = this.core.audit(snapshot);
    if (this.backend instanceof LoggingBackend) this.backend.purpose = 'label';
    const { report: withSuggestions, stats } = await suggestLabels(this.core, this.backend, snapshot, report);
    return { report: withSuggestions, snapshot, stats };
  }

  async audit(): Promise<AuditReport> {
    return (await this.auditWithSnapshot()).report;
  }

  createGuide(extra: Omit<GuideDeps, 'core' | 'backend' | 'snapshot'> = {}): GuideSession {
    if (this.backend instanceof LoggingBackend) this.backend.purpose = 'guide';
    return new GuideSession({ core: this.core, backend: this.backend, snapshot: () => this.snapshot(), ...extra });
  }
}

let current: WaypointRuntime | null = null;

export function setCurrentRuntime(r: WaypointRuntime | null): void {
  current = r;
}

function requireRuntime(): WaypointRuntime {
  if (!current) throw new Error('Waypoint: no WaypointProvider is mounted');
  return current;
}

/** Static API: `const report = await Waypoint.audit()`. */
export const Waypoint = {
  audit: (): Promise<AuditReport> => requireRuntime().audit(),
  snapshot: (): Snapshot => requireRuntime().snapshot(),
  runtime: (): WaypointRuntime | null => current,
};
