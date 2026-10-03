// Minimal stack + tab navigation without native dependencies (plan D7: every
// native library would need an RNOH port). Pure state transitions, shared with
// the simulator.
import { START_SCREEN, TABS, screenById } from './spec';

export type NavState = { stack: string[] };

export const initialNav: NavState = { stack: [START_SCREEN] };

export function current(nav: NavState): string {
  return nav.stack[nav.stack.length - 1];
}

export function push(nav: NavState, screen: string): NavState {
  screenById(screen); // validates
  return { stack: [...nav.stack, screen] };
}

export function back(nav: NavState): NavState {
  return nav.stack.length > 1 ? { stack: nav.stack.slice(0, -1) } : nav;
}

export function switchTab(_nav: NavState, screen: string): NavState {
  return { stack: [screen] };
}

export function canGoBack(nav: NavState): boolean {
  return nav.stack.length > 1;
}

/** The tab whose stack is shown (the stack's root). */
export function activeTab(nav: NavState): string {
  const root = nav.stack[0];
  return TABS.find((t) => t.screen === root)?.screen ?? TABS[0].screen;
}
