// ArkTSTurboModule (RFC-001 §11, stretch item 1 and voice control): speech in and
// out on top of HarmonyOS Core Speech Kit, and the screen-reader state.
// Recognition results arrive as device events named "WaypointSpeech" (SPEECH_EVENT):
//   { type: 'partial' | 'final', text } | { type: 'error', message } | { type: 'end' }
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** language: BCP 47, e.g. "en-US" or "pl-PL"; engines that lack it fall back to their default. */
  speak(text: string, language: string): Promise<void>;
  stopSpeaking(): Promise<void>;
  /** Asks for the microphone permission if needed; resolves false when it is denied or ASR is unavailable. */
  startListening(language: string): Promise<boolean>;
  stopListening(): Promise<void>;
  isScreenReaderEnabled(): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('WaypointPlatform');
