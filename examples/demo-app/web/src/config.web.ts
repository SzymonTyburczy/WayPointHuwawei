// src/config.ts for the web build. The page's controls change these values and
// remount the app, so each switch behaves like a rebuild of the device app.
import type { BackendConfig } from 'waypoint-sdk';

import { LexicalBackend } from '../../../../eval/src/baseline';
import type { Condition } from '../../src/app/spec';

export let CONDITION: Condition = 'A';
export let BACKEND: BackendConfig = { kind: 'custom', backend: new LexicalBackend() };
export const EVAL_AUTOPILOT = false;
export let SPEAK_CAPTIONS = false;
export const VOICE_LANG: 'en' | 'pl' | 'auto' = 'auto';
export let LISTEN_LANGUAGE = 'en-US';
export let VOICE_INPUT: 'speech' | 'keyboard' = 'keyboard';

export interface WebConfig {
  condition: Condition;
  /** '' = keyword baseline; otherwise a llama-server URL. */
  llamaUrl: string;
  speak: boolean;
  listenLanguage: string;
  voiceInput: 'speech' | 'keyboard';
}

export function configure(c: WebConfig): void {
  CONDITION = c.condition;
  BACKEND = c.llamaUrl
    ? { kind: 'remote', url: c.llamaUrl }
    : { kind: 'custom', backend: new LexicalBackend() };
  SPEAK_CAPTIONS = c.speak;
  LISTEN_LANGUAGE = c.listenLanguage;
  VOICE_INPUT = c.voiceInput;
}
