// Plan B (RFC-001 §6): when the shadow tree is not reachable, components register
// themselves here and frames come from measureInWindow. The records become the
// same raw UiNode format the walker emits, and the C++ core's finalize() gives
// them the same semantics. Slower and less complete (no nesting, no colours
// unless declared), but the rest of the design is unchanged.
import type { Rect, Snapshot, UiNode } from '../types';

export interface TargetInfo {
  component?: string; // "View" by default; "Paragraph", "Image", "TextInput", "Switch"
  testID?: string;
  label?: string;
  role?: string;
  text?: string;
  pressable?: boolean; // has an onPress handler
  accessible?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  selected?: boolean;
  checked?: boolean;
  imageSrc?: string;
  fontSize?: number;
  fg?: string; // hex
  bg?: string; // hex
}

/** The part of a host component ref the registry needs. */
export interface Measurable {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
}

interface Entry {
  key: number;
  info: TargetInfo;
  ref: { current: Measurable | null };
}

function hex(h: string | undefined) {
  if (!h || !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) return undefined;
  const v = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: v(1), g: v(3), b: v(5), a: h.length === 9 ? v(7) : 1 };
}

function measure(ref: Measurable, timeoutMs: number): Promise<Rect | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      ref.measureInWindow((x, y, w, h) => {
        clearTimeout(timer);
        resolve({ x, y, w, h });
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export class TargetRegistry {
  private entries = new Map<number, Entry>();
  private nextKey = 1;

  get size(): number {
    return this.entries.size;
  }

  register(ref: { current: Measurable | null }, info: TargetInfo): () => void {
    const key = this.nextKey++;
    this.entries.set(key, { key, info, ref });
    return () => this.entries.delete(key);
  }

  update(ref: { current: Measurable | null }, info: TargetInfo): void {
    for (const e of this.entries.values()) if (e.ref === ref) e.info = info;
  }

  /** Raw snapshot in reading order (top-to-bottom, then left-to-right). Call finalize() on it. */
  async rawSnapshot(surfaceId: number, viewport: Rect, timeoutMs = 200): Promise<Snapshot> {
    const measured = await Promise.all(
      [...this.entries.values()].map(async (e) => ({ e, frame: e.ref.current ? await measure(e.ref.current, timeoutMs) : null })),
    );
    const placed = measured.filter((m): m is { e: Entry; frame: Rect } => m.frame !== null);
    placed.sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x || a.e.key - b.e.key);

    const nodes: UiNode[] = [
      {
        id: 1,
        parent: null,
        depth: 0,
        component: 'View',
        frame: viewport,
        visible: true,
        opacity: 1,
        a11y: { accessible: false, hidden: false },
        actionable: false,
        name: '',
      },
    ];
    for (const { e, frame } of placed) {
      const i = e.info;
      const inView =
        frame.w > 0 && frame.h > 0 && frame.x < viewport.x + viewport.w && frame.x + frame.w > viewport.x && frame.y < viewport.y + viewport.h && frame.y + frame.h > viewport.y;
      nodes.push({
        id: 1000 + e.key,
        parent: 1,
        depth: 1,
        component: i.component ?? 'View',
        frame,
        visible: inView && !i.hidden,
        opacity: 1,
        text: i.text,
        fontSize: i.fontSize,
        fg: hex(i.fg),
        bg: hex(i.bg),
        imageSrc: i.imageSrc,
        testID: i.testID,
        pressable: i.pressable,
        a11y: {
          accessible: i.accessible ?? !!(i.pressable || i.label || i.role),
          label: i.label,
          role: i.role,
          hidden: !!i.hidden,
          disabled: i.disabled,
          selected: i.selected,
          checked: i.checked === undefined ? undefined : i.checked ? 'true' : 'false',
        },
        actionable: false,
        name: '',
      });
    }
    return { rev: '', surfaceId, viewport, nodes };
  }
}
