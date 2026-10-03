// Helpers for hand-built snapshots in tests.
#pragma once

#include <optional>
#include <string>

#include "waypoint/color.hpp"
#include "waypoint/finalize.hpp"
#include "waypoint/model.hpp"

namespace wptest {

using namespace waypoint;

inline Rgba hex(const char* h) { return *parseHexColor(h); }

class Builder {
 public:
  Builder() { snap_.viewport = Rect{0, 0, 360, 780}; }

  UiNode& add(int64_t id, std::optional<int64_t> parent, const std::string& component, Rect frame) {
    UiNode n;
    n.id = id;
    n.parent = parent;
    n.component = component;
    n.frame = frame;
    n.depth = 0;
    if (parent) {
      for (const auto& p : snap_.nodes) {
        if (p.id == *parent) n.depth = p.depth + 1;
      }
    }
    snap_.nodes.push_back(n);
    return snap_.nodes.back();
  }

  // A pressable button: accessible View with role, optional label, and a text child.
  UiNode& button(int64_t id, std::optional<int64_t> parent, Rect frame, const std::string& text,
                 const std::string& role = "button") {
    UiNode& b = add(id, parent, "View", frame);
    b.a11y.accessible = true;
    b.a11y.role = role;
    if (!text.empty()) {
      UiNode& t = add(id * 100, id, "Paragraph", frame);
      t.text = text;
      t.fg = hex("#000000");
      t.fontSize = 16;
      t.a11y.accessible = true;
    }
    return snap_.nodes[pos(id)];
  }

  int pos(int64_t id) const {
    for (size_t i = 0; i < snap_.nodes.size(); ++i) {
      if (snap_.nodes[i].id == id) return static_cast<int>(i);
    }
    return -1;
  }

  UiNode& node(int64_t id) { return snap_.nodes[pos(id)]; }
  Snapshot& raw() { return snap_; }

  Snapshot done() {
    finalize(snap_);
    return snap_;
  }

 private:
  Snapshot snap_;
};

inline const UiNode& byId(const Snapshot& s, int64_t id) {
  for (const auto& n : s.nodes) {
    if (n.id == id) return n;
  }
  throw std::out_of_range("no node");
}

}  // namespace wptest
