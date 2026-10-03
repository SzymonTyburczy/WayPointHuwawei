import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { captionPlacement, ringBox } from '../overlay/geometry';
import { useWaypoint } from './context';

const OVERLAY_ID = 'waypoint-overlay'; // excluded from snapshots by the core
const CAPTION_HEIGHT = 64;

/** Highlight ring and caption for the active guide step. The guide never taps. */
export function GuideOverlay() {
  const { guide, stopGuide } = useWaypoint();
  const { width, height } = useWindowDimensions();
  if (guide.status === 'idle') return null;

  const viewport = { x: 0, y: 0, w: width, h: height };
  const ring = guide.status === 'showing' && guide.target ? ringBox(guide.target.frame, viewport) : null;
  const caption = captionPlacement(ring, viewport, CAPTION_HEIGHT);
  const active = guide.status === 'planning' || guide.status === 'showing';
  const text = guide.status === 'planning' && !guide.caption ? 'Looking at the screen…' : guide.caption;

  return (
    <View nativeID={OVERLAY_ID} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {ring && (
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          style={[styles.ring, { left: ring.left, top: ring.top, width: ring.width, height: ring.height }]}
        />
      )}
      <View style={[styles.caption, { top: caption.top, minHeight: CAPTION_HEIGHT }]} pointerEvents="box-none">
        <Text style={styles.captionText} accessibilityLiveRegion="polite" accessibilityRole="text">
          {guide.reminder ? `Still waiting: ${text}` : text}
        </Text>
        <Pressable
          onPress={stopGuide}
          accessibilityRole="button"
          accessibilityLabel={active ? 'Stop guide' : 'Close guide'}
          style={styles.stop}
          hitSlop={8}
        >
          <Text style={styles.stopText}>{active ? 'Stop' : 'Close'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 4,
    borderColor: '#FFB300',
    borderRadius: 12,
  },
  caption: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B1B1F',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  captionText: { flex: 1, color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  stop: { marginLeft: 12, minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  stopText: { color: '#FFD54F', fontSize: 16, fontWeight: '700' },
});
