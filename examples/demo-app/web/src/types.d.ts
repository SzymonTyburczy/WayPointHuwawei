declare module 'react-native-web' {
  export * from 'react-native';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const UIManager: any;
}
declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export function createRoot(el: Element): { render(node: ReactNode): void; unmount(): void };
}
