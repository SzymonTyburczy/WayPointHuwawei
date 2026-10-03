// ArkTS side of WaypointPlatform (stretch item 1: text-to-speech for captions).
// Core Speech Kit availability is device- and region-dependent (RFC §16 sources);
// every method degrades to a no-op instead of failing the guide.
import { TurboModule } from '@rnoh/react-native-openharmony/ts';
import { textToSpeech } from '@kit.CoreSpeechKit';
import { accessibility } from '@kit.AccessibilityKit';

export class WaypointPlatformTurboModule extends TurboModule {
  static readonly NAME = 'WaypointPlatform';
  private engine: textToSpeech.TextToSpeechEngine | undefined = undefined;
  private requestId = 0;

  private async getEngine(): Promise<textToSpeech.TextToSpeechEngine | undefined> {
    if (this.engine) {
      return this.engine;
    }
    try {
      this.engine = await textToSpeech.createEngine({ language: 'en-US', person: 0, online: 1 });
    } catch (e) {
      this.engine = undefined;
    }
    return this.engine;
  }

  async speak(text: string): Promise<void> {
    const engine = await this.getEngine();
    if (!engine) {
      return;
    }
    if (engine.isBusy()) {
      engine.stop();
    }
    this.requestId += 1;
    engine.speak(text, { requestId: `waypoint-${this.requestId}`, extraParams: { queueMode: 0 } });
  }

  async isScreenReaderEnabled(): Promise<boolean> {
    try {
      return accessibility.isScreenReaderOpenSync();
    } catch (e) {
      return accessibility.isOpenTouchGuideSync();
    }
  }
}
