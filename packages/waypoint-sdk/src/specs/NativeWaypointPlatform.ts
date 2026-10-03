// ArkTSTurboModule (stretch, RFC-001 §11): text-to-speech and screen-reader state.
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  speak(text: string): Promise<void>;
  isScreenReaderEnabled(): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('WaypointPlatform');
