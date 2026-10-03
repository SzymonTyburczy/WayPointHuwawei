// Build-time switches for the demo app. Edit and rebuild; nothing here is
// exposed in the app's UI, so it never shows up in snapshots.
import type { BackendConfig } from 'waypoint-sdk';

import type { Condition } from './app/spec';

/**
 * A: defective app (the default, and what the demo starts from).
 * C: hand-written labels, the evaluation's upper bound.
 * Condition B is not a build: accept suggestions in the audit panel and the
 * override store applies them live.
 */
export const CONDITION: Condition = 'A';

/** Remote llama-server through `hdc rport tcp:8080 tcp:8080` (RFC §10). */
export const BACKEND: BackendConfig = {
  kind: 'local',
  modelPath: '/data/storage/el2/base/files/model.gguf',
  fallback: { kind: 'remote', url: 'http://127.0.0.1:8080' },
};

/** Test-only: press whatever the guide highlights (RFC §12 protocol). Never ship with true. */
export const EVAL_AUTOPILOT = false;

/** Speak captions with Core Speech Kit (stretch item 1). */
export const SPEAK_CAPTIONS = false;

/** Voice control (docs/VOICE.md): reply language ('auto' follows the speaker) and recognition language. */
export const VOICE_LANG: 'en' | 'pl' | 'auto' = 'auto';
export const LISTEN_LANGUAGE = 'en-US';
/** 'keyboard' types commands instead of speaking them (an emulator without a microphone). */
export const VOICE_INPUT: 'speech' | 'keyboard' = 'speech';
