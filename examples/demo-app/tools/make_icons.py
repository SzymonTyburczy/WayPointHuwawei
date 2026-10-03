#!/usr/bin/env python3
"""Draws the demo app's icons as small PNGs (pure Python, no dependencies).

The icons are deliberately plain: their file names (ic_gear, ic_home, ...) are what
the auditor sees, which is the realistic case for icon-only controls.
Run: python3 tools/make_icons.py
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'icons')
S = 72  # 24 vp at 3x
INK = (40, 30, 70)


def png(path, w, h, pixel):
    rows = b''
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            row += bytes(pixel(x, y))
        rows += bytes(row)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(data)


def icon(name, inside):
    """inside(u, v) -> bool for u, v in [-1, 1]; 3x3 supersampling for smooth edges."""
    def pixel(x, y):
        hits = 0
        for sy in range(3):
            for sx in range(3):
                u = ((x + (sx + 0.5) / 3) / S) * 2 - 1
                v = ((y + (sy + 0.5) / 3) / S) * 2 - 1
                hits += 1 if inside(u, v) else 0
        return (*INK, int(255 * hits / 9))
    png(os.path.join(OUT, f'{name}.png'), S, S, pixel)


def ring(u, v, r0, r1):
    d = math.hypot(u, v)
    return r0 <= d <= r1


def seg(u, v, ax, ay, bx, by, w):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(u - ax - t * dx, v - ay - t * dy) <= w


SHAPES = {
    'ic_home': lambda u, v: (abs(u) <= 0.6 and 0 <= v <= 0.75) or (v <= 0.05 and v >= -0.8 + abs(u) * 1.1 and abs(u) <= 0.85),
    'ic_ticket': lambda u, v: abs(u) <= 0.85 and abs(v) <= 0.5 and math.hypot(abs(u) - 0.85, v) > 0.2,
    'ic_person': lambda u, v: math.hypot(u, v + 0.4) <= 0.32 or (v >= 0.15 and math.hypot(u, v - 0.85) <= 0.7 and v <= 0.85),
    'ic_gear': lambda u, v: ring(u, v, 0.25, 0.6) or (0.6 <= math.hypot(u, v) <= 0.85 and math.cos(8 * math.atan2(v, u)) > 0.3),
    'ic_search': lambda u, v: ring(u + 0.15, v + 0.15, 0.35, 0.52) or seg(u, v, 0.25, 0.25, 0.8, 0.8, 0.12),
    'ic_help': lambda u, v: ring(u, v, 0.72, 0.88) or ring(u, v + 0.15, 0.22, 0.36) and v < -0.05 or seg(u, v, 0, 0.0, 0, 0.25, 0.1) or math.hypot(u, v - 0.5) <= 0.1,
    'ic_edit': lambda u, v: seg(u, v, -0.6, 0.6, 0.6, -0.6, 0.16) or seg(u, v, -0.75, 0.75, -0.6, 0.6, 0.08),
    'ic_close': lambda u, v: seg(u, v, -0.6, -0.6, 0.6, 0.6, 0.12) or seg(u, v, -0.6, 0.6, 0.6, -0.6, 0.12),
    'ic_info': lambda u, v: ring(u, v, 0.72, 0.88) or seg(u, v, 0, -0.05, 0, 0.45, 0.11) or math.hypot(u, v + 0.35) <= 0.12,
    'ic_arrow_back': lambda u, v: seg(u, v, -0.6, 0, 0.7, 0, 0.11) or seg(u, v, -0.6, 0, -0.1, -0.5, 0.11) or seg(u, v, -0.6, 0, -0.1, 0.5, 0.11),
}


def banner():
    w, h = 984, 360  # 328 x 120 vp at 3x
    def pixel(x, y):
        t = x / w
        r, g, b = int(74 + 150 * t), int(20 + 60 * (1 - t)), int(140 - 40 * t)
        if math.hypot(x - w * 0.8, y - h * 0.5) < h * 0.35:
            r, g, b = 255, 213, 79
        return (r, g, b, 255)
    png(os.path.join(OUT, '..', 'promo_summer_sale.png'), w, h, pixel)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, shape in SHAPES.items():
        icon(name, shape)
    banner()
    print('icons written to', os.path.normpath(OUT))
