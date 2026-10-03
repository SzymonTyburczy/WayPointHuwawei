// Label suggestions for R1/R6 findings (RFC-001 §8). The model proposes, the C++
// validator decides; without a model the humanised image name is offered with
// low confidence.
import type { CoreApi } from '../core/CoreApi';
import { withTimeout, type LlmBackend } from '../llm/LlmBackend';
import type { AuditReport, Finding, Snapshot, Suggestion } from '../types';

export interface SuggestOptions {
  timeoutMs?: number;
  maxTokens?: number;
  /** Stop asking the model after this many consecutive backend failures. */
  maxBackendFailures?: number;
}

export interface SuggestStats {
  asked: number;
  accepted: number; // model labels that passed validation
  rejected: Record<string, number>; // validator reason -> count
  fallbacks: number;
  backendFailures: number;
}

export function parseLabelReply(text: string): string | null {
  try {
    const v = JSON.parse(text.trim());
    if (v && typeof v.label === 'string' && v.label.trim()) return v.label.trim();
  } catch {
    // fall through
  }
  return null;
}

function needsLabel(f: Finding): boolean {
  return f.rule === 'R1' || f.rule === 'R6';
}

export async function suggestLabels(
  core: CoreApi,
  backend: LlmBackend | null,
  snapshot: Snapshot,
  report: AuditReport,
  opts: SuggestOptions = {},
): Promise<{ report: AuditReport; stats: SuggestStats }> {
  const stats: SuggestStats = { asked: 0, accepted: 0, rejected: {}, fallbacks: 0, backendFailures: 0 };
  const maxFailures = opts.maxBackendFailures ?? 2;
  const findings: Finding[] = [];

  for (const f of report.findings) {
    if (!needsLabel(f)) {
      findings.push(f);
      continue;
    }
    // A missing node or a core error just leaves the finding without a suggestion.
    let suggestion: Suggestion | undefined;
    try {
      const req = core.labelRequest(snapshot, f.nodeId);
      if (backend && stats.backendFailures < maxFailures) {
        stats.asked++;
        try {
          const reply = await withTimeout(
            backend.complete({ system: req.system, prompt: req.prompt, grammar: req.grammar, maxTokens: opts.maxTokens ?? 24 }),
            opts.timeoutMs ?? 8000,
          );
          stats.backendFailures = 0;
          const label = parseLabelReply(reply.text);
          if (label) {
            const v = core.validateLabel(snapshot, f.nodeId, label);
            if (v.ok) {
              suggestion = { label, patch: v.patch, confidence: 'model' };
              stats.accepted++;
            } else {
              const reason = v.reason ?? 'invalid';
              stats.rejected[reason] = (stats.rejected[reason] ?? 0) + 1;
            }
          } else {
            stats.rejected['unparseable'] = (stats.rejected['unparseable'] ?? 0) + 1;
          }
        } catch {
          stats.backendFailures++;
        }
      }
      if (!suggestion && req.fallback) {
        const v = core.validateLabel(snapshot, f.nodeId, req.fallback);
        suggestion = { label: req.fallback, patch: v.patch, confidence: 'low' };
        stats.fallbacks++;
      }
    } catch {
      suggestion = undefined;
    }
    findings.push(suggestion ? { ...f, suggestion } : f);
  }
  return { report: { ...report, findings }, stats };
}
