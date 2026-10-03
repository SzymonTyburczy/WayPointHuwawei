// Host simulator of the demo app: renders the shared screen spec into raw UiNode
// records with the same layout constants and accessibility props as the React
// Native screens, applies guide actions, and lets the real C++ core finalize the
// result. The emulator run stays authoritative; this is the regression net.
import { COLORS, FONT, GAP, HEADER_H, HEIGHTS, ICON, ICON_BUTTON, PAD, TAB_BAR_H, WINDOW } from '../../examples/demo-app/src/app/layout';
import * as nav from '../../examples/demo-app/src/app/navigation';
import { SCREENS, TABS, resolveLabel, screenById, type Condition, type El } from '../../examples/demo-app/src/app/spec';
import type { CoreApi } from '../../packages/waypoint-sdk/src/core/CoreApi';
import type { Action, Rgba, Snapshot, UiNode } from '../../packages/waypoint-sdk/src/types';

function rgba(hex: string): Rgba {
  const h = hex.replace('#', '');
  const v = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: v(0), g: v(2), b: v(4), a: h.length === 8 ? v(6) : 1 };
}

type Handler = () => nav.NavState;

export class Simulator {
  state: nav.NavState = nav.initialNav;
  toggles: Record<string, boolean> = {};
  private handlers = new Map<string, Handler>();

  constructor(
    private readonly core: CoreApi,
    public condition: Condition = 'A',
    public overrides: Record<string, string> = {},
  ) {}

  reset(): void {
    this.state = nav.initialNav;
    this.toggles = {};
  }

  /** Opens a screen directly, with a back stack for non-root screens. */
  open(screen: string): void {
    const spec = screenById(screen);
    this.state = spec.root ? { stack: [screen] } : { stack: ['home', screen] };
  }

  get screen(): string {
    return nav.current(this.state);
  }

  canGoBack(): boolean {
    return nav.canGoBack(this.state);
  }

  private label(item: { label?: string; handLabel?: string; testID: string }): string | undefined {
    return resolveLabel(item, this.condition, this.overrides);
  }

  rawSnapshot(): Snapshot {
    const spec = screenById(this.screen);
    const nodes: UiNode[] = [];
    this.handlers.clear();
    let nextId = 1;
    const add = (parent: number | null, depth: number, n: Partial<UiNode> & Pick<UiNode, 'component' | 'frame'>): number => {
      const id = nextId++;
      nodes.push({ id, parent, depth, visible: true, opacity: 1, a11y: { accessible: false, hidden: false }, actionable: false, name: '', ...n });
      return id;
    };
    const text = (parent: number, depth: number, frame: UiNode['frame'], value: string, fg: string, fontSize: number, extra: Partial<UiNode> = {}) =>
      add(parent, depth, { component: 'Paragraph', frame, text: value, fg: rgba(fg), fontSize, a11y: { accessible: true, hidden: false }, ...extra });

    const root = add(null, 0, { component: 'View', frame: { x: 0, y: 0, w: WINDOW.w, h: WINDOW.h }, bg: rgba(COLORS.background) });

    // Header.
    const header = add(root, 1, { component: 'View', frame: { x: 0, y: 0, w: WINDOW.w, h: HEADER_H }, bg: rgba(COLORS.header) });
    if (!spec.root) {
      const b = add(header, 2, {
        component: 'View',
        frame: { x: 4, y: 4, w: ICON_BUTTON, h: ICON_BUTTON },
        a11y: { accessible: true, hidden: false, role: 'button', label: 'Back' },
        testID: 'header-back',
      });
      add(b, 3, { component: 'Image', frame: { x: 16, y: 16, w: ICON, h: ICON }, imageSrc: 'ic_arrow_back' });
      this.handlers.set('header-back', () => nav.back(this.state));
    }
    text(header, 2, { x: spec.root ? PAD : 60, y: 12, w: 240, h: 32 }, spec.title, COLORS.text, FONT.title, {
      bold: true,
      a11y: { accessible: true, hidden: false, role: 'header' },
      testID: `title-${spec.id}`,
    });
    if (spec.headerAction) {
      const a = spec.headerAction;
      const b = add(header, 2, {
        component: 'View',
        frame: { x: WINDOW.w - 4 - ICON_BUTTON, y: 4, w: ICON_BUTTON, h: ICON_BUTTON },
        a11y: { accessible: true, hidden: false, role: 'button', label: this.label(a) },
        testID: a.testID,
      });
      add(b, 3, { component: 'Image', frame: { x: WINDOW.w - 4 - ICON_BUTTON + 12, y: 16, w: ICON, h: ICON }, imageSrc: a.icon });
      this.handlers.set(a.testID, () => nav.push(this.state, a.to));
    }

    // Body.
    const bodyH = WINDOW.h - HEADER_H - (spec.root ? TAB_BAR_H : 0);
    const scroll = add(root, 1, { component: 'ScrollView', frame: { x: 0, y: HEADER_H, w: WINDOW.w, h: bodyH } });
    const content = add(scroll, 2, { component: 'View', frame: { x: 0, y: HEADER_H, w: WINDOW.w, h: bodyH } });
    let y = HEADER_H + GAP;
    for (const el of spec.body) y = this.renderElement(el, content, 3, y, add, text);

    // Tab bar.
    if (spec.root) {
      const bar = add(root, 1, { component: 'View', frame: { x: 0, y: WINDOW.h - TAB_BAR_H, w: WINDOW.w, h: TAB_BAR_H }, bg: rgba(COLORS.tabBar) });
      const w = WINDOW.w / TABS.length;
      TABS.forEach((t, i) => {
        const tab = add(bar, 2, {
          component: 'View',
          frame: { x: i * w, y: WINDOW.h - TAB_BAR_H, w, h: TAB_BAR_H },
          a11y: { accessible: true, hidden: false, role: 'tab', label: this.label(t), selected: nav.activeTab(this.state) === t.screen },
          testID: t.testID,
        });
        add(tab, 3, { component: 'Image', frame: { x: i * w + (w - ICON) / 2, y: WINDOW.h - TAB_BAR_H + 20, w: ICON, h: ICON }, imageSrc: t.icon });
        this.handlers.set(t.testID, () => nav.switchTab(this.state, t.screen));
      });
    }

    return { rev: '', surfaceId: 1, viewport: { x: 0, y: 0, w: WINDOW.w, h: WINDOW.h }, nodes };
  }

  private renderElement(
    el: El,
    parent: number,
    depth: number,
    y: number,
    add: (parent: number | null, depth: number, n: Partial<UiNode> & Pick<UiNode, 'component' | 'frame'>) => number,
    text: (parent: number, depth: number, frame: UiNode['frame'], value: string, fg: string, fontSize: number, extra?: Partial<UiNode>) => number,
  ): number {
    const role = el.role === null ? undefined : el.role;
    const go = el.to ? () => nav.push(this.state, el.to!) : undefined;
    switch (el.kind) {
      case 'row': {
        const row = add(parent, depth, {
          component: 'View',
          frame: { x: 0, y, w: WINDOW.w, h: HEIGHTS.row },
          a11y: { accessible: true, hidden: false, role, label: this.label(el) },
          testID: el.testID,
        });
        text(row, depth + 1, { x: PAD, y: y + 16, w: WINDOW.w - 2 * PAD, h: 24 }, el.text ?? '', COLORS.text, FONT.body);
        if (go) this.handlers.set(el.testID, go);
        return y + HEIGHTS.row;
      }
      case 'text': {
        const size = el.fontSize ?? FONT.text;
        const h = size >= 20 ? HEIGHTS.textLarge : HEIGHTS.text;
        text(parent, depth, { x: PAD, y, w: WINDOW.w - 2 * PAD, h }, el.text ?? '', el.fg ?? COLORS.text, size, { testID: el.testID });
        return y + h + GAP;
      }
      case 'image': {
        const label = this.label(el);
        add(parent, depth, {
          component: 'Image',
          frame: { x: PAD, y, w: WINDOW.w - 2 * PAD, h: HEIGHTS.image },
          imageSrc: el.icon,
          testID: el.testID,
          a11y: { accessible: !!label, hidden: false, label, role: label ? 'image' : undefined },
        });
        return y + HEIGHTS.image + GAP;
      }
      case 'icon': {
        const w = el.w ?? HEIGHTS.icon;
        const h = el.h ?? HEIGHTS.icon;
        const b = add(parent, depth, {
          component: 'View',
          frame: { x: PAD, y, w, h },
          a11y: { accessible: true, hidden: false, role, label: this.label(el) },
          testID: el.testID,
        });
        const iw = Math.min(ICON, w);
        const ih = Math.min(ICON, h);
        add(b, depth + 1, { component: 'Image', frame: { x: PAD + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih }, imageSrc: el.icon });
        if (go) this.handlers.set(el.testID, go);
        return y + h + GAP;
      }
      case 'toggle': {
        const container = add(parent, depth, { component: 'View', frame: { x: 0, y, w: WINDOW.w, h: HEIGHTS.toggle } });
        text(container, depth + 1, { x: PAD, y: y + 16, w: 240, h: 24 }, el.text ?? '', COLORS.text, FONT.body);
        const w = el.w ?? 48;
        const h = el.h ?? 48;
        const on = this.toggles[el.testID] ?? el.value ?? false;
        add(container, depth + 1, {
          component: 'View',
          frame: { x: WINDOW.w - PAD - w, y: y + (HEIGHTS.toggle - h) / 2, w, h },
          bg: rgba(on ? COLORS.switchOn : COLORS.switchOff),
          a11y: { accessible: true, hidden: false, role: 'switch', label: this.label(el), checked: on ? 'true' : 'false' },
          testID: el.testID,
        });
        this.handlers.set(el.testID, () => {
          this.toggles[el.testID] = !on;
          return this.state;
        });
        return y + HEIGHTS.toggle;
      }
      case 'input': {
        if (el.caption) {
          text(parent, depth, { x: PAD, y, w: WINDOW.w - 2 * PAD, h: HEIGHTS.inputCaption }, el.caption, COLORS.secondary, 14);
          y += HEIGHTS.inputCaption + 4;
        }
        add(parent, depth, {
          component: 'TextInput',
          frame: { x: PAD, y, w: WINDOW.w - 2 * PAD, h: HEIGHTS.input },
          a11y: { accessible: true, hidden: false, label: this.label(el) },
          testID: el.testID,
        });
        return y + HEIGHTS.input + GAP;
      }
      case 'button': {
        const b = add(parent, depth, {
          component: 'View',
          frame: { x: PAD, y, w: WINDOW.w - 2 * PAD, h: HEIGHTS.button },
          bg: rgba(COLORS.primary),
          a11y: { accessible: true, hidden: false, role, label: this.label(el) },
          testID: el.testID,
        });
        text(b, depth + 1, { x: PAD, y: y + 12, w: WINDOW.w - 2 * PAD, h: 24 }, el.text ?? '', COLORS.onPrimary, FONT.body, { bold: true });
        if (go) this.handlers.set(el.testID, go);
        return y + HEIGHTS.button + GAP;
      }
    }
  }

  snapshot(): Snapshot {
    return this.core.finalize(this.rawSnapshot());
  }

  /** Test-only autopilot: performs what the guide highlighted. Returns false for a no-op. */
  apply(action: Action, snap: Snapshot): boolean {
    if (action.a === 'back') {
      const before = this.state;
      this.state = nav.back(this.state);
      return before !== this.state;
    }
    if (action.a !== 'tap') return false;
    const testID = snap.nodes.find((n) => n.id === action.id)?.testID;
    // Re-render so handlers belong to the screen the action was planned on.
    this.rawSnapshot();
    const handler = testID ? this.handlers.get(testID) : undefined;
    if (!handler) return false;
    this.state = handler();
    return true;
  }

  isVisible(testID: string, snap: Snapshot = this.snapshot()): boolean {
    return snap.nodes.some((n) => n.testID === testID && n.visible);
  }

  static screenIds(): string[] {
    return SCREENS.map((s) => s.id);
  }
}
