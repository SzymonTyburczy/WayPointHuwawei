#!/usr/bin/env bash
# Syntax-checks the Waypoint cxxTurboModules against the React Native headers that
# ship inside the RNOH HAR (the exact ReactCommon copy RNOH builds with), without
# DevEco or the HarmonyOS SDK. It covers the shadow-tree adapter, the walker
# instantiation and the JSI/promise plumbing. Modules that include RNOH/ArkUI
# headers (WaypointPlatformTurboModule, WaypointPackage.h) need the OHOS SDK and are
# checked by the DevEco build only.
#
# Usage: harmony/tools/check_rnoh_headers.sh [rnoh-version]
set -euo pipefail

VERSION="${1:-0.77.75}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${WAYPOINT_RNOH_WORK:-$ROOT/build/rnoh-headers}"
CXX="${CXX:-clang++}"
mkdir -p "$WORK"
cd "$WORK"

if [ ! -d har/package ]; then
  npm pack "@react-native-oh/react-native-harmony@$VERSION" >/dev/null
  tar xzf "react-native-oh-react-native-harmony-$VERSION.tgz"
  mkdir -p har && tar xzf package/react_native_openharmony.har -C har
fi
CPP="$WORK/har/package/src/main/cpp"
TP="$CPP/third-party"
RC="$TP/rn/ReactCommon"

if [ ! -f glog-build/glog/logging.h ]; then
  cmake -S "$TP/glog" -B glog-build -DWITH_GFLAGS=OFF -DBUILD_TESTING=OFF >/dev/null
fi

INC=(-I"$RC" -I"$RC/jsi" -I"$RC/callinvoker" -I"$RC/runtimeexecutor" -I"$RC/react/nativemodule/core"
     -I"$RC/yoga" -I"$RC/react/renderer/graphics/platform/cxx"
     -I"$RC/react/renderer/components/view/platform/android"
     -I"$RC/react/renderer/textlayoutmanager/platform/android"
     -I"$TP/folly" -I"$TP/double-conversion" -I"$TP/fmt/include" -I"$TP/fast_float/include"
     -I"$WORK/glog-build" -I"$TP/glog/src"
     -I"$ROOT/cpp/core/include" -I"$ROOT/cpp/llm/include" -I"$ROOT/harmony/waypoint/src/main/cpp")
for d in "$TP"/boost/libs/*/include; do INC+=(-I"$d"); done
DEFS=(-DFOLLY_NO_CONFIG=1 -DFOLLY_MOBILE=1 -DFOLLY_HAVE_CLOCK_GETTIME=1)

status=0
for src in WaypointCoreTurboModule.cpp WaypointLlmTurboModule.cpp; do
  if "$CXX" -std=c++20 -fsyntax-only "${DEFS[@]}" "${INC[@]}" "$ROOT/harmony/waypoint/src/main/cpp/$src"; then
    echo "ok   $src (RNOH $VERSION headers)"
  else
    echo "FAIL $src"
    status=1
  fi
done
exit $status
