// Audit engine (RFC §7): six deterministic rules over a finalized snapshot.
// The model is never asked whether something is a defect.
#pragma once

#include <optional>

#include "waypoint/model.hpp"

namespace waypoint {

struct AuditOptions {
  Rgba windowBg{1, 1, 1, 1};
  double minTargetVp = 24;        // WCAG 2.5.8 (AA)
  double recommendedTargetVp = 44;  // WCAG 2.5.5 (AAA)
  double largeTextVp = 24;        // 18 pt
  double largeBoldTextVp = 18.66; // 14 pt bold
  double normalContrast = 4.5;
  double largeContrast = 3.0;
};

struct ContrastResult {
  bool known = true;   // false when an image or gradient sits behind the text
  double ratio = 0;
  double threshold = 0;
  bool large = false;
  Rgba fg, bg;         // effective, opaque
};

// Contrast of the text node at position p (worst run for mixed styles), or
// nullopt when the node has no text.
std::optional<ContrastResult> evaluateContrast(const Snapshot& snap, const SnapshotIndex& idx, int p,
                                               const AuditOptions& opts = {});

// imageSrc of the node or of its first descendant Image.
std::string findImageSrc(const Snapshot& snap, const SnapshotIndex& idx, int p);

AuditReport audit(const Snapshot& snap, const AuditOptions& opts = {});

}  // namespace waypoint
