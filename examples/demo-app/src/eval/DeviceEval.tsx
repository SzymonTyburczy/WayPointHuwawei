// On-device evaluation (RFC §12): runs every task phrasing through the real guide
// with the autopilot pressing the highlighted element, and prints one JSON line
// per trial to the log. Collect with:
//   hdc hilog | grep WAYPOINT_EVAL > eval/results/device/trials.jsonl
// Only mounted when EVAL_AUTOPILOT is true.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useWaypoint } from 'waypoint-sdk';

import { useNav } from '../app/NavContext';
import { CONDITION } from '../config';
import tasksFile from '../../../../eval/tasks.json';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function DeviceEval() {
  const { runtime, startGuide, stopGuide } = useWaypoint();
  const nav = useNav();
  const [progress, setProgress] = useState('');

  const run = async () => {
    if (!runtime) return;
    const backend = runtime.backend ? await runtime.backend.info() : null;
    let ok = 0;
    let n = 0;
    for (const task of tasksFile.tasks) {
      for (const phrasing of task.phrasings) {
        nav.reset();
        await sleep(800);
        let success = false;
        const watcher = setInterval(async () => {
          const snap = await runtime.takeSnapshot();
          if (snap.nodes.some((x) => x.testID === task.target && x.visible)) {
            success = true;
            stopGuide();
          }
        }, 300);
        const started = Date.now();
        const final = await startGuide(phrasing);
        clearInterval(watcher);
        n++;
        if (success) ok++;
        console.log(
          'WAYPOINT_EVAL ' +
            JSON.stringify({
              condition: CONDITION,
              overrides: Object.keys(runtime.overrides.entries()).length > 0,
              backend,
              task: task.id,
              phrasing,
              success,
              steps: final.history.length,
              stop: success ? 'success' : final.reason,
              ms: Date.now() - started,
            }),
        );
        setProgress(`${ok}/${n}`);
      }
    }
  };

  return (
    <View nativeID="waypoint-overlay" style={styles.wrap} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel="Run device evaluation" onPress={run} style={styles.button}>
        <Text style={styles.text}>{progress ? `Eval ${progress}` : 'Run eval'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, top: 64 },
  button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: '#B71C1C', borderRadius: 8 },
  text: { color: '#FFFFFF', fontWeight: '700' },
});
