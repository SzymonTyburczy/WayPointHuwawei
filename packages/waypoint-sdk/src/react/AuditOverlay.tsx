// Developer overlay: boxes per finding and a panel with suggestions (RFC-001 §4).
// Mount it under __DEV__ only: `{__DEV__ && <AuditOverlay />}`.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { findingBox } from '../overlay/geometry';
import NativeWaypointPlatform from '../specs/NativeWaypointPlatform';
import type { AuditResult } from '../runtime';
import type { Finding, UiNode } from '../types';
import { useWaypoint } from './context';

const RULE_TITLES: Record<string, string> = {
  R1: 'Missing name',
  R2: 'Small target',
  R3: 'Low contrast',
  R4: 'Missing role',
  R5: 'Duplicate name',
  R6: 'Unnamed image',
};

export interface AuditOverlayProps {
  /** Where the floating audit button sits; keep it clear of the app's own controls. */
  fabPosition?: { right?: number; bottom?: number; top?: number; left?: number };
}

export function AuditOverlay({ fabPosition = { right: 16, bottom: 88 } }: AuditOverlayProps) {
  const { runtime } = useWaypoint();
  const { width, height } = useWindowDimensions();
  const [result, setResult] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(false);
  const [accepted, setAccepted] = useState<Record<number, boolean>>({});
  const [transcript, setTranscript] = useState<string[]>([]);

  if (!runtime) return null;
  const viewport = { x: 0, y: 0, w: width, h: height };
  const nodes = new Map<number, UiNode>((result?.snapshot.nodes ?? []).map((n) => [n.id, n]));

  const run = async () => {
    setBusy(true);
    try {
      setResult(await runtime.auditWithSnapshot());
      setAccepted({});
      setPanel(true);
    } finally {
      setBusy(false);
    }
  };

  const accept = (f: Finding) => {
    const testID = nodes.get(f.nodeId)?.testID;
    if (!f.suggestion || !testID) return;
    runtime.overrides.set(testID, f.suggestion.label);
    setAccepted((a) => ({ ...a, [f.nodeId]: true }));
  };

  const acceptAll = () => {
    for (const f of result?.report.findings ?? []) accept(f);
  };

  // Hear the screen the way a screen-reader user does.
  const listen = () => {
    if (!result) return;
    const items = runtime.core.announce(result.snapshot);
    setTranscript(items.map((a) => a.text));
    NativeWaypointPlatform?.speak(items.map((a) => a.text).join('. '), 'en-US').catch(() => undefined);
  };

  // For waypoint-fix: hdc hilog | grep WAYPOINT_FIXES | sed 's/.*WAYPOINT_FIXES //' > fixes.json
  const exportFixes = () => {
    console.log(`WAYPOINT_FIXES ${JSON.stringify({ fixes: runtime.overrides.entries() })}`);
  };

  const counts = result?.report.counts;
  return (
    <View nativeID="waypoint-overlay" style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {result && !panel &&
        result.report.findings.map((f, i) => {
          const n = nodes.get(f.nodeId);
          if (!n) return null;
          const b = findingBox(n.frame, viewport);
          return (
            <View
              key={`${f.rule}-${f.nodeId}-${i}`}
              pointerEvents="none"
              style={[styles.box, f.severity === 'error' ? styles.error : styles.warning, { left: b.left, top: b.top, width: b.width, height: b.height }]}
            >
              <Text style={styles.boxLabel}>{f.rule}</Text>
            </View>
          );
        })}

      {panel && result && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle} accessibilityRole="header">
            {result.report.findings.length} findings · R1 {counts?.R1} · R2 {counts?.R2} · R3 {counts?.R3} · R4 {counts?.R4} · R5{' '}
            {counts?.R5} · R6 {counts?.R6}
          </Text>
          {result.report.contrastUnknown > 0 && (
            <Text style={styles.note}>{result.report.contrastUnknown} text items over images were not checked</Text>
          )}
          {result.report.partial && <Text style={styles.note}>Partial report: the screen has too many nodes</Text>}
          {transcript.length > 0 && (
            <Text style={styles.transcript} accessibilityLabel="Screen reader transcript">
              {transcript.map((t, i) => `${i + 1}. ${t}`).join('\n')}
            </Text>
          )}
          <ScrollView style={styles.list}>
            {result.report.findings.map((f, i) => (
              <View key={`${f.rule}-${f.nodeId}-${i}`} style={styles.row}>
                <Text style={[styles.rule, f.severity === 'error' ? styles.ruleError : styles.ruleWarning]}>
                  {f.rule} {RULE_TITLES[f.rule]}
                </Text>
                <Text style={styles.message}>
                  {f.message}
                  {nodes.get(f.nodeId)?.testID ? ` · ${nodes.get(f.nodeId)?.testID}` : ''}
                </Text>
                {f.suggestion && (
                  <View style={styles.suggestion}>
                    <Text style={styles.patch} selectable>
                      {f.suggestion.patch}
                      {f.suggestion.confidence === 'low' ? '  (low confidence)' : ''}
                    </Text>
                    {nodes.get(f.nodeId)?.testID && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Accept label ${f.suggestion.label}`}
                        style={styles.accept}
                        onPress={() => accept(f)}
                      >
                        <Text style={styles.acceptText}>{accepted[f.nodeId] ? 'Accepted' : 'Accept'}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.action} onPress={acceptAll}>
              <Text style={styles.actionText}>Accept all</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Listen like a screen reader" style={styles.action} onPress={listen}>
              <Text style={styles.actionText}>Listen</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Export accepted labels to the log" style={styles.action} onPress={exportFixes}>
              <Text style={styles.actionText}>Export fixes</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.action} onPress={() => setPanel(false)}>
              <Text style={styles.actionText}>Show boxes</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.action} onPress={() => setResult(null)}>
              <Text style={styles.actionText}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Hidden while the panel is open: it would cover the panel's own buttons. */}
      {!(panel && result) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Run accessibility audit"
          onPress={result ? () => setPanel(true) : run}
          style={[styles.fab, fabPosition]}
        >
          <Text style={styles.fabText}>{busy ? '…' : 'A11y'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', borderWidth: 2, borderRadius: 4 },
  error: { borderColor: '#E53935', backgroundColor: 'rgba(229,57,53,0.12)' },
  warning: { borderColor: '#FB8C00', backgroundColor: 'rgba(251,140,0,0.12)' },
  boxLabel: { position: 'absolute', top: -2, left: 2, fontSize: 10, fontWeight: '700', color: '#000000' },
  panel: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 80,
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  panelTitle: { fontSize: 15, fontWeight: '700', color: '#111111' },
  note: { fontSize: 13, color: '#444444', marginTop: 4 },
  transcript: { fontFamily: 'monospace', fontSize: 12, color: '#1B1B1F', backgroundColor: '#F1EEF6', borderRadius: 8, padding: 8, marginTop: 8 },
  list: { marginTop: 8 },
  row: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#CCCCCC' },
  rule: { fontSize: 14, fontWeight: '700' },
  ruleError: { color: '#B71C1C' },
  ruleWarning: { color: '#8A4B00' },
  message: { fontSize: 13, color: '#222222' },
  suggestion: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  patch: { flex: 1, fontFamily: 'monospace', fontSize: 12, color: '#0D47A1' },
  accept: { minHeight: 44, minWidth: 88, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D47A1', borderRadius: 8 },
  acceptText: { color: '#FFFFFF', fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 8 },
  action: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  actionText: { color: '#0D47A1', fontWeight: '700', fontSize: 15 },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6A1B9A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#FFFFFF', fontWeight: '700' },
});
