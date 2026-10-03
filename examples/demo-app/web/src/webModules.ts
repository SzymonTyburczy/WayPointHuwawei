// Web implementations of the Waypoint TurboModules.
//   WaypointCore      the C++ core compiled to WebAssembly (cpp/wasm), same JSON as waypoint-cli
//   WaypointPlatform  speech out (speechSynthesis) and in (SpeechRecognition) on the Web Speech API
//   WaypointLlm       absent: the guide uses the keyword baseline or a llama-server
import { DeviceEventEmitter } from 'react-native-web';

import type { Spec as CoreSpec } from '../../../../packages/waypoint-sdk/src/specs/NativeWaypointCore';
import type { Spec as PlatformSpec } from '../../../../packages/waypoint-sdk/src/specs/NativeWaypointPlatform';
import { SPEECH_EVENT } from '../../../../packages/waypoint-sdk/src/voice/SpeechInput';
// UMD loader shared with the playground (playground/waypoint-core.js)
import WaypointCoreWasm from '../../../../playground/waypoint-core.js';
// @ts-expect-error bundled as bytes by esbuild (loader: binary)
import wasmBytes from '../../../../cpp/build-wasm/waypoint.wasm';

interface WasmCore {
  callRaw(cmd: string, requestJson: string): string;
  traps: number;
  recover(): Promise<void>;
}

let wasm: WasmCore | null = null;

export async function loadCore(): Promise<void> {
  wasm = await WaypointCoreWasm.load(wasmBytes);
}

function call(cmd: string, requestJson: string): string {
  if (!wasm) return JSON.stringify({ error: 'core not loaded' });
  const traps = wasm.traps;
  const out = wasm.callRaw(cmd, requestJson);
  // A C++ exception traps in the wasm build; start a fresh instance for the next call.
  if (wasm.traps !== traps) void wasm.recover();
  return out;
}

const core: CoreSpec = {
  snapshot: () => JSON.stringify({ error: 'no shadow tree on the web; reading registered targets (plan B)' }),
  finalize: (raw) => call('finalize', `{"snapshot":${raw}}`),
  audit: (snap) => call('audit', `{"snapshot":${snap}}`),
  planStep: (goal, snap, history) => call('plan', `{"goal":${JSON.stringify(goal)},"snapshot":${snap},"history":${history}}`),
  parseAction: (text, candidates) => call('parse', `{"text":${JSON.stringify(text)},"candidates":${candidates}}`),
  labelRequest: (snap, nodeId) => call('label-request', `{"snapshot":${snap},"nodeId":${nodeId}}`),
  validateLabel: (snap, nodeId, label) =>
    call('validate-label', `{"snapshot":${snap},"nodeId":${nodeId},"label":${JSON.stringify(label)}}`),
  announce: (snap) => call('announce', `{"snapshot":${snap}}`),
} as CoreSpec;

// ---- speech -----------------------------------------------------------------

/** Replies are spoken only when this is on (the page's "Speak" switch). */
export const speechSettings = { speak: false };

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

let recognition: Recognition | null = null;

function emit(e: { type: string; text?: string; message?: string }) {
  DeviceEventEmitter.emit(SPEECH_EVENT, e);
}

const platform: PlatformSpec = {
  speak(text, language) {
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    if (!synth || !speechSettings.speak) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = language;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.cancel();
      synth.speak(u);
    });
  },
  stopSpeaking() {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    return Promise.resolve();
  },
  async startListening(language) {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return false;
    try {
      const r = new Ctor();
      r.lang = language;
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          emit({ type: res.isFinal ? 'final' : 'partial', text: res[0].transcript });
        }
      };
      r.onerror = (e) =>
        emit({ type: 'error', message: e.error === 'not-allowed' ? 'microphone permission denied or speech recognition unavailable' : e.error });
      r.onend = () => emit({ type: 'end' });
      recognition = r;
      r.start();
      return true;
    } catch {
      return false;
    }
  },
  stopListening() {
    recognition?.abort();
    recognition = null;
    return Promise.resolve();
  },
  isScreenReaderEnabled: () => Promise.resolve(false),
};

export const webModules: Record<string, unknown> = { WaypointCore: core, WaypointPlatform: platform };
