import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';

import * as nav from './navigation';

type NavAction = { type: 'push'; screen: string } | { type: 'back' } | { type: 'tab'; screen: string } | { type: 'reset' };

function reducer(state: nav.NavState, action: NavAction): nav.NavState {
  switch (action.type) {
    case 'push':
      return nav.push(state, action.screen);
    case 'back':
      return nav.back(state);
    case 'tab':
      return nav.switchTab(state, action.screen);
    case 'reset':
      return nav.initialNav;
  }
}

interface NavValue {
  state: nav.NavState;
  push: (screen: string) => void;
  back: () => void;
  tab: (screen: string) => void;
  reset: () => void;
}

const NavContext = createContext<NavValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, nav.initialNav);
  const value = useMemo<NavValue>(
    () => ({
      state,
      push: (screen) => dispatch({ type: 'push', screen }),
      back: () => dispatch({ type: 'back' }),
      tab: (screen) => dispatch({ type: 'tab', screen }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [state],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue {
  const v = useContext(NavContext);
  if (!v) throw new Error('useNav outside NavProvider');
  return v;
}
