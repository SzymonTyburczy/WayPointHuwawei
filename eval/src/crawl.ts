// App map: every screen of the simulated app and every control that leads from
// one screen to another, found by pressing each control. A screen is
// "reachable by name" when some path from Home uses only controls with a name,
// which is what an assistant (or a screen-reader user) needs to get there.
import type { CoreApi } from '../../packages/waypoint-sdk/src/core/CoreApi';
import { screenById, type Condition } from '../../examples/demo-app/src/app/spec';
import type { NavState } from '../../examples/demo-app/src/app/navigation';
import { Simulator } from './simulator';

export interface MapEdge {
  from: string;
  to: string;
  testID: string;
  name: string; // the control's accessible name; '' when it has none
}

export interface MapScreen {
  id: string;
  title: string;
  depth: number; // shortest number of presses from Home, any control
  byName: boolean; // reachable from Home through named controls only
}

export interface AppMap {
  condition: Condition;
  screens: MapScreen[];
  edges: MapEdge[];
}

export function crawl(core: CoreApi, condition: Condition, overrides: Record<string, string> = {}): AppMap {
  const sim = new Simulator(core, condition, overrides);
  const seen = new Map<string, NavState>(); // screen -> first stack that shows it
  const depth = new Map<string, number>();
  const edges: MapEdge[] = [];
  const edgeKeys = new Set<string>();
  sim.reset();
  const start = sim.screen;
  seen.set(start, sim.state);
  depth.set(start, 0);
  const queue = [start];

  while (queue.length) {
    const screen = queue.shift()!;
    const state = seen.get(screen)!;
    sim.state = state;
    sim.toggles = {};
    const snap = sim.snapshot();
    for (const node of snap.nodes) {
      if (!node.actionable || !node.visible || !node.testID || node.testID === 'header-back') continue;
      sim.state = state;
      sim.toggles = {};
      if (!sim.apply({ a: 'tap', id: node.id, index: 0 }, snap)) continue;
      const to = sim.screen;
      if (to === screen || sim.state.stack.length < state.stack.length) continue;
      const key = `${screen}>${to}>${node.testID}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({ from: screen, to, testID: node.testID, name: node.name.trim() });
      }
      if (!seen.has(to)) {
        seen.set(to, sim.state);
        depth.set(to, depth.get(screen)! + 1);
        queue.push(to);
      }
    }
  }

  // Reachability through named controls only.
  const byName = new Set([start]);
  const named = edges.filter((e) => e.name);
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of named) {
      if (byName.has(e.from) && !byName.has(e.to)) {
        byName.add(e.to);
        changed = true;
      }
    }
  }

  const screens = [...seen.keys()].map((id) => ({ id, title: screenById(id).title, depth: depth.get(id)!, byName: byName.has(id) }));
  return { condition, screens, edges };
}
