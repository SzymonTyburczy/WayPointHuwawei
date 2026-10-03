// Host-side nested tree used by unit tests and by `waypoint-cli walk`.
//
// JSON shape (every field optional except children may be absent):
//   { "tag": 1, "component": "View", "frame": {x,y,w,h} (relative to parent),
//     "opacity": 1, "display": "none", "scrollOffset": {x,y}, "clip": true,
//     "props": { ...UiNode fields: text, fg, bg, fontSize, bold, a11y, testID, ... },
//     "children": [ ... ] }
#pragma once

#include <vector>

#include "waypoint/json.hpp"
#include "waypoint/model.hpp"
#include "waypoint/walker.hpp"

namespace waypoint {

struct RawNode {
  int64_t tag = 0;
  Rect frame;
  double opacity = 1;
  bool displayNone = false;
  double scrollX = 0, scrollY = 0;
  bool clip = false;
  UiNode props;  // component, text, colours, a11y, ids
  std::vector<RawNode> children;
};

struct RawAdapter {
  using Node = RawNode;
  int64_t tag(const Node& n) const { return n.tag; }
  Rect layoutFrame(const Node& n) const { return n.frame; }
  bool displayNone(const Node& n) const { return n.displayNone; }
  double opacity(const Node& n) const { return n.opacity; }
  Rect scrollOffset(const Node& n) const { return Rect{n.scrollX, n.scrollY, 0, 0}; }
  bool clipsChildren(const Node& n) const { return n.clip; }
  void fill(const Node& n, UiNode& out) const { out = n.props; }
  template <class F>
  void forEachChild(const Node& n, F&& f) const {
    for (const auto& c : n.children) f(c);
  }
};

RawNode rawNodeFromJson(const Json& j);

}  // namespace waypoint
