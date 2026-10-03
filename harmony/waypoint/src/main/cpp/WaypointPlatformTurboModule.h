// C++ glue for the ArkTS module WaypointPlatform (speech in and out, screen-reader
// state; RFC-001 §11 stretch item 1 and voice control). The
// implementation lives in ets/WaypointPlatformTurboModule.ets; RNOH forwards
// these methods to it.
#pragma once

#include "RNOH/ArkTSTurboModule.h"

namespace waypoint::rnoh {

class JSI_EXPORT WaypointPlatformTurboModule : public ::rnoh::ArkTSTurboModule {
 public:
  static constexpr const char* kName = "WaypointPlatform";
  WaypointPlatformTurboModule(const ArkTSTurboModule::Context ctx, const std::string name);
};

}  // namespace waypoint::rnoh
