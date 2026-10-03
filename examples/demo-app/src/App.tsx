import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuditOverlay, GuideBar, WaypointProvider } from 'waypoint-sdk';

import { canGoBack } from './app/navigation';
import { NavProvider, useNav } from './app/NavContext';
import { AppShell } from './components/AppShell';
import { BACKEND, EVAL_AUTOPILOT, SPEAK_CAPTIONS } from './config';
import { autopilot } from './eval/autopilot';
import { DeviceEval } from './eval/DeviceEval';

export default function App() {
  return (
    <NavProvider>
      <WaypointShell />
    </NavProvider>
  );
}

function WaypointShell() {
  const nav = useNav();
  return (
    <WaypointProvider
      backend={BACKEND}
      speak={SPEAK_CAPTIONS}
      canGoBack={() => canGoBack(nav.state)}
      onGuideStep={EVAL_AUTOPILOT ? autopilot : undefined}
    >
      <AppShell />
      <GuideLauncher />
      {__DEV__ && <AuditOverlay fabPosition={{ right: 16, bottom: 88 }} />}
      {EVAL_AUTOPILOT && <DeviceEval />}
    </WaypointProvider>
  );
}

/** Floating "Guide me" button that opens the goal input. Part of the overlay, never of the app. */
function GuideLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <View nativeID="waypoint-overlay" style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {open && (
        <View style={styles.bar}>
          <GuideBar />
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide guide' : 'Open guide'}
        onPress={() => setOpen((o) => !o)}
        style={styles.fab}
      >
        <Text style={styles.fabText}>{open ? '×' : 'Guide'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, top: 56 },
  fab: {
    position: 'absolute',
    left: 16,
    bottom: 88,
    minWidth: 72,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 16,
    backgroundColor: '#4A148C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
