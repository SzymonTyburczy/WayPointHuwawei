// Declarative description of the demo app: "CityRide", a small transit app.
//
// The React Native screens (src/screens) and the host simulator (eval/src/simulator.ts)
// both render from this file, so the app on the emulator and the evaluation on
// the host stay in sync (docs/IMPLEMENTATION_PLAN.md, D5).
//
// Seeded defects (RFC-001 §12, eval/defects.json) are marked `// DEFECT Rn`.
// Condition A renders `label`; condition C adds `handLabel`; condition B adds the
// labels accepted from the audit through the override store.

export type ElementKind =
  | 'row' // full-width pressable row with a text
  | 'text' // paragraph
  | 'image' // decorative or content image
  | 'toggle' // text + switch control on the right
  | 'input' // optional caption above a text input
  | 'button' // primary button
  | 'icon'; // small icon-only control placed inline

export interface El {
  kind: ElementKind;
  testID: string;
  text?: string;
  label?: string; // accessibilityLabel present in the defective app
  handLabel?: string; // hand-written fix used in condition C
  role?: string | null; // accessibilityRole; null means none (seeded R4)
  icon?: string; // image source basename
  to?: string; // screen opened on press
  value?: boolean; // toggle state
  w?: number; // control size overrides (seeded R2)
  h?: number;
  fg?: string; // text colour override (seeded R3)
  fontSize?: number;
  caption?: string; // visible caption above an input (not associated with it)
}

export interface HeaderAction {
  testID: string;
  icon: string;
  label?: string;
  handLabel?: string;
  to: string;
}

export interface ScreenSpec {
  id: string;
  title: string;
  root: boolean; // tab root: no back button, tab bar visible
  headerAction?: HeaderAction;
  body: El[];
}

export interface TabSpec {
  testID: string;
  screen: string;
  icon: string;
  label?: string;
  handLabel: string;
}

// DEFECT R1 ×4: icon-only tabs without names. This is the centre of the demo:
// the guide sees four tabs called "" and has nothing to choose from.
export const TABS: TabSpec[] = [
  { testID: 'tab-home', screen: 'home', icon: 'ic_home', handLabel: 'Home' },
  { testID: 'tab-tickets', screen: 'tickets', icon: 'ic_ticket', handLabel: 'Tickets' },
  { testID: 'tab-profile', screen: 'profile', icon: 'ic_person', handLabel: 'Profile' },
  { testID: 'tab-settings', screen: 'settings', icon: 'ic_gear', handLabel: 'Settings' },
];

export const SCREENS: ScreenSpec[] = [
  {
    id: 'home',
    title: 'CityRide',
    root: true,
    // DEFECT R1: search icon without a name.
    headerAction: { testID: 'home-search', icon: 'ic_search', handLabel: 'Search', to: 'search' },
    body: [
      { kind: 'text', testID: 'home-greeting', text: 'Good morning, Anna' },
      { kind: 'row', testID: 'home-plan', text: 'Plan a journey', role: 'button', to: 'journey' },
      { kind: 'row', testID: 'home-alerts', text: 'Service alerts', role: 'button', to: 'alerts' },
      // DEFECT R6: promotional image without a name.
      { kind: 'image', testID: 'home-banner', icon: 'promo_summer_sale', handLabel: 'Summer sale: 20% off week passes' },
      // DEFECT R2 (error): 16 vp close control.
      { kind: 'icon', testID: 'home-banner-close', icon: 'ic_close', label: 'Hide offer', role: 'button', w: 16, h: 16 },
    ],
  },
  {
    id: 'tickets',
    title: 'Tickets',
    root: true,
    body: [
      { kind: 'row', testID: 'tickets-buy', text: 'Buy a ticket', role: 'button', to: 'ticket-type' },
      { kind: 'row', testID: 'tickets-history', text: 'Ticket history', role: 'button', to: 'ticket-history' },
      // DEFECT R3: light grey note.
      { kind: 'text', testID: 'tickets-validity', text: 'Tickets are valid for 24 hours after activation', fg: '#A0A0A0', fontSize: 14 },
    ],
  },
  {
    id: 'ticket-type',
    title: 'Ticket type',
    root: false,
    body: [
      { kind: 'row', testID: 'ticket-single', text: 'Single ticket', role: 'button' },
      { kind: 'row', testID: 'ticket-day', text: 'Day pass', role: 'button' },
      { kind: 'row', testID: 'ticket-week', text: 'Week pass', role: 'button' },
      // DEFECT R2 (error): 20 vp info control.
      { kind: 'icon', testID: 'ticket-info', icon: 'ic_info', label: 'Fare information', role: 'button', w: 20, h: 20 },
    ],
  },
  {
    id: 'ticket-history',
    title: 'Ticket history',
    root: false,
    body: [
      { kind: 'row', testID: 'history-list', text: 'Single ticket, 2 October', role: 'button' },
      { kind: 'row', testID: 'history-item-2', text: 'Day pass, 28 September', role: 'button' },
      // DEFECT R3: very light date stamp.
      { kind: 'text', testID: 'history-updated', text: 'Updated 3 minutes ago', fg: '#B0B0B0', fontSize: 13 },
    ],
  },
  {
    id: 'profile',
    title: 'Profile',
    root: true,
    // DEFECT R1: help icon without a name.
    headerAction: { testID: 'profile-help', icon: 'ic_help', handLabel: 'Help', to: 'support' },
    body: [
      { kind: 'text', testID: 'profile-name', text: 'Anna Kowalska', fontSize: 20 },
      // DEFECT R1: edit pencil without a name.
      { kind: 'icon', testID: 'profile-edit', icon: 'ic_edit', role: 'button', handLabel: 'Edit profile', to: 'edit-profile', w: 48, h: 48 },
      { kind: 'row', testID: 'profile-details', text: 'Details', role: 'button' },
      // DEFECT R5: a second row with the same name.
      { kind: 'row', testID: 'profile-details-2', text: 'Details', role: 'button' },
      { kind: 'row', testID: 'profile-logout', text: 'Log out', role: 'button', to: 'logout' },
    ],
  },
  {
    id: 'edit-profile',
    title: 'Edit profile',
    root: false,
    body: [
      { kind: 'input', testID: 'edit-name', label: 'Name', caption: 'Name' },
      // DEFECT R1: the caption is drawn above but not attached to the input.
      { kind: 'input', testID: 'edit-phone', caption: 'Phone number', handLabel: 'Phone number' },
      // DEFECT R4: Save has no role.
      { kind: 'button', testID: 'edit-save', text: 'Save', role: null },
    ],
  },
  {
    id: 'support',
    title: 'Help',
    root: false,
    body: [
      { kind: 'row', testID: 'support-faq', text: 'Frequently asked questions', role: 'button' },
      { kind: 'row', testID: 'support-contact', text: 'Contact us', role: 'button', to: 'contact' },
    ],
  },
  {
    id: 'contact',
    title: 'Contact us',
    root: false,
    body: [
      { kind: 'input', testID: 'contact-form', label: 'Your message', caption: 'Your message' },
      { kind: 'button', testID: 'contact-send', text: 'Send message', role: 'button' },
    ],
  },
  {
    id: 'logout',
    title: 'Log out?',
    root: false,
    body: [
      { kind: 'text', testID: 'logout-confirm', text: 'You will need to sign in again to use your tickets.' },
      { kind: 'button', testID: 'logout-yes', text: 'Log out', role: 'button' },
      { kind: 'button', testID: 'logout-cancel', text: 'Cancel', role: 'button' },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    root: true,
    body: [
      { kind: 'row', testID: 'settings-notifications', text: 'Notifications', role: 'button', to: 'notifications' },
      { kind: 'row', testID: 'settings-display', text: 'Display', role: 'button', to: 'display' },
      // DEFECT R4: Language row has no role.
      { kind: 'row', testID: 'settings-language', text: 'Language', role: null, to: 'language' },
      { kind: 'row', testID: 'settings-privacy', text: 'Privacy', role: 'button', to: 'privacy' },
    ],
  },
  {
    id: 'display',
    title: 'Display',
    root: false,
    body: [
      { kind: 'row', testID: 'display-font', text: 'Font size', role: 'button', to: 'font-size' },
      // DEFECT R2 (warning): 36 vp switch.
      { kind: 'toggle', testID: 'display-dark-mode', text: 'Dark mode', label: 'Dark mode', value: false, w: 36, h: 36 },
    ],
  },
  {
    id: 'font-size',
    title: 'Font size',
    root: false,
    body: [
      { kind: 'row', testID: 'fontsize-small', text: 'Small', role: 'radio' },
      { kind: 'row', testID: 'fontsize-medium', text: 'Medium', role: 'radio' },
      { kind: 'row', testID: 'fontsize-large', text: 'Large', role: 'radio' },
      // DEFECT R3: preview caption in light grey.
      { kind: 'text', testID: 'fontsize-preview', text: 'Preview: The next bus arrives in 4 minutes', fg: '#9E9E9E', fontSize: 14 },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    root: false,
    body: [
      { kind: 'toggle', testID: 'notif-push', text: 'Push notifications', label: 'Push notifications', value: true },
      // DEFECT R2 (error): 20 vp switch.
      { kind: 'toggle', testID: 'notif-email', text: 'Email updates', label: 'Email updates', value: false, w: 20, h: 20 },
    ],
  },
  {
    id: 'language',
    title: 'Language',
    root: false,
    body: [
      { kind: 'row', testID: 'lang-english', text: 'English', role: 'radio' },
      { kind: 'row', testID: 'lang-polski', text: 'Polski', role: 'radio' },
      { kind: 'row', testID: 'lang-deutsch', text: 'Deutsch', role: 'radio' },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    root: false,
    body: [
      { kind: 'row', testID: 'privacy-policy', text: 'Privacy policy', role: 'button', to: 'privacy-policy' },
      { kind: 'toggle', testID: 'privacy-analytics', text: 'Share usage data', label: 'Share usage data', value: false },
      // DEFECT R3: footer in pale grey.
      { kind: 'text', testID: 'privacy-footer', text: 'We never sell your data.', fg: '#BDBDBD', fontSize: 12 },
    ],
  },
  {
    id: 'privacy-policy',
    title: 'Privacy policy',
    root: false,
    body: [
      { kind: 'text', testID: 'privacy-policy-text', text: 'CityRide stores your tickets and journeys on this device.' },
      { kind: 'text', testID: 'privacy-policy-text-2', text: 'Location is used only while you plan a journey.' },
    ],
  },
  { id: 'search', title: 'Search', root: false, body: [{ kind: 'input', testID: 'search-input', label: 'Search stops and lines', caption: 'Stop or line' }] },
  { id: 'journey', title: 'Plan a journey', root: false, body: [{ kind: 'input', testID: 'journey-from', label: 'From', caption: 'From' }, { kind: 'input', testID: 'journey-to', label: 'To', caption: 'To' }] },
  { id: 'alerts', title: 'Service alerts', root: false, body: [{ kind: 'text', testID: 'alerts-none', text: 'No disruptions on your lines.' }] },
];

export const START_SCREEN = 'home';

export function screenById(id: string): ScreenSpec {
  const s = SCREENS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown screen ${id}`);
  return s;
}

export type Condition = 'A' | 'B' | 'C';

/** The accessibility label a control has in a given condition. */
export function resolveLabel(
  item: { label?: string; handLabel?: string; testID: string },
  condition: Condition,
  overrides: Record<string, string>,
): string | undefined {
  if (condition === 'B' && overrides[item.testID]) return overrides[item.testID];
  if (condition === 'C' && item.handLabel) return item.handLabel;
  return item.label;
}
