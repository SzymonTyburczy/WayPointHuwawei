// RNOH package: registers the two C++ modules and the ArkTS platform module.
// Returned from the app's PackageProvider.cpp:
//
//   std::vector<std::shared_ptr<Package>> PackageProvider::getPackages(Package::Context ctx) {
//     return {std::make_shared<waypoint::rnoh::WaypointPackage>(ctx)};
//   }
#pragma once

#include "RNOH/Package.h"
#include "WaypointCoreTurboModule.h"
#include "WaypointPlatformTurboModule.h"
#ifdef WAYPOINT_WITH_LLAMA
#include "WaypointLlmTurboModule.h"
#endif

namespace waypoint::rnoh {

class WaypointTurboModuleFactoryDelegate : public ::rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context ctx, const std::string& name) const override {
    if (name == WaypointCoreTurboModule::kName) return std::make_shared<WaypointCoreTurboModule>(ctx.jsInvoker);
#ifdef WAYPOINT_WITH_LLAMA
    if (name == WaypointLlmTurboModule::kName) return std::make_shared<WaypointLlmTurboModule>(ctx.jsInvoker);
#endif
    if (name == WaypointPlatformTurboModule::kName) return std::make_shared<WaypointPlatformTurboModule>(ctx, name);
    return nullptr;
  }
};

class WaypointPackage : public ::rnoh::Package {
 public:
  explicit WaypointPackage(::rnoh::Package::Context ctx) : Package(ctx) {}

  std::unique_ptr<::rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override {
    return std::make_unique<WaypointTurboModuleFactoryDelegate>();
  }
};

}  // namespace waypoint::rnoh
