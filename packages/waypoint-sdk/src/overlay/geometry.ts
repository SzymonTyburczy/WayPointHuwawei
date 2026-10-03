// Pure placement maths for the highlight ring, the caption and audit boxes.
import type { Rect } from '../types';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clampBox(b: Box, viewport: Rect): Box {
  const left = Math.max(viewport.x, b.left);
  const top = Math.max(viewport.y, b.top);
  const right = Math.min(viewport.x + viewport.w, b.left + b.width);
  const bottom = Math.min(viewport.y + viewport.h, b.top + b.height);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Ring around `frame`, grown by `pad` and kept inside the viewport. */
export function ringBox(frame: Rect, viewport: Rect, pad = 6): Box {
  return clampBox({ left: frame.x - pad, top: frame.y - pad, width: frame.w + 2 * pad, height: frame.h + 2 * pad }, viewport);
}

export interface CaptionPlacement {
  top: number;
  placement: 'below' | 'above' | 'bottom';
}

/**
 * Caption goes below the ring when there is room, otherwise above it; with no
 * target it sits at the bottom of the viewport.
 */
export function captionPlacement(ring: Box | null, viewport: Rect, height = 64, margin = 12): CaptionPlacement {
  const bottomEdge = viewport.y + viewport.h;
  if (!ring) return { top: bottomEdge - height - margin, placement: 'bottom' };
  const below = ring.top + ring.height + margin;
  if (below + height <= bottomEdge) return { top: below, placement: 'below' };
  const above = ring.top - margin - height;
  if (above >= viewport.y) return { top: above, placement: 'above' };
  return { top: bottomEdge - height - margin, placement: 'bottom' };
}

/** Audit boxes: the finding frame itself, clamped, with a minimum visible size. */
export function findingBox(frame: Rect, viewport: Rect, minSide = 8): Box {
  const w = Math.max(frame.w, minSide);
  const h = Math.max(frame.h, minSide);
  return clampBox({ left: frame.x - (w - frame.w) / 2, top: frame.y - (h - frame.h) / 2, width: w, height: h }, viewport);
}
