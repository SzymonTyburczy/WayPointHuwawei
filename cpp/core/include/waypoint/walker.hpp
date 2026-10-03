// Tree Walker (RFC §6): one depth-first pass that turns a UI tree into the flat,
// pre-ordered UiNode array.
//
// The traversal is a template over an Adapter so the same maths (absolute frames,
// scroll offsets, clipping, cumulative opacity, visibility) runs on the host
// against RawNode and on the device against React Native's ShadowNode
// (harmony/waypoint/src/main/cpp/ShadowTreeAdapter.h).
//
// An Adapter provides:
//   using Node = ...;
//   int64_t tag(const Node&) const;
//   Rect layoutFrame(const Node&) const;          // relative to the parent, vp
//   bool displayNone(const Node&) const;
//   double opacity(const Node&) const;            // the node's own opacity
//   Rect::x/y scrollOffset(const Node&) const;    // returned as Rect{x, y, 0, 0}
//   bool clipsChildren(const Node&) const;
//   void fill(const Node&, UiNode& out) const;    // component, text, colours, a11y, ids
//   template <class F> void forEachChild(const Node&, F&& f) const;  // f(const Node&)
//
// The walker never allocates beyond the output array.
#pragma once

#include <cstdint>
#include <optional>

#include "waypoint/model.hpp"

namespace waypoint {

struct WalkOptions {
  size_t maxNodes = 500;  // RFC §13: larger screens are capped and flagged partial
};

template <class Adapter>
class TreeWalker {
 public:
  using Node = typename Adapter::Node;

  TreeWalker(const Adapter& adapter, Snapshot& out, WalkOptions opts)
      : adapter_(adapter), out_(out), opts_(opts) {}

  void run(const Node& root, const Rect& viewport) {
    walk(root, std::nullopt, 0, 0, viewport, 1.0, 0, false);
  }

 private:
  void walk(const Node& node, std::optional<int64_t> parentId, double ox, double oy, const Rect& clip,
            double opacity, int depth, bool ancestorNone) {
    if (out_.nodes.size() >= opts_.maxNodes) {
      out_.partial = true;
      return;
    }
    const Rect lm = adapter_.layoutFrame(node);
    const Rect abs{ox + lm.x, oy + lm.y, lm.w, lm.h};
    const double op = opacity * adapter_.opacity(node);
    const bool none = ancestorNone || adapter_.displayNone(node);

    UiNode n;
    adapter_.fill(node, n);
    n.id = adapter_.tag(node);
    n.parent = parentId;
    n.depth = depth;
    n.frame = abs;
    n.opacity = op;
    n.visible = intersects(abs, clip) && !none && op > 0;
    out_.nodes.push_back(std::move(n));

    const Rect scroll = adapter_.scrollOffset(node);
    const double cx = abs.x - scroll.x;
    const double cy = abs.y - scroll.y;
    const Rect childClip = adapter_.clipsChildren(node) ? intersect(clip, abs) : clip;
    const int64_t id = adapter_.tag(node);
    adapter_.forEachChild(node, [&](const Node& child) {
      walk(child, id, cx, cy, childClip, op, depth + 1, none);
    });
  }

  const Adapter& adapter_;
  Snapshot& out_;
  WalkOptions opts_;
};

// Walks `root` and returns a raw snapshot (names, actionability and rev are not
// computed yet; call finalize()).
template <class Adapter>
Snapshot walkTree(const Adapter& adapter, const typename Adapter::Node& root, const Rect& viewport,
                  int64_t surfaceId, WalkOptions opts = {}) {
  Snapshot snap;
  snap.surfaceId = surfaceId;
  snap.viewport = viewport;
  TreeWalker<Adapter>(adapter, snap, opts).run(root, viewport);
  return snap;
}

}  // namespace waypoint
