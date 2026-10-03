#include "waypoint/raw_tree.hpp"

namespace waypoint {

RawNode rawNodeFromJson(const Json& j) {
  RawNode r;
  r.tag = static_cast<int64_t>(j.num("tag"));
  if (const Json* f = j.get("frame")) r.frame = rectFromJson(*f);
  r.opacity = j.num("opacity", 1);
  r.displayNone = j.str("display") == "none";
  if (const Json* s = j.get("scrollOffset")) {
    r.scrollX = s->num("x");
    r.scrollY = s->num("y");
  }
  r.clip = j.boolean("clip");
  if (const Json* p = j.get("props"); p && p->isObject()) r.props = nodeFromJson(*p);
  r.props.component = j.str("component", r.props.component.empty() ? "View" : r.props.component);
  if (const Json* children = j.get("children"); children && children->isArray()) {
    for (const auto& c : children->asArray()) r.children.push_back(rawNodeFromJson(c));
  }
  return r;
}

}  // namespace waypoint
