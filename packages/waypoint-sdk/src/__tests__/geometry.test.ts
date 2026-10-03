import { captionFor } from '../guide/captions';
import { captionPlacement, findingBox, ringBox } from '../overlay/geometry';
import { OverrideStore } from '../overrides';

const viewport = { x: 0, y: 0, w: 360, h: 780 };

test('ring grows by the padding', () => {
  expect(ringBox({ x: 100, y: 200, w: 50, h: 40 }, viewport)).toEqual({ left: 94, top: 194, width: 62, height: 52 });
});

test('ring is clamped to the viewport', () => {
  expect(ringBox({ x: 0, y: 0, w: 48, h: 48 }, viewport)).toEqual({ left: 0, top: 0, width: 54, height: 54 });
  expect(ringBox({ x: 320, y: 740, w: 40, h: 40 }, viewport)).toEqual({ left: 314, top: 734, width: 46, height: 46 });
});

test('caption goes below, then above, then to the bottom', () => {
  expect(captionPlacement({ left: 0, top: 100, width: 10, height: 50 }, viewport, 64)).toEqual({ top: 162, placement: 'below' });
  expect(captionPlacement({ left: 0, top: 700, width: 10, height: 60 }, viewport, 64)).toEqual({ top: 624, placement: 'above' });
  expect(captionPlacement({ left: 0, top: 0, width: 10, height: 780 }, viewport, 64)).toEqual({ top: 704, placement: 'bottom' });
  expect(captionPlacement(null, viewport, 64)).toEqual({ top: 704, placement: 'bottom' });
});

test('tiny findings get a minimum visible box', () => {
  expect(findingBox({ x: 100, y: 100, w: 2, h: 2 }, viewport)).toEqual({ left: 97, top: 97, width: 8, height: 8 });
});

test('captions come from templates', () => {
  expect(captionFor({ a: 'tap', id: 1, index: 0 }, 'Display')).toBe('Tap "Display"');
  expect(captionFor({ a: 'scroll', dir: 'down' })).toBe('Scroll down');
  expect(captionFor({ a: 'back' })).toBe('Go back');
  expect(captionFor({ a: 'done' })).toBe('You are there');
});

test('override store notifies subscribers', () => {
  const s = new OverrideStore();
  const seen: number[] = [];
  const off = s.subscribe(() => seen.push(s.getVersion()));
  s.set('tab-settings', 'Settings');
  s.setMany({ 'tab-home': 'Home' });
  off();
  s.clear();
  expect(seen).toEqual([1, 2]);
  expect(s.get('tab-settings')).toBeUndefined();
  expect(s.get(undefined)).toBeUndefined();
});
