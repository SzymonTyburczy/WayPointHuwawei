import type { Action } from '../types';

/** Captions come from templates, never from the model (RFC-001 §9). */
export function captionFor(action: Action, targetName?: string): string {
  switch (action.a) {
    case 'tap':
      return targetName ? `Tap "${targetName}"` : 'Tap the highlighted item';
    case 'scroll':
      return action.dir === 'down' ? 'Scroll down' : 'Scroll up';
    case 'back':
      return 'Go back';
    case 'done':
      return 'You are there';
    case 'ask':
      return 'I am not sure how to continue. Try saying the goal another way.';
  }
}
