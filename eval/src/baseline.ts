// LexicalBackend: a deterministic, non-LLM baseline that reads the same prompt a
// model would and taps the candidate whose name best overlaps the goal (the
// RFC §9 score). It answers `ask` when nothing overlaps.
//
// It exists so the harness runs in CI without a model. Its numbers are a floor,
// not a result about Waypoint's model; results.md always names the backend.
import type { BackendInfo, CompletionRequest, CompletionResult, LlmBackend } from '../../packages/waypoint-sdk/src/llm/LlmBackend';

// Crude stemming so "ticket" and "tickets" match; the baseline should not lose on
// word forms alone.
function stem(w: string): string {
  return w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
}

function words(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem));
}

function trigrams(s: string): Set<string> {
  const norm = ` ${[...words(s)].join(' ')} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= norm.length; i++) out.add(norm.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function score(goal: string, name: string): number {
  return 0.6 * jaccard(words(goal), words(name)) + 0.4 * jaccard(trigrams(goal), trigrams(name));
}

export class LexicalBackend implements LlmBackend {
  constructor(private readonly threshold = 0.12) {}

  async info(): Promise<BackendInfo> {
    return { kind: 'baseline', model: 'lexical-overlap' };
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const text = req.grammar.includes('"label') ? this.label(req.prompt) : this.act(req.prompt);
    return { text, promptTokens: 0, genTokens: 0, ms: 0 };
  }

  private act(prompt: string): string {
    const goal = /^GOAL: (.*)$/m.exec(prompt)?.[1] ?? '';
    const tapped = new Set([...prompt.matchAll(/tap "([^"]*)"/g)].map((m) => m[1]));
    let best = -1;
    let bestScore = this.threshold;
    for (const m of prompt.matchAll(/^\[(\d+)\] \S+ "([^"]*)"/gm)) {
      const name = m[2];
      if (tapped.has(name)) continue; // do not repeat a step from HISTORY
      const s = score(goal, name);
      if (s > bestScore) {
        bestScore = s;
        best = Number(m[1]);
      }
    }
    return best >= 0 ? JSON.stringify({ a: 'tap', id: best }) : JSON.stringify({ a: 'ask' });
  }

  /** The baseline has no vocabulary to invent labels; it declines. */
  private label(_prompt: string): string {
    return '{"label":"Button"}'; // generic, always rejected by the validator
  }
}
