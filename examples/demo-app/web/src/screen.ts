// The phone screen the app renders into. React Native measures in "window"
// coordinates; on the web the window is the whole page, so the shim maps page
// pixels back to the 360 x 780 screen (and undoes the frame's CSS scale).
import { WINDOW } from '../../src/app/layout';

let element: HTMLElement | null = null;

export function setScreenElement(el: HTMLElement): void {
  element = el;
}

export function screenElement(): HTMLElement | null {
  return element;
}

/** Page rectangle of the screen and its scale (rendered px per vp). */
export function screenTransform(): { left: number; top: number; scale: number } {
  if (!element) return { left: 0, top: 0, scale: 1 };
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, scale: r.width / WINDOW.w || 1 };
}

export const SCREEN = { width: WINDOW.w, height: WINDOW.h, scale: 1, fontScale: 1 };
