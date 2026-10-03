#include "WaypointCoreTurboModule.h"

#include <react/renderer/uimanager/UIManager.h>
#include <react/renderer/uimanager/UIManagerBinding.h>

#include "ShadowTreeAdapter.h"
#include "waypoint/api.hpp"
#include "waypoint/finalize.hpp"
#include "waypoint/walker.hpp"

namespace jsi = facebook::jsi;
using facebook::react::TurboModule;

namespace waypoint::rnoh {

namespace {

std::string arg(jsi::Runtime& rt, const jsi::Value* args, size_t count, size_t i) {
  if (i >= count || !args[i].isString()) return "";
  return args[i].getString(rt).utf8(rt);
}

double num(const jsi::Value* args, size_t count, size_t i) {
  return i < count && args[i].isNumber() ? args[i].getNumber() : 0;
}

jsi::Value str(jsi::Runtime& rt, const std::string& s) { return jsi::String::createFromUtf8(rt, s); }

std::string errorSnapshot(int surfaceId, const std::string& what) {
  Snapshot s;
  s.surfaceId = surfaceId;
  s.error = what;
  return toJson(s).dump();
}

}  // namespace

std::string WaypointCoreTurboModule::snapshot(jsi::Runtime& rt, int surfaceId) {
  try {
    auto binding = facebook::react::UIManagerBinding::getBinding(rt);
    if (!binding) return errorSnapshot(surfaceId, "UIManagerBinding not installed");
    const auto& registry = binding->getUIManager().getShadowTreeRegistry();
    Snapshot snap;
    bool found = registry.visit(surfaceId, [&](const facebook::react::ShadowTree& tree) {
      // Immutable revision: safe to read while React commits a new one.
      auto root = tree.getCurrentRevision().rootShadowNode;
      const auto& f = root->getLayoutMetrics().frame;
      Rect viewport{0, 0, f.size.width, f.size.height};
      snap = walkTree(ShadowTreeAdapter{}, *root, viewport, surfaceId);
    });
    if (!found) return errorSnapshot(surfaceId, "no surface " + std::to_string(surfaceId));
    finalize(snap);
    return toJson(snap).dump();
  } catch (const std::exception& e) {
    return errorSnapshot(surfaceId, e.what());
  } catch (...) {
    return errorSnapshot(surfaceId, "unknown error");
  }
}

WaypointCoreTurboModule::WaypointCoreTurboModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
    : TurboModule(kName, std::move(jsInvoker)) {
  methodMap_["snapshot"] = MethodMetadata{1, [](jsi::Runtime& rt, TurboModule&, const jsi::Value* a, size_t n) {
    return str(rt, snapshot(rt, static_cast<int>(num(a, n, 0))));
  }};
  methodMap_["finalize"] = MethodMetadata{1, [](jsi::Runtime& rt, TurboModule&, const jsi::Value* a, size_t n) {
    return str(rt, api::finalize(arg(rt, a, n, 0)));
  }};
  methodMap_["audit"] = MethodMetadata{1, [](jsi::Runtime& rt, TurboModule&, const jsi::Value* a, size_t n) {
    return str(rt, api::audit(arg(rt, a, n, 0)));
  }};
  methodMap_["planStep"] = MethodMetadata{3, [](jsi::Runtime& rt, TurboModule&, const jsi::Value* a, size_t n) {
    return str(rt, api::planStep(arg(rt, a, n, 0), arg(rt, a, n, 1), arg(rt, a, n, 2)));
  }};
  methodMap_["parseAction"] = MethodMetadata{2, [](jsi::Runtime& rt, TurboModule&, const jsi::Value* a, size_t n) {
    return str(rt, api::parseAction(arg(rt, a, n, 0), arg(rt, a, n, 1)));
  }};
  methodMap_["labelRequest"] = MethodMetadata{2, [](jsi::Runtime& rt, TurboModule&, const jsi::Value* a, size_t n) {
    return str(rt, api::labelRequest(arg(rt, a, n, 0), static_cast<int64_t>(num(a, n, 1))));
  }};
  methodMap_["validateLabel"] = MethodMetadata{3, [](jsi::Runtime& rt, TurboModule&, const jsi::Value* a, size_t n) {
    return str(rt, api::validateLabel(arg(rt, a, n, 0), static_cast<int64_t>(num(a, n, 1)), arg(rt, a, n, 2)));
  }};
}

}  // namespace waypoint::rnoh
