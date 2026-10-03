// A tiny navigable "app" for guide tests: screens of buttons, rendered into raw
// snapshots and finalized by the real C++ core.
import type { CoreApi } from '../../core/CoreApi';
import type { CompletionRequest, CompletionResult, LlmBackend } from '../../llm/LlmBackend';
import type { Clock, StepEvent } from '../../guide/GuideSession';
import type { Snapshot, UiNode } from '../../types';

export interface ButtonSpec {
  name: string; // '' for an unlabelled control
  to?: string; // screen it opens
  role?: string;
  testID?: string;
}

export type Screens = Record<string, ButtonSpec[]>;

function node(partial: Partial<UiNode> & Pick<UiNode, 'id' | 'component' | 'frame'>): UiNode {
  return {
    parent: 1,
    depth: 1,
    visible: true,
    opacity: 1,
    a11y: { accessible: false, hidden: false },
    actionable: false,
    name: '',
    ...partial,
  };
}

export function rawScreen(title: string, buttons: ButtonSpec[]): Snapshot {
  const nodes: UiNode[] = [
    node({ id: 1, parent: null, depth: 0, component: 'View', frame: { x: 0, y: 0, w: 360, h: 780 } }),
    node({ id: 2, component: 'Paragraph', frame: { x: 16, y: 16, w: 300, h: 32 }, text: title, fontSize: 24, testID: `title-${title}` }),
  ];
  buttons.forEach((b, i) => {
    const id = 10 + i * 2;
    nodes.push(
      node({
        id,
        component: 'View',
        frame: { x: 0, y: 64 + i * 56, w: 360, h: 56 },
        a11y: { accessible: true, hidden: false, role: b.role ?? 'button', label: b.name || undefined },
        testID: b.testID ?? `btn-${b.name || i}`,
      }),
    );
  });
  return { rev: '', surfaceId: 1, viewport: { x: 0, y: 0, w: 360, h: 780 }, nodes };
}

export class FakeApp {
  stack: string[];
  /** Bumped to force a new rev without navigation (e.g. a spinner). */
  tick = 0;

  constructor(
    private readonly core: CoreApi,
    private readonly screens: Screens,
    start: string,
  ) {
    this.stack = [start];
  }

  get screen(): string {
    return this.stack[this.stack.length - 1];
  }

  snapshot = (): Snapshot => {
    const buttons = [...this.screens[this.screen]];
    if (this.tick > 0) buttons.push({ name: `Tick ${this.tick}`, role: 'text' });
    return this.core.finalize(rawScreen(this.screen, buttons));
  };

  /** The evaluation autopilot: press what the guide highlighted. */
  press = (e: StepEvent): void => {
    if (e.action.a === 'back') {
      if (this.stack.length > 1) this.stack.pop();
      return;
    }
    const action = e.action;
    if (action.a !== 'tap') return;
    const target = e.snapshot.nodes.find((n) => n.id === action.id);
    const spec = this.screens[this.screen].find((b) => `btn-${b.name}` === target?.testID || b.testID === target?.testID);
    if (spec?.to) this.stack.push(spec.to);
  };
}

/** Replies from a list, in order; `(req) => string` entries can inspect the prompt. */
export class ScriptedBackend implements LlmBackend {
  calls: CompletionRequest[] = [];
  constructor(private readonly replies: Array<string | ((req: CompletionRequest) => string | Promise<string>)>) {}
  async info() {
    return { kind: 'scripted' as const, model: 'script' };
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push(req);
    const r = this.replies[Math.min(this.calls.length - 1, this.replies.length - 1)];
    const text = typeof r === 'function' ? await r(req) : r;
    return { text, promptTokens: 0, genTokens: 0, ms: 0 };
  }
}

/** Index of the candidate named `name` in a guide prompt. */
export function indexOf(prompt: string, name: string): number {
  const m = new RegExp(`^\\[(\\d+)\\] \\w+ "${name}"`, 'm').exec(prompt);
  if (!m) throw new Error(`"${name}" is not a candidate in:\n${prompt}`);
  return Number(m[1]);
}

export function tap(name: string) {
  return (req: CompletionRequest) => JSON.stringify({ a: 'tap', id: indexOf(req.prompt, name) });
}

/** Time advances only when the code under test sleeps. */
export class FakeClock implements Clock {
  t = 0;
  now = () => this.t;
  sleep = async (ms: number) => {
    this.t += ms;
  };
}
