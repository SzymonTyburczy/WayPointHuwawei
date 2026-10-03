// WaypointCore: cxxTurboModule, synchronous over JSI (RFC-001 §11).
// Spec: packages/waypoint-sdk/src/specs/NativeWaypointCore.ts
#pragma once

#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>

namespace waypoint::rnoh {

class WaypointCoreTurboModule : public facebook::react::TurboModule {
 public:
  static constexpr const char* kName = "WaypointCore";

  explicit WaypointCoreTurboModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);

  // Walks the committed shadow tree of `surfaceId`; never throws (RFC §13).
  static std::string snapshot(facebook::jsi::Runtime& rt, int surfaceId);
};

}  // namespace waypoint::rnoh
