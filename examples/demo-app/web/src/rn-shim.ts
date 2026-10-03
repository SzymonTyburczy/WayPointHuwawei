// `react-native` for the web build: react-native-web plus the few things the
// demo app and the SDK take from React Native that the web lacks.
import { createContext } from 'react';
import { UIManager } from 'react-native-web';

import { SCREEN, screenTransform } from './screen';
import { webModules } from './webModules';

export * from 'react-native-web';

/** TurboModules: the core runs as WebAssembly, the platform module on Web Speech, no local model. */
export const TurboModuleRegistry = {
  get<T>(name: string): T | null {
    return (webModules[name] as T | undefined) ?? null;
  },
  getEnforcing<T>(name: string): T {
    const m = webModules[name];
    if (!m) throw new Error(`TurboModule ${name} is not available on the web`);
    return m as T;
  },
};

export const RootTagContext = createContext<number>(1);

/** The window is the phone screen, not the browser window. */
export function useWindowDimensions() {
  return SCREEN;
}

// measureInWindow → screen coordinates in vp.
const measureInWindow = UIManager.measureInWindow;
UIManager.measureInWindow = (node: unknown, callback: (x: number, y: number, w: number, h: number) => void) =>
  measureInWindow.call(UIManager, node, (x: number, y: number, w: number, h: number) => {
    const t = screenTransform();
    callback((x - t.left) / t.scale, (y - t.top) / t.scale, w / t.scale, h / t.scale);
  });
