import { useSyncExternalStore } from 'react';

import { useWaypoint } from './context';

/** Guide control: `const { start, stop, status, caption, target } = useGuide()`. */
export function useGuide() {
  const { guide, startGuide, stopGuide } = useWaypoint();
  return {
    start: startGuide,
    stop: stopGuide,
    status: guide.status,
    caption: guide.caption,
    target: guide.target,
    state: guide,
  };
}

const noopSubscribe = () => () => {};

/**
 * Returns the accepted label for `testID`, or `fallback`. Used by the demo app so
 * accepted suggestions show up without a rebuild (RFC §8).
 */
export function useWaypointOverride(testID: string | undefined, fallback?: string): string | undefined {
  const { runtime } = useWaypoint();
  const store = runtime?.overrides;
  const label = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => (store ? store.get(testID) : undefined),
    () => undefined,
  );
  return label ?? fallback;
}
