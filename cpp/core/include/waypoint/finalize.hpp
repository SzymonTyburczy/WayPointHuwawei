// Derived fields over the flat snapshot (RFC §6): inherited hidden state, modal
// occlusion, accessible name, actionability and the change-detection hash.
//
// finalize() is idempotent and is the single place these semantics live, so the
// shadow-tree walker and the JS registry (plan B) produce identical snapshots.
#pragma once

#include <string>

#include "waypoint/model.hpp"

namespace waypoint {

bool isTextComponent(const std::string& component);
bool isInteractiveRole(const std::string& role);
bool isNonInteractiveRole(const std::string& role);

// Subtrees whose root has this nativeID (the SDK's guide and audit overlays) are
// removed so Waypoint never audits or plans over its own UI.
constexpr const char* kOverlayNativeId = "waypoint-overlay";
void dropOverlay(Snapshot& snap);

void finalize(Snapshot& snap);

// FNV-1a 64-bit over (id, rounded frame, name, text) of every node, as 16 hex digits.
std::string computeRev(const Snapshot& snap);

}  // namespace waypoint
