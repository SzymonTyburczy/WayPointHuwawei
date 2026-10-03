// Renders spec elements with real React Native accessibility props. Layout values
// come from src/app/layout.ts and match eval/src/simulator.ts.
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, type AccessibilityRole } from 'react-native';
import { useWaypointOverride } from 'waypoint-sdk';

import { COLORS, FONT, GAP, HEIGHTS, ICON, PAD } from '../app/layout';
import { useNav } from '../app/NavContext';
import { resolveLabel, type El } from '../app/spec';
import { ICONS } from '../assets';
import { CONDITION } from '../config';
import { registerPresser } from '../eval/autopilot';

/** The label a control has right now: accepted override (B), else the build's condition (A or C). */
export function useLabel(item: { testID: string; label?: string; handLabel?: string }): string | undefined {
  const override = useWaypointOverride(item.testID);
  return override ?? resolveLabel(item, CONDITION, {});
}

function useAutopilot(testID: string, press: (() => void) | undefined) {
  useEffect(() => registerPresser(testID, press), [testID, press]);
}

function role(el: El): AccessibilityRole | undefined {
  return el.role ? (el.role as AccessibilityRole) : undefined;
}

export function Element({ el }: { el: El }) {
  switch (el.kind) {
    case 'row':
      return <Row el={el} />;
    case 'text':
      return <Paragraph el={el} />;
    case 'image':
      return <Banner el={el} />;
    case 'icon':
      return <IconButton el={el} />;
    case 'toggle':
      return <Toggle el={el} />;
    case 'input':
      return <Input el={el} />;
    case 'button':
      return <PrimaryButton el={el} />;
  }
}

function useGo(el: El): (() => void) | undefined {
  const nav = useNav();
  return el.to ? () => nav.push(el.to!) : undefined;
}

function Row({ el }: { el: El }) {
  const label = useLabel(el);
  const onPress = useGo(el) ?? noop;
  useAutopilot(el.testID, onPress);
  return (
    <Pressable testID={el.testID} accessibilityRole={role(el)} accessibilityLabel={label} onPress={onPress} style={styles.row}>
      <Text style={styles.rowText}>{el.text}</Text>
    </Pressable>
  );
}

function Paragraph({ el }: { el: El }) {
  const size = el.fontSize ?? FONT.text;
  const height = size >= 20 ? HEIGHTS.textLarge : HEIGHTS.text;
  return (
    <Text testID={el.testID} style={[styles.paragraph, { fontSize: size, height, color: el.fg ?? COLORS.text }]}>
      {el.text}
    </Text>
  );
}

function Banner({ el }: { el: El }) {
  const label = useLabel(el);
  return (
    <Image
      testID={el.testID}
      source={ICONS[el.icon ?? '']}
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityRole={label ? 'image' : undefined}
      style={styles.banner}
      resizeMode="cover"
    />
  );
}

function IconButton({ el }: { el: El }) {
  const label = useLabel(el);
  const onPress = useGo(el) ?? noop;
  useAutopilot(el.testID, onPress);
  const w = el.w ?? HEIGHTS.icon;
  const h = el.h ?? HEIGHTS.icon;
  return (
    <Pressable
      testID={el.testID}
      accessibilityRole={role(el)}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.icon, { width: w, height: h }]}
    >
      <Image source={ICONS[el.icon ?? '']} style={{ width: Math.min(ICON, w), height: Math.min(ICON, h) }} />
    </Pressable>
  );
}

function Toggle({ el }: { el: El }) {
  const label = useLabel(el);
  const [on, setOn] = useState(el.value ?? false);
  const flip = () => setOn((v) => !v);
  useAutopilot(el.testID, flip);
  const w = el.w ?? 48;
  const h = el.h ?? 48;
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleText}>{el.text}</Text>
      <Pressable
        testID={el.testID}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: on }}
        onPress={flip}
        style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: on ? COLORS.switchOn : COLORS.switchOff }}
      />
    </View>
  );
}

function Input({ el }: { el: El }) {
  const label = useLabel(el);
  const [value, setValue] = useState('');
  return (
    <View style={styles.inputBlock}>
      {el.caption ? <Text style={styles.caption}>{el.caption}</Text> : null}
      <TextInput testID={el.testID} accessibilityLabel={label} value={value} onChangeText={setValue} style={styles.input} />
    </View>
  );
}

function PrimaryButton({ el }: { el: El }) {
  const label = useLabel(el);
  const onPress = useGo(el) ?? noop;
  useAutopilot(el.testID, onPress);
  return (
    <Pressable testID={el.testID} accessibilityRole={role(el)} accessibilityLabel={label} onPress={onPress} style={styles.button}>
      <Text style={styles.buttonText}>{el.text}</Text>
    </Pressable>
  );
}

const noop = () => {};

const styles = StyleSheet.create({
  row: { height: HEIGHTS.row, justifyContent: 'center', paddingHorizontal: PAD },
  rowText: { fontSize: FONT.body, color: COLORS.text },
  paragraph: { marginHorizontal: PAD, marginBottom: GAP },
  banner: { marginHorizontal: PAD, height: HEIGHTS.image, marginBottom: GAP, borderRadius: 12 },
  icon: { marginLeft: PAD, marginBottom: GAP, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { height: HEIGHTS.toggle, flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD },
  toggleText: { flex: 1, fontSize: FONT.body, color: COLORS.text },
  inputBlock: { marginHorizontal: PAD, marginBottom: GAP },
  caption: { height: HEIGHTS.inputCaption, fontSize: 14, color: COLORS.secondary, marginBottom: 4 },
  input: {
    height: HEIGHTS.input,
    borderWidth: 1,
    borderColor: '#757575',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: FONT.body,
    color: COLORS.text,
  },
  button: {
    marginHorizontal: PAD,
    marginBottom: GAP,
    height: HEIGHTS.button,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: COLORS.onPrimary, fontSize: FONT.body, fontWeight: '700' },
});
