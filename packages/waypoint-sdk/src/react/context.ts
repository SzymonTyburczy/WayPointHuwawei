import { createContext, useContext } from 'react';

import type { GuideState } from '../guide/GuideSession';
import type { WaypointRuntime } from '../runtime';

export interface WaypointContextValue {
  runtime: WaypointRuntime | null;
  guide: GuideState;
  startGuide: (goal: string) => Promise<GuideState>;
  stopGuide: () => void;
}

export const idleGuide: GuideState = { status: 'idle', goal: '', step: 0, caption: '', reminder: false, history: [] };

export const WaypointContext = createContext<WaypointContextValue>({
  runtime: null,
  guide: idleGuide,
  startGuide: async () => idleGuide,
  stopGuide: () => {},
});

export function useWaypoint(): WaypointContextValue {
  return useContext(WaypointContext);
}
