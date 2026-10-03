// Layout constants shared by the React Native screens and the host simulator.
// All values are vp. The simulator assumes a 360 x 780 window.

export const WINDOW = { w: 360, h: 780 };
export const HEADER_H = 56;
export const TAB_BAR_H = 64;
export const ICON_BUTTON = 48;
export const ICON = 24;
export const PAD = 16;
export const GAP = 8;

export const HEIGHTS = {
  row: 56,
  text: 24,
  textLarge: 32,
  image: 120,
  toggle: 56,
  inputCaption: 20,
  input: 48,
  button: 48,
  icon: 48, // default for kind "icon"; seeded R2 defects override w/h
};

export const COLORS = {
  background: '#FFFFFF',
  text: '#111111',
  secondary: '#555555', // 7.5:1 on white
  header: '#FFFFFF',
  tabBar: '#F6F3FA',
  primary: '#4A148C',
  onPrimary: '#FFFFFF',
  switchOn: '#4A148C',
  switchOff: '#757575',
};

export const FONT = { title: 22, body: 16, text: 15 };
