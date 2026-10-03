#include "WaypointPlatformTurboModule.h"

namespace waypoint::rnoh {

using namespace ::rnoh;

WaypointPlatformTurboModule::WaypointPlatformTurboModule(const ArkTSTurboModule::Context ctx, const std::string name)
    : ArkTSTurboModule(ctx, name) {
  methodMap_ = {
      ARK_ASYNC_METHOD_METADATA(speak, 1),
      ARK_ASYNC_METHOD_METADATA(isScreenReaderEnabled, 0),
  };
}

}  // namespace waypoint::rnoh
