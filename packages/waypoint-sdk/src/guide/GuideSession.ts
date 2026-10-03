// The guide loop (RFC-001 §9) as a pure state machine. Every dependency is
// injected, so the same code runs in the app, in Jest with scripted backends and
// fake clocks, and in the host evaluation harness (docs/IMPLEMENTATION_PLAN.md, D4).
import { isActionError, type CoreApi } from '../core/CoreApi';
import { BackendError, withTimeout, type LlmBackend } from '../llm/LlmBackend';
import type { Action, HistoryEntry, Plan, Rect, Snapshot } from '../types';
import { captionFor } from './captions';

export type GuideStatus = 'idle' | 'planning' | 'showing' | 'done' | 'asking' | 'stopped';

export type StopReason =
  | 'done' // the model said done
  | 'ask' // the model asked, or retries ran out
  | 'step-limit'
  | 'loop' // the same (rev, action) pair occurred twice
  | 'timeout' // the screen did not change after the reminder
  | 'backend' // unreachable, slow or not loaded
  | 'no-candidates'
  | 'snapshot' // the walker failed
  | 'cancelled';

export interface GuideTarget {
  id: number;
  name: string;
  frame: Rect;
}

export interface GuideState {
  status: GuideStatus;
  goal: string;
  step: number; // steps shown so far
  caption: string;
  action?: Action;
  target?: GuideTarget;
  reminder: boolean; // the caption is being repeated after 20 s without change
  reason?: StopReason;
  message?: string;
  history: HistoryEntry[];
}

export interface StepEvent {
  step: number;
  action: Action;
  target?: GuideTarget;
  snapshot: Snapshot;
  plan: Plan;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface GuideOptions {
  maxSteps: number; // RFC §3: 8 steps per task
  pollMs: number; // RFC §6: poll rev every 300 ms while the guide is active
  reminderMs: number; // RFC §9: no change after 20 s → repeat the caption once
  backendTimeoutMs: number; // RFC §13: slower than 8 s → stop
  maxParseRetries: number; // RFC §13: retry up to twice, then ask
  maxDiscards: number; // replies discarded because the screen changed during inference
  maxTokens: number;
}

export const defaultGuideOptions: GuideOptions = {
  maxSteps: 8,
  pollMs: 300,
  reminderMs: 20_000,
  backendTimeoutMs: 8_000,
  maxParseRetries: 2,
  maxDiscards: 3,
  maxTokens: 24,
};

export interface GuideDeps {
  core: CoreApi;
  backend: LlmBackend | null;
  snapshot: () => Snapshot | Promise<Snapshot>;
  clock?: Clock;
  options?: Partial<GuideOptions>;
  /** Whether a system back action makes sense on this screen. Defaults to true. */
  canGoBack?: (snapshot: Snapshot, history: HistoryEntry[]) => boolean;
  onState?: (state: GuideState) => void;
  /** Called once per shown step; the evaluation autopilot presses the target here. */
  onStep?: (event: StepEvent) => void | Promise<void>;
}

type Decision = { kind: 'action'; action: Action } | { kind: 'replan' } | { kind: 'stop'; reason: StopReason; message: string };

export class GuideSession {
  private state: GuideState = { status: 'idle', goal: '', step: 0, caption: '', reminder: false, history: [] };
  private readonly opts: GuideOptions;
  private readonly clock: Clock;
  private cancelled = false;
  private runId = 0;

  constructor(private readonly deps: GuideDeps) {
    this.opts = { ...defaultGuideOptions, ...deps.options };
    this.clock = deps.clock ?? realClock;
  }

  getState(): GuideState {
    return this.state;
  }

  /** Runs the loop until done, ask, a limit or stop(). Resolves with the final state. */
  async start(goal: string): Promise<GuideState> {
    const run = ++this.runId;
    this.cancelled = false;
    this.set({ status: 'planning', goal, step: 0, caption: '', reminder: false, history: [], action: undefined, target: undefined, reason: undefined, message: undefined });
    try {
      return await this.loop(goal, run);
    } catch (e) {
      // Nothing in Waypoint may crash the host app (RFC §13).
      return this.finish('stopped', 'backend', e instanceof Error ? e.message : String(e));
    }
  }

  stop(): void {
    this.cancelled = true;
    this.runId++;
    if (this.state.status === 'planning' || this.state.status === 'showing') {
      this.finish('stopped', 'cancelled', 'Guide stopped');
    }
  }

  private set(patch: Partial<GuideState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.onState?.(this.state);
  }

  private finish(status: GuideStatus, reason: StopReason, message: string, action?: Action): GuideState {
    const caption = status === 'done' ? captionFor({ a: 'done' }) : message;
    this.set({ status, reason, message, caption, action, target: status === 'done' ? undefined : this.state.target, reminder: false });
    return this.state;
  }

  private alive(run: number): boolean {
    return !this.cancelled && run === this.runId;
  }

  private async loop(goal: string, run: number): Promise<GuideState> {
    const seen = new Set<string>();
    const history: HistoryEntry[] = [];
    let discards = 0;

    while (this.alive(run)) {
      const snap = await this.deps.snapshot();
      if (!this.alive(run)) break;
      if (snap.error) return this.finish('stopped', 'snapshot', `Cannot read the screen: ${snap.error}`);
      if (history.length >= this.opts.maxSteps) {
        return this.finish('stopped', 'step-limit', `Stopped after ${this.opts.maxSteps} steps`);
      }
      if (!this.deps.backend) return this.finish('stopped', 'backend', 'No model is available');

      const canGoBack = this.deps.canGoBack ? this.deps.canGoBack(snap, history) : true;
      const plan = this.deps.core.planStep(goal, snap, { steps: history, canGoBack });
      if (plan.stop) return this.finish('stopped', 'no-candidates', 'Nothing on this screen can be tapped');

      this.set({ status: 'planning', reminder: false });
      const decision = await this.decide(plan, snap);
      if (!this.alive(run)) break;
      if (decision.kind === 'stop') return this.finish('stopped', decision.reason, decision.message);
      if (decision.kind === 'replan') {
        if (++discards > this.opts.maxDiscards) {
          return this.finish('asking', 'ask', 'The screen keeps changing; try again when it is still');
        }
        continue;
      }
      discards = 0;
      const action = decision.action;

      const key = `${snap.rev}|${JSON.stringify(action)}`;
      if (seen.has(key)) return this.finish('stopped', 'loop', 'The guide is going in circles', action);
      seen.add(key);

      if (action.a === 'done') return this.finish('done', 'done', 'You are there', action);
      if (action.a === 'ask') return this.finish('asking', 'ask', captionFor(action), action);

      const target = action.a === 'tap' ? this.targetOf(snap, plan, action.index) : undefined;
      const entry: HistoryEntry =
        action.a === 'tap'
          ? { a: 'tap', name: target?.name ?? '' }
          : action.a === 'scroll'
            ? { a: 'scroll', dir: action.dir }
            : { a: 'back' };
      history.push(entry);
      this.set({
        status: 'showing',
        step: history.length,
        action,
        target,
        caption: captionFor(action, target?.name),
        history: [...history],
      });
      await this.deps.onStep?.({ step: history.length, action, target, snapshot: snap, plan });

      const changed = await this.waitForChange(snap.rev, run);
      if (!this.alive(run)) break;
      if (!changed) return this.finish('asking', 'timeout', 'The screen did not change. Do you need help?');
    }
    return this.state;
  }

  /** One model call with retries, plus the "screen changed during inference" check. */
  private async decide(plan: Plan, snap: Snapshot): Promise<Decision> {
    const backend = this.deps.backend!;
    for (let attempt = 0; attempt <= this.opts.maxParseRetries; attempt++) {
      let text: string;
      try {
        const reply = await withTimeout(
          backend.complete({ system: plan.system, prompt: plan.prompt, grammar: plan.grammar, maxTokens: this.opts.maxTokens }),
          this.opts.backendTimeoutMs,
        );
        text = reply.text;
      } catch (e) {
        const msg = e instanceof BackendError ? e.message : `backend failed: ${String(e)}`;
        return { kind: 'stop', reason: 'backend', message: msg };
      }
      const now = await this.deps.snapshot();
      if (!now.error && now.rev !== snap.rev) return { kind: 'replan' };
      const parsed = this.deps.core.parseAction(text, plan.candidates);
      if (!isActionError(parsed)) return { kind: 'action', action: parsed };
    }
    return { kind: 'action', action: { a: 'ask' } };
  }

  /** Polls until rev differs. Repeats the caption once after reminderMs; false after the second wait. */
  private async waitForChange(rev: string, run: number): Promise<boolean> {
    for (let round = 0; round < 2; round++) {
      const deadline = this.clock.now() + this.opts.reminderMs;
      while (this.clock.now() < deadline) {
        await this.clock.sleep(this.opts.pollMs);
        if (!this.alive(run)) return false;
        const snap = await this.deps.snapshot();
        if (!snap.error && snap.rev !== rev) return true;
      }
      if (round === 0) this.set({ reminder: true });
    }
    return false;
  }

  /** The candidate's sanitised name is used for the caption, never the raw screen text. */
  private targetOf(snap: Snapshot, plan: Plan, index: number): GuideTarget | undefined {
    const candidate = plan.candidates[index];
    const node = candidate && snap.nodes.find((n) => n.id === candidate.id);
    return node ? { id: node.id, name: candidate.name, frame: node.frame } : undefined;
  }
}
