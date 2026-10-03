// Speech recognition behind a small interface, so the controller can be driven by
// the platform engine, a remote engine or plain text in tests.
import type { Spec as PlatformSpec } from '../specs/NativeWaypointPlatform';

/** Device event emitted by the ArkTS module for every recognition result. */
export const SPEECH_EVENT = 'WaypointSpeech';

export interface SpeechEvent {
  type: 'partial' | 'final' | 'error' | 'end';
  text?: string;
  message?: string;
}

export interface Subscription {
  remove(): void;
}

export interface EventSource {
  addListener(event: string, listener: (e: SpeechEvent) => void): Subscription;
}

export interface ListenResult {
  text: string; // final transcript, or the last partial one; '' when nothing was heard
  error?: string;
}

export interface SpeechInput {
  listen(language: string, onPartial?: (text: string) => void): Promise<ListenResult>;
  cancel(): void;
}

export class PlatformSpeechInput implements SpeechInput {
  private active: { finish: (r: ListenResult) => void } | null = null;

  constructor(
    private readonly native: PlatformSpec,
    private readonly events: EventSource,
    private readonly timeoutMs = 15_000,
  ) {}

  listen(language: string, onPartial?: (text: string) => void): Promise<ListenResult> {
    this.cancel();
    return new Promise<ListenResult>((resolve) => {
      let partial = '';
      let sub: Subscription | null = null;
      const timer = setTimeout(() => finish({ text: partial }), this.timeoutMs);
      const finish = (r: ListenResult) => {
        if (this.active?.finish !== finish) return;
        this.active = null;
        clearTimeout(timer);
        sub?.remove();
        this.native.stopListening().catch(() => undefined);
        resolve(r);
      };
      this.active = { finish };
      sub = this.events.addListener(SPEECH_EVENT, (e) => {
        if (e.type === 'partial' && e.text) {
          partial = e.text;
          onPartial?.(e.text);
        } else if (e.type === 'final') finish({ text: e.text ?? partial });
        else if (e.type === 'error') finish({ text: partial, error: e.message ?? 'recognition failed' });
        else if (e.type === 'end') finish({ text: partial });
      });
      this.native
        .startListening(language)
        .then((ok) => {
          if (!ok) finish({ text: '', error: 'microphone permission denied or speech recognition unavailable' });
        })
        .catch((e: unknown) => finish({ text: '', error: e instanceof Error ? e.message : String(e) }));
    });
  }

  cancel(): void {
    this.active?.finish({ text: '' });
  }
}
