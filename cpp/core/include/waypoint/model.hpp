// Data model shared by the Tree Walker, the rule engine and the guide planner (RFC §5).
#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "waypoint/json.hpp"

namespace waypoint {

// Window coordinates in vp.
struct Rect {
  double x = 0, y = 0, w = 0, h = 0;
  double right() const { return x + w; }
  double bottom() const { return y + h; }
  bool empty() const { return w <= 0 || h <= 0; }
};

bool intersects(const Rect& a, const Rect& b);
Rect intersect(const Rect& a, const Rect& b);

// sRGB, every channel in 0..1.
struct Rgba {
  double r = 0, g = 0, b = 0, a = 1;
};

// One styled fragment of a Paragraph; emitted only when a paragraph mixes styles.
struct TextRun {
  Rgba fg;
  double fontSize = 14;
  bool bold = false;
};

struct A11y {
  bool accessible = false;
  std::string label;  // empty means absent
  std::string hint;
  std::string role;
  bool disabled = false;
  bool hidden = false;               // hidden from assistive technology
  std::optional<bool> selected;      // additive, see IMPLEMENTATION_PLAN
  std::string checked;               // "", "true", "false" or "mixed"
};

struct UiNode {
  int64_t id = 0;                    // React tag
  std::optional<int64_t> parent;
  int depth = 0;
  std::string component;             // "View", "Paragraph", "Image", "TextInput", "ScrollView", ...
  Rect frame;
  bool visible = true;
  std::string text;
  std::optional<Rgba> fg;
  std::optional<double> fontSize;
  bool bold = false;
  std::optional<Rgba> bg;
  double opacity = 1;                // cumulative over ancestors
  A11y a11y;
  bool actionable = false;           // derived by finalize()
  std::string name;                  // derived by finalize()
  std::string testID;
  std::string nativeID;
  std::string imageSrc;
  // Additive fields.
  std::string placeholder;
  std::vector<TextRun> runs;
  bool pressable = false;            // plan B: the JS registry saw a press handler
  bool drawsImage = false;           // image or gradient background
};

struct Snapshot {
  std::string rev;
  int64_t surfaceId = 0;
  Rect viewport;
  std::vector<UiNode> nodes;         // pre-order
  std::string error;                 // non-empty when the walker failed
  bool partial = false;              // traversal was capped
};

struct Suggestion {
  std::string label;
  std::string patch;
  std::string confidence;            // "model" or "low"
};

struct Finding {
  std::string rule;                  // "R1".."R6"
  std::string severity;              // "error" or "warning"
  int64_t nodeId = 0;
  std::string message;
  Json data = Json::object();
  std::optional<Suggestion> suggestion;
};

// Accessibility score (0-100) for one screen. Each part is the share of elements
// that pass, in [0, 1]; an empty category counts as passing.
struct A11yScore {
  int score = 100;
  std::string grade = "A";
  double names = 1;     // actionable elements with a unique, non-empty name (weight 40)
  double targets = 1;   // actionable elements of adequate size (weight 20)
  double contrast = 1;  // text with sufficient contrast (weight 20)
  double roles = 1;     // actionable elements with a role (weight 10)
  double images = 1;    // images with a name or hidden from assistive technology (weight 10)
  int actionable = 0;
  int distinct = 0;     // actionable elements an agent or a screen-reader user can tell apart
};

struct AuditReport {
  A11yScore score;
  std::vector<Finding> findings;
  int contrastUnknown = 0;
  bool partial = false;
  size_t nodeCount = 0;
};

enum class ActionKind { Tap, Scroll, Back, Done, Ask };

struct Action {
  ActionKind kind = ActionKind::Ask;
  int64_t id = 0;                    // React tag, for Tap
  int index = -1;                    // candidate index the model chose, for Tap
  std::string dir;                   // "up" or "down", for Scroll
};

// Pre-computed tree relations over a snapshot's flat array.
class SnapshotIndex {
 public:
  explicit SnapshotIndex(const Snapshot& snap);
  // Position of a node in `nodes`, or -1.
  int pos(int64_t id) const;
  int parentPos(int p) const { return parents_[p]; }
  const std::vector<int>& children(int p) const { return children_[p]; }
  // One past the last descendant of p in pre-order.
  int subtreeEnd(int p) const { return ends_[p]; }
  bool isAncestor(int ancestor, int p) const { return p > ancestor && p < ends_[ancestor]; }

 private:
  std::unordered_map<int64_t, int> byId_;
  std::vector<int> parents_;
  std::vector<std::vector<int>> children_;
  std::vector<int> ends_;
};

// JSON conversion. fromJson is tolerant of absent optional fields and throws
// JsonError on wrong types.
Json toJson(const Rect& r);
Json toJson(const Rgba& c);
Json toJson(const UiNode& n);
Json toJson(const Snapshot& s);
Json toJson(const Finding& f);
Json toJson(const AuditReport& r);
Json toJson(const Action& a);

Rect rectFromJson(const Json& j);
Rgba rgbaFromJson(const Json& j);
UiNode nodeFromJson(const Json& j);
Snapshot snapshotFromJson(const Json& j);

const char* actionName(ActionKind k);

}  // namespace waypoint
