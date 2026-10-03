// Node-only: the C++ core through the host CLI (cpp/build/waypoint-cli). Used by
// the Jest integration tests and the evaluation harness so host numbers come
// from the same C++ code as the device. Not exported from the RN entry point.
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

import { JsonCore, type CoreApi, type CoreStrings } from '../core/CoreApi';

export function defaultCliPath(): string {
  return process.env.WAYPOINT_CLI ?? resolve(__dirname, '../../../../cpp/build/waypoint-cli');
}

export class CliCoreStrings implements CoreStrings {
  constructor(private readonly cli: string = defaultCliPath()) {
    if (!existsSync(cli)) {
      throw new Error(`waypoint-cli not found at ${cli}; build it with: cmake -S cpp -B cpp/build && cmake --build cpp/build`);
    }
  }

  private call(cmd: string, request: Record<string, unknown>): string {
    try {
      return execFileSync(this.cli, [cmd], { input: JSON.stringify(request), encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
    } catch (e) {
      // Exit code 1 carries {"error": ...} on stdout.
      const out = (e as { stdout?: string }).stdout;
      if (out) return out.trim();
      throw e;
    }
  }

  finalize(raw: string) {
    return this.call('finalize', { snapshot: JSON.parse(raw) });
  }
  audit(snapshot: string) {
    return this.call('audit', { snapshot: JSON.parse(snapshot) });
  }
  planStep(goal: string, snapshot: string, history: string) {
    return this.call('plan', { goal, snapshot: JSON.parse(snapshot), history: JSON.parse(history) });
  }
  parseAction(text: string, candidates: string) {
    return this.call('parse', { text, candidates: JSON.parse(candidates) });
  }
  labelRequest(snapshot: string, nodeId: number) {
    return this.call('label-request', { snapshot: JSON.parse(snapshot), nodeId });
  }
  validateLabel(snapshot: string, nodeId: number, label: string) {
    return this.call('validate-label', { snapshot: JSON.parse(snapshot), nodeId, label });
  }
}

export function createCliCore(cli?: string): CoreApi {
  return new JsonCore(new CliCoreStrings(cli));
}
