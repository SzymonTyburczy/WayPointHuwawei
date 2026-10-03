#!/usr/bin/env bash
# Builds the core for the browser: cpp/build-wasm/waypoint.wasm (wasm32-wasi, ~200 KB).
# Uses Zig's bundled clang and libc++ ("pip install ziglang" provides it; a zig on
# PATH works too). No Emscripten needed: the module imports only three WASI calls.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-$ROOT/cpp/build-wasm/waypoint.wasm}"
mkdir -p "$(dirname "$OUT")"
if command -v zig >/dev/null 2>&1; then ZIG=(zig); else ZIG=(python3 -m ziglang); fi
"${ZIG[@]}" c++ -target wasm32-wasi -Os -std=c++17 -mexec-model=reactor \
  -I"$ROOT/cpp/core/include" "$ROOT"/cpp/core/src/*.cpp "$ROOT/cpp/wasm/waypoint_wasm.cpp" \
  -o "$OUT" 2> >(grep -v -E "nullability|_Nullable|_Nonnull|In file included|\^|^\s*[0-9]+ \||insert '" >&2 || true)
echo "built $OUT ($(wc -c < "$OUT") bytes)"
