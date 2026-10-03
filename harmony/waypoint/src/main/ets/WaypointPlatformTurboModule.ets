// ArkTS side of WaypointPlatform: speech out (text-to-speech), speech in (speech
// recognition) and the screen-reader state, on HarmonyOS Core Speech Kit.
//
// Recognition results are sent to JS as "WaypointSpeech" device events:
//   { type: 'partial' | 'final', text } | { type: 'error', message } | { type: 'end' }
//
// Core Speech Kit's language and region support depends on the device and OS
// build (see docs/VOICE.md). Every method degrades instead of throwing: speak()
// becomes a no-op and startListening() resolves false, which makes the JS button
// fall back to typed commands.
import { UITurboModule } from '@rnoh/react-native-openharmony/ts';
import { speechRecognizer, textToSpeech } from '@kit.CoreSpeechKit';
import { accessibility } from '@kit.AccessibilityKit';
import { abilityAccessCtrl, Permissions } from '@kit.AbilityKit';

const SPEECH_EVENT = 'WaypointSpeech';
const MICROPHONE: Permissions = 'ohos.permission.MICROPHONE';

// ArkTS rejects untyped object literals (arkts-no-untyped-obj-literals).
interface SpeechEvent {
  type: string;
  text?: string;
  message?: string;
}

export class WaypointPlatformTurboModule extends UITurboModule {
  static readonly NAME = 'WaypointPlatform';

  private tts: textToSpeech.TextToSpeechEngine | undefined = undefined;
  private ttsLanguage = '';
  private asr: speechRecognizer.SpeechRecognitionEngine | undefined = undefined;
  private asrLanguage = '';
  private sessionId = '';
  private requestId = 0;

  // ---- speech out ------------------------------------------------------------

  private async ttsEngine(language: string): Promise<textToSpeech.TextToSpeechEngine | undefined> {
    if (this.tts && this.ttsLanguage === language) {
      return this.tts;
    }
    this.tts?.shutdown();
    this.tts = undefined;
    for (const lang of [language, 'zh-CN']) {
      try {
        this.tts = await textToSpeech.createEngine({ language: lang, person: 0, online: 1 });
        this.ttsLanguage = language;
        return this.tts;
      } catch (e) {
        // try the next language
      }
    }
    return undefined;
  }

  async speak(text: string, language: string): Promise<void> {
    const engine = await this.ttsEngine(language || 'en-US');
    if (!engine) {
      return;
    }
    if (engine.isBusy()) {
      engine.stop();
    }
    this.requestId += 1;
    engine.speak(text, { requestId: `waypoint-tts-${this.requestId}`, extraParams: { queueMode: 0 } });
  }

  async stopSpeaking(): Promise<void> {
    if (this.tts?.isBusy()) {
      this.tts.stop();
    }
  }

  // ---- speech in -------------------------------------------------------------

  private emit(payload: SpeechEvent): void {
    this.ctx.rnInstance.emitDeviceEvent(SPEECH_EVENT, payload);
  }

  private async microphoneGranted(): Promise<boolean> {
    try {
      const atManager = abilityAccessCtrl.createAtManager();
      const result = await atManager.requestPermissionsFromUser(this.ctx.uiAbilityContext, [MICROPHONE]);
      return result.authResults.length > 0 && result.authResults[0] === 0;
    } catch (e) {
      return false;
    }
  }

  private async asrEngine(language: string): Promise<speechRecognizer.SpeechRecognitionEngine | undefined> {
    if (this.asr && this.asrLanguage === language) {
      return this.asr;
    }
    this.asr?.shutdown();
    this.asr = undefined;
    try {
      const engine = await speechRecognizer.createEngine({
        language: language,
        online: 1,
        extraParams: { 'locate': 'CN', 'recognizerMode': 'short' },
      });
      engine.setListener({
        onStart: (_sessionId: string, _eventMessage: string) => {},
        onEvent: (_sessionId: string, _eventCode: number, _eventMessage: string) => {},
        onResult: (_sessionId: string, result: speechRecognizer.SpeechRecognitionResult) => {
          this.emit({ type: result.isFinal ? 'final' : 'partial', text: result.result });
        },
        onComplete: (_sessionId: string, _eventMessage: string) => {
          this.emit({ type: 'end' });
        },
        onError: (_sessionId: string, errorCode: number, errorMessage: string) => {
          this.emit({ type: 'error', message: `${errorCode}: ${errorMessage}` });
        },
      });
      this.asr = engine;
      this.asrLanguage = language;
      return engine;
    } catch (e) {
      return undefined;
    }
  }

  async startListening(language: string): Promise<boolean> {
    if (!(await this.microphoneGranted())) {
      return false;
    }
    const engine = await this.asrEngine(language || 'en-US');
    if (!engine) {
      return false;
    }
    this.sessionId = `waypoint-asr-${Date.now()}`;
    try {
      engine.startListening({
        sessionId: this.sessionId,
        audioInfo: { audioType: 'pcm', sampleRate: 16000, soundChannel: 1, sampleBit: 16 },
        extraParams: { 'recognitionMode': 0, 'vadBegin': 2000, 'vadEnd': 1500, 'maxAudioDuration': 20000 },
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async stopListening(): Promise<void> {
    if (this.asr && this.sessionId) {
      try {
        this.asr.finish(this.sessionId);
      } catch (e) {
        // already finished
      }
    }
  }

  // ---- screen reader ----------------------------------------------------------

  async isScreenReaderEnabled(): Promise<boolean> {
    try {
      return accessibility.isScreenReaderOpenSync();
    } catch (e) {
      return accessibility.isOpenTouchGuideSync();
    }
  }

  __onDestroy__(): void {
    this.tts?.shutdown();
    this.asr?.shutdown();
  }
}
