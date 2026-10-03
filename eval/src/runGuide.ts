// M1 (guide success rate) and M4 (step latency) over conditions A, B and C
// (RFC-001 §12). A trial succeeds when the task's target testID is visible within
// the step limit; the model's own "done" claim is ignored.
import type { CoreApi } from '../../packages/waypoint-sdk/src/core/CoreApi';
import { GuideSession, type Clock, type StopReason } from '../../packages/waypoint-sdk/src/guide/GuideSession';
import type { LlmBackend } from '../../packages/waypoint-sdk/src/llm/LlmBackend';
import { LoggingBackend, type CallLogEntry } from '../../packages/waypoint-sdk/src/llm/logging';
import type { Action } from '../../packages/waypoint-sdk/src/types';
import type { Condition } from '../../examples/demo-app/src/app/spec';
import { Simulator } from './simulator';

export interface Task {
  id: number;
  target: string;
  screen: string;
  phrasings: string[];
}

export interface Trial {
  condition: Condition;
  task: number;
  phrasing: string;
  success: boolean;
  steps: number;
  stop: StopReason | 'success' | undefined;
  path: string[]; // screens visited
  actions: Action[];
  calls: number;
  callMs: number[];
}

/** Simulated time: the guide's polling and reminders cost nothing on the host. */
class InstantClock implements Clock {
  t = 0;
  now = () => this.t;
  sleep = async (ms: number) => {
    this.t += ms;
  };
}

export async function runTrial(
  core: CoreApi,
  backend: LlmBackend,
  sim: Simulator,
  task: Task,
  phrasing: string,
  maxSteps: number,
): Promise<Trial> {
  sim.reset();
  const calls: CallLogEntry[] = [];
  const logged = new LoggingBackend(backend, (_line, e) => calls.push(e));
  const path = [sim.screen];
  const actions: Action[] = [];
  let success = false;

  const session: GuideSession = new GuideSession({
    core,
    backend: logged,
    snapshot: () => sim.snapshot(),
    clock: new InstantClock(),
    canGoBack: () => sim.canGoBack(),
    // Polling is free in simulation; a long interval keeps CLI calls down without
    // changing behaviour (the screen only changes when the autopilot acts).
    options: { maxSteps, pollMs: 5_000 },
    onStep: (e) => {
      actions.push(e.action);
      sim.apply(e.action, e.snapshot);
      path.push(sim.screen);
      if (sim.isVisible(task.target)) {
        success = true;
        session.stop();
      }
    },
  });
  const final = await session.start(phrasing);
  return {
    condition: sim.condition,
    task: task.id,
    phrasing,
    success,
    steps: actions.length,
    stop: success ? 'success' : final.reason,
    path,
    actions,
    calls: calls.length,
    callMs: calls.map((c) => c.ms),
  };
}

export async function runGuide(
  core: CoreApi,
  backend: LlmBackend,
  tasks: Task[],
  conditions: Condition[],
  overridesB: Record<string, string>,
  maxSteps: number,
  onTrial?: (t: Trial) => void,
): Promise<Trial[]> {
  const out: Trial[] = [];
  for (const condition of conditions) {
    const sim = new Simulator(core, condition, condition === 'B' ? overridesB : {});
    for (const task of tasks) {
      for (const phrasing of task.phrasings) {
        const t = await runTrial(core, backend, sim, task, phrasing, maxSteps);
        out.push(t);
        onTrial?.(t);
      }
    }
  }
  return out;
}
