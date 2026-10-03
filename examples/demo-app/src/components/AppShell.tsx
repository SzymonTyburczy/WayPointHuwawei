// Header, scrolling body and tab bar for the current screen of the spec.
import { useEffect } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWaypointTarget } from 'waypoint-sdk';

import { COLORS, FONT, GAP, HEADER_H, ICON, ICON_BUTTON, PAD, TAB_BAR_H } from '../app/layout';
import { activeTab, current } from '../app/navigation';
import { useNav } from '../app/NavContext';
import { TABS, screenById, type HeaderAction, type TabSpec } from '../app/spec';
import { ICONS } from '../assets';
import { registerBack, registerPresser } from '../eval/autopilot';
import { Element, useLabel } from './elements';

export function AppShell() {
  const nav = useNav();
  const screen = screenById(current(nav.state));
  useEffect(() => registerBack(nav.back), [nav.back]);
  useEffect(() => registerPresser('header-back', nav.back), [nav.back]);
  // Not mounted on root screens; the registry skips refs that are not attached.
  const backRef = useWaypointTarget<View>({ testID: 'header-back', role: 'button', label: 'Back', pressable: true });
  const titleRef = useWaypointTarget<Text>({ component: 'Paragraph', testID: `title-${screen.id}`, text: screen.title, fontSize: FONT.title, role: 'header' });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {!screen.root && (
          <Pressable ref={backRef} testID="header-back" accessibilityRole="button" accessibilityLabel="Back" onPress={nav.back} style={styles.headerButton}>
            <Image source={ICONS.ic_arrow_back} style={styles.icon} />
          </Pressable>
        )}
        <Text ref={titleRef} testID={`title-${screen.id}`} accessibilityRole="header" style={[styles.title, { marginLeft: screen.root ? PAD : 8 }]}>
          {screen.title}
        </Text>
        {screen.headerAction && <HeaderActionButton action={screen.headerAction} />}
      </View>
      <ScrollView key={screen.id} style={styles.body} contentContainerStyle={styles.content}>
        {screen.body.map((el) => (
          <Element key={el.testID} el={el} />
        ))}
      </ScrollView>
      {screen.root && (
        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <Tab key={t.testID} tab={t} selected={activeTab(nav.state) === t.screen} />
          ))}
        </View>
      )}
    </View>
  );
}

function HeaderActionButton({ action }: { action: HeaderAction }) {
  const nav = useNav();
  const label = useLabel(action);
  const press = () => nav.push(action.to);
  useEffect(() => registerPresser(action.testID, press));
  const ref = useWaypointTarget<View>({ testID: action.testID, role: 'button', label, imageSrc: action.icon, pressable: true });
  return (
    <Pressable
      ref={ref}
      testID={action.testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={press}
      style={[styles.headerButton, styles.headerRight]}
    >
      <Image source={ICONS[action.icon]} style={styles.icon} />
    </Pressable>
  );
}

function Tab({ tab, selected }: { tab: TabSpec; selected: boolean }) {
  const nav = useNav();
  const label = useLabel(tab);
  const press = () => nav.tab(tab.screen);
  useEffect(() => registerPresser(tab.testID, press));
  const ref = useWaypointTarget<View>({ testID: tab.testID, role: 'tab', label, selected, imageSrc: tab.icon, pressable: true });
  return (
    <Pressable
      ref={ref}
      testID={tab.testID}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={press}
      style={styles.tab}
    >
      <Image source={ICONS[tab.icon]} style={[styles.icon, { opacity: selected ? 1 : 0.6 }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { height: HEADER_H, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.header },
  headerButton: { width: ICON_BUTTON, height: ICON_BUTTON, marginLeft: 4, alignItems: 'center', justifyContent: 'center' },
  headerRight: { position: 'absolute', right: 4, top: 4 },
  title: { fontSize: FONT.title, fontWeight: '700', color: COLORS.text, width: 240, height: 32 },
  icon: { width: ICON, height: ICON },
  body: { flex: 1 },
  content: { paddingTop: GAP },
  tabBar: { height: TAB_BAR_H, flexDirection: 'row', backgroundColor: COLORS.tabBar },
  tab: { flex: 1, alignItems: 'center', paddingTop: 20 },
});
