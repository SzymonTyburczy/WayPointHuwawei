import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useGuide } from './hooks';

/** Goal input for the guide (RFC-001 §4 "Guide UI"). Rendered inside the overlay id so it is never planned over. */
export function GuideBar({ placeholder = 'What do you want to do?' }: { placeholder?: string }) {
  const { start, stop, status } = useGuide();
  const [goal, setGoal] = useState('');
  const active = status === 'planning' || status === 'showing';
  return (
    <View nativeID="waypoint-overlay" style={styles.bar}>
      <TextInput
        style={styles.input}
        value={goal}
        onChangeText={setGoal}
        placeholder={placeholder}
        placeholderTextColor="#5F5F66"
        accessibilityLabel="Goal for the guide"
        returnKeyType="go"
        onSubmitEditing={() => goal.trim() && start(goal.trim())}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? 'Stop guide' : 'Start guide'}
        style={styles.button}
        onPress={() => (active ? stop() : goal.trim() && start(goal.trim()))}
      >
        <Text style={styles.buttonText}>{active ? 'Stop' : 'Guide me'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: '#F1EEF6' },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 12, fontSize: 16, color: '#111111', backgroundColor: '#FFFFFF', borderRadius: 8 },
  button: { marginLeft: 8, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: '#4A148C', borderRadius: 8 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
