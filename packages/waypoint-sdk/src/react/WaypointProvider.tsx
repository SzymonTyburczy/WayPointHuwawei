import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RootTagContext, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { CoreApi } from '../core/CoreApi';
import { createNativeCore } from '../core/NativeCore';
import type { GuideOptions, GuideSession, GuideState, StepEvent } from '../guide/GuideSession';
import type { LogSink } from '../llm/logging';
import { createBackend, setCurrentRuntime, WaypointRuntime, type BackendConfig, type SnapshotSource } from '../runtime';
import NativeWaypointLlm from '../specs/NativeWaypointLlm';
import NativeWaypointPlatform from '../specs/NativeWaypointPlatform';
import { idleGuide, WaypointContext } from './context';
import { GuideOverlay } from './GuideOverlay';

export interface WaypointProviderProps {
  backend: BackendConfig;
  children: ReactNode;
  /** Defaults to the cxxTurboModule; inject a different core in tests. */
  core?: CoreApi;
  /** JSON-lines call log (RFC §10); off by default (RFC §13). */
  log?: LogSink;
  guideOptions?: Partial<GuideOptions>;
  /** Speak captions through the platform module (stretch item 1). */
  speak?: boolean;
  /** Where snapshots come from; "auto" falls back to plan B when the walker fails. */
  snapshotSource?: SnapshotSource;
  /** Whether a system back action makes sense right now (e.g. not on a root tab). */
  canGoBack?: () => boolean;
  /** Test-only hook used by the demo app's evaluation autopilot. */
  onGuideStep?: (event: StepEvent) => void | Promise<void>;
}

export function WaypointProvider(props: WaypointProviderProps) {
  const rootTag = React.useContext(RootTagContext) as unknown as number;
  const { backend: backendConfig, core: injectedCore, log } = props;

  const runtime = useMemo(() => {
    const core = injectedCore ?? createNativeCore();
    if (!core) return null;
    let backend = null;
    try {
      backend = createBackend(backendConfig, NativeWaypointLlm, log);
    } catch (e) {
      // A refused or broken backend disables the guide; the audit still runs (RFC §13).
      console.warn(`Waypoint: backend disabled: ${e instanceof Error ? e.message : String(e)}`);
    }
    return new WaypointRuntime(core, backend, rootTag, props.snapshotSource ?? 'auto');
    // The backend config is read once per mount; remount the provider to change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedCore]);

  const { width, height } = useWindowDimensions();
  useEffect(() => {
    if (runtime) runtime.surfaceId = rootTag;
  }, [runtime, rootTag]);
  if (runtime) runtime.viewport = { x: 0, y: 0, w: width, h: height };

  useEffect(() => {
    setCurrentRuntime(runtime);
    return () => setCurrentRuntime(null);
  }, [runtime]);

  const [guide, setGuide] = useState<GuideState>(idleGuide);
  const session = useRef<GuideSession | null>(null);
  const stepHook = useRef(props.onGuideStep);
  stepHook.current = props.onGuideStep;
  const backHook = useRef(props.canGoBack);
  backHook.current = props.canGoBack;

  const stopGuide = useCallback(() => {
    session.current?.stop();
  }, []);

  const startGuide = useCallback(
    async (goal: string) => {
      if (!runtime) {
        const state: GuideState = { ...idleGuide, goal, status: 'stopped', reason: 'backend', caption: 'Waypoint is not available' };
        setGuide(state);
        return state;
      }
      session.current?.stop();
      const s = runtime.createGuide({
        options: props.guideOptions,
        onState: setGuide,
        onStep: (e) => stepHook.current?.(e),
        canGoBack: () => backHook.current?.() ?? true,
      });
      session.current = s;
      return s.start(goal);
    },
    [runtime, props.guideOptions],
  );

  useEffect(() => () => session.current?.stop(), []);

  const lastSpoken = useRef('');
  useEffect(() => {
    if (!props.speak || !NativeWaypointPlatform || !guide.caption || guide.caption === lastSpoken.current) return;
    lastSpoken.current = guide.caption;
    NativeWaypointPlatform.speak(guide.caption).catch(() => {});
  }, [props.speak, guide.caption]);

  const value = useMemo(() => ({ runtime, guide, startGuide, stopGuide }), [runtime, guide, startGuide, stopGuide]);

  return (
    <WaypointContext.Provider value={value}>
      <View style={styles.root}>
        {props.children}
        <GuideOverlay />
      </View>
    </WaypointContext.Provider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
