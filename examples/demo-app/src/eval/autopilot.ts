// Test-only autopilot (RFC §12 protocol, step 2): presses the element the guide
// highlighted so evaluation runs need no human. It lives in the demo app, never in
// the SDK, and is inert unless EVAL_AUTOPILOT is set in src/config.ts.
import type { StepEvent } from 'waypoint-sdk';

import { EVAL_AUTOPILOT } from '../config';

const pressers = new Map<string, () => void>();
let back: (() => void) | null = null;

/** Elements register their onPress under their testID. */
export function registerPresser(testID: string, press: (() => void) | undefined): () => void {
  if (!EVAL_AUTOPILOT || !press) return () => {};
  pressers.set(testID, press);
  return () => {
    if (pressers.get(testID) === press) pressers.delete(testID);
  };
}

export function registerBack(fn: () => void): void {
  back = fn;
}

export function autopilot(e: StepEvent): void {
  if (!EVAL_AUTOPILOT) return;
  const action = e.action;
  // Let the highlight render for a moment so recordings show it.
  setTimeout(() => {
    if (action.a === 'back') back?.();
    if (action.a !== 'tap') return;
    const testID = e.snapshot.nodes.find((n) => n.id === action.id)?.testID;
    if (testID) pressers.get(testID)?.();
  }, 600);
}
