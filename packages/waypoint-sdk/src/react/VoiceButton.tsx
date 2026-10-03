// Push-to-talk voice control. Tap the microphone, say a goal or a command
// ("make the text bigger", "co tu jest", "repeat", "stop"); replies and every
// guide step are spoken, with the highlighted element's position. Without a
// speech engine (e.g. an emulator without a microphone) the same commands can be
// typed.
import { useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import NativeWaypointPlatform from '../specs/NativeWaypointPlatform';
import type { VoiceLang } from '../voice/intents';
import { PlatformSpeechInput, type EventSource, type SpeechInput } from '../voice/SpeechInput';
import { VoiceController } from '../voice/VoiceController';
import { useWaypoint } from './context';

export interface VoiceButtonProps {
  /** Reply language; 'auto' follows each utterance. */
  lang?: VoiceLang | 'auto';
  /** Recognition language (BCP 47). */
  listenLanguage?: string;
  /** Override speech recognition, e.g. a remote engine. */
  input?: SpeechInput | null;
  /** Override speech output. */
  speak?: (text: string, lang: VoiceLang) => void | Promise<void>;
  position?: { left?: number; right?: number; top?: number; bottom?: number };
}

const TTS_LANG: Record<VoiceLang, string> = { en: 'en-US', pl: 'pl-PL' };

export function VoiceButton({ lang = 'auto', listenLanguage = 'en-US', input, speak, position = { right: 16, bottom: 160 } }: VoiceButtonProps) {
  const { runtime, guide, startGuide, stopGuide } = useWaypoint();
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const guideRef = useRef(guide);
  guideRef.current = guide;

  const speech = useMemo<SpeechInput | null>(() => {
    if (input !== undefined) return input;
    return NativeWaypointPlatform ? new PlatformSpeechInput(NativeWaypointPlatform, DeviceEventEmitter as unknown as EventSource) : null;
  }, [input]);

  const controller = useMemo(() => {
    if (!runtime) return null;
    return new VoiceController({
      core: runtime.core,
      lang,
      takeSnapshot: () => runtime.takeSnapshot(),
      startGuide,
      stopGuide,
      getGuide: () => guideRef.current,
      audit: () => runtime.audit(),
      speak: speak ?? ((text, l) => NativeWaypointPlatform?.speak(text, TTS_LANG[l]).catch(() => undefined)),
      viewport: () => runtime.viewport,
    });
  }, [runtime, lang, startGuide, stopGuide, speak]);

  useEffect(() => {
    controller?.onGuideState(guide);
  }, [controller, guide]);

  if (!controller) return null;

  const handle = async (text: string) => {
    setHeard(text);
    const turn = await controller.handle(text);
    setReply(turn.reply);
  };

  const press = async () => {
    if (!speech) {
      setTyping((t) => !t);
      return;
    }
    if (listening) {
      speech.cancel();
      return;
    }
    setListening(true);
    setHeard('');
    setReply('');
    NativeWaypointPlatform?.stopSpeaking().catch(() => undefined);
    const r = await speech.listen(listenLanguage, setHeard);
    setListening(false);
    if (r.text) await handle(r.text);
    else {
      setReply(r.error ?? (controller.language === 'pl' ? 'Nie usłyszałem.' : "I didn't hear anything."));
      // No microphone or no recogniser for this language: offer typed commands instead.
      if (r.error) setTyping(true);
    }
  };

  return (
    <View nativeID="waypoint-overlay" style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {(heard || reply || typing) && (
        <View style={[styles.bubble, { bottom: (position.bottom ?? 160) + 72 }]}>
          {heard ? <Text style={styles.heard}>“{heard}”</Text> : null}
          {reply ? (
            <Text style={styles.reply} accessibilityLiveRegion="polite">
              {reply}
            </Text>
          ) : null}
          {typing && (
            <TextInput
              style={styles.input}
              value={typed}
              onChangeText={setTyped}
              placeholder="Say or type: make the text bigger · co tu jest · stop"
              placeholderTextColor="#5F5F66"
              accessibilityLabel="Voice command"
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => {
                if (typed.trim()) handle(typed.trim());
                setTyped('');
              }}
            />
          )}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={listening ? 'Stop listening' : 'Voice command'}
        accessibilityHint="Say what you want to do, or ask what is on the screen"
        onPress={press}
        style={[styles.mic, position, listening && styles.micActive]}
      >
        <View style={[styles.micBody, listening && styles.micBodyActive]} />
        <View style={styles.micStand} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  mic: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#00695C',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  micActive: { backgroundColor: '#C62828' },
  micBody: { width: 16, height: 26, borderRadius: 8, backgroundColor: '#FFFFFF' },
  micBodyActive: { height: 22 },
  micStand: { width: 24, height: 4, marginTop: 4, borderRadius: 2, backgroundColor: '#FFFFFF' },
  bubble: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  heard: { fontSize: 15, color: '#444444', fontStyle: 'italic' },
  reply: { fontSize: 17, color: '#111111', marginTop: 4, fontWeight: '600' },
  input: { marginTop: 8, minHeight: 44, borderWidth: 1, borderColor: '#757575', borderRadius: 8, paddingHorizontal: 12, fontSize: 16, color: '#111111' },
});
