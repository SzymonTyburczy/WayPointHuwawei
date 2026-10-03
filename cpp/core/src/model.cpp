#include "waypoint/model.hpp"

#include <algorithm>

#include "waypoint/color.hpp"

namespace waypoint {

bool intersects(const Rect& a, const Rect& b) {
  return a.x < b.right() && b.x < a.right() && a.y < b.bottom() && b.y < a.bottom();
}

Rect intersect(const Rect& a, const Rect& b) {
  double x0 = std::max(a.x, b.x), y0 = std::max(a.y, b.y);
  double x1 = std::min(a.right(), b.right()), y1 = std::min(a.bottom(), b.bottom());
  return Rect{x0, y0, std::max(0.0, x1 - x0), std::max(0.0, y1 - y0)};
}

SnapshotIndex::SnapshotIndex(const Snapshot& snap) {
  const auto& nodes = snap.nodes;
  const int n = static_cast<int>(nodes.size());
  parents_.assign(n, -1);
  children_.assign(n, {});
  ends_.resize(n);
  byId_.reserve(n);
  for (int p = 0; p < n; ++p) byId_[nodes[p].id] = p;
  for (int p = 0; p < n; ++p) {
    if (nodes[p].parent) {
      auto it = byId_.find(*nodes[p].parent);
      if (it != byId_.end() && it->second < p) {
        parents_[p] = it->second;
        children_[it->second].push_back(p);
      }
    }
    ends_[p] = p + 1;
  }
  for (int p = n - 1; p >= 0; --p) {
    int pp = parents_[p];
    if (pp >= 0) ends_[pp] = std::max(ends_[pp], ends_[p]);
  }
}

int SnapshotIndex::pos(int64_t id) const {
  auto it = byId_.find(id);
  return it == byId_.end() ? -1 : it->second;
}

const char* actionName(ActionKind k) {
  switch (k) {
    case ActionKind::Tap: return "tap";
    case ActionKind::Scroll: return "scroll";
    case ActionKind::Back: return "back";
    case ActionKind::Done: return "done";
    case ActionKind::Ask: return "ask";
  }
  return "ask";
}

Json toJson(const Rect& r) {
  Json j = Json::object();
  j.set("x", r.x);
  j.set("y", r.y);
  j.set("w", r.w);
  j.set("h", r.h);
  return j;
}

Json toJson(const Rgba& c) {
  Json j = Json::object();
  j.set("r", c.r);
  j.set("g", c.g);
  j.set("b", c.b);
  j.set("a", c.a);
  return j;
}

Json toJson(const UiNode& n) {
  Json j = Json::object();
  j.set("id", static_cast<double>(n.id));
  j.set("parent", n.parent ? Json(static_cast<double>(*n.parent)) : Json());
  j.set("depth", n.depth);
  j.set("component", n.component);
  j.set("frame", toJson(n.frame));
  j.set("visible", n.visible);
  if (!n.text.empty()) j.set("text", n.text);
  if (n.fg) j.set("fg", toJson(*n.fg));
  if (n.fontSize) j.set("fontSize", *n.fontSize);
  if (n.bold) j.set("bold", true);
  if (n.bg) j.set("bg", toJson(*n.bg));
  j.set("opacity", n.opacity);
  Json a = Json::object();
  a.set("accessible", n.a11y.accessible);
  if (!n.a11y.label.empty()) a.set("label", n.a11y.label);
  if (!n.a11y.hint.empty()) a.set("hint", n.a11y.hint);
  if (!n.a11y.role.empty()) a.set("role", n.a11y.role);
  if (n.a11y.disabled) a.set("disabled", true);
  a.set("hidden", n.a11y.hidden);
  if (n.a11y.selected) a.set("selected", *n.a11y.selected);
  if (!n.a11y.checked.empty()) a.set("checked", n.a11y.checked);
  j.set("a11y", a);
  j.set("actionable", n.actionable);
  j.set("name", n.name);
  if (!n.testID.empty()) j.set("testID", n.testID);
  if (!n.nativeID.empty()) j.set("nativeID", n.nativeID);
  if (!n.imageSrc.empty()) j.set("imageSrc", n.imageSrc);
  if (!n.placeholder.empty()) j.set("placeholder", n.placeholder);
  if (!n.runs.empty()) {
    Json runs = Json::array();
    for (const auto& r : n.runs) {
      Json rj = Json::object();
      rj.set("fg", toJson(r.fg));
      rj.set("fontSize", r.fontSize);
      rj.set("bold", r.bold);
      runs.push(rj);
    }
    j.set("runs", runs);
  }
  if (n.pressable) j.set("pressable", true);
  if (n.drawsImage) j.set("drawsImage", true);
  return j;
}

Json toJson(const Snapshot& s) {
  Json j = Json::object();
  j.set("rev", s.rev);
  j.set("surfaceId", static_cast<double>(s.surfaceId));
  j.set("viewport", toJson(s.viewport));
  Json nodes = Json::array();
  for (const auto& n : s.nodes) nodes.push(toJson(n));
  j.set("nodes", nodes);
  if (!s.error.empty()) j.set("error", s.error);
  if (s.partial) j.set("partial", true);
  return j;
}

Json toJson(const Finding& f) {
  Json j = Json::object();
  j.set("rule", f.rule);
  j.set("severity", f.severity);
  j.set("nodeId", static_cast<double>(f.nodeId));
  j.set("message", f.message);
  if (f.data.size() > 0) j.set("data", f.data);
  if (f.suggestion) {
    Json s = Json::object();
    s.set("label", f.suggestion->label);
    s.set("patch", f.suggestion->patch);
    if (!f.suggestion->confidence.empty()) s.set("confidence", f.suggestion->confidence);
    j.set("suggestion", s);
  }
  return j;
}

Json toJson(const AuditReport& r) {
  Json j = Json::object();
  Json findings = Json::array();
  Json counts = Json::object();
  for (const char* rule : {"R1", "R2", "R3", "R4", "R5", "R6"}) counts.set(rule, 0);
  int errors = 0, warnings = 0;
  for (const auto& f : r.findings) {
    findings.push(toJson(f));
    counts.set(f.rule, counts.num(f.rule) + 1);
    (f.severity == "error" ? errors : warnings)++;
  }
  counts.set("errors", errors);
  counts.set("warnings", warnings);
  j.set("findings", findings);
  j.set("counts", counts);
  j.set("contrastUnknown", r.contrastUnknown);
  j.set("partial", r.partial);
  j.set("nodeCount", static_cast<double>(r.nodeCount));
  return j;
}

Json toJson(const Action& a) {
  Json j = Json::object();
  j.set("a", actionName(a.kind));
  if (a.kind == ActionKind::Tap) {
    j.set("id", static_cast<double>(a.id));
    j.set("index", a.index);
  }
  if (a.kind == ActionKind::Scroll) j.set("dir", a.dir);
  return j;
}

Rect rectFromJson(const Json& j) {
  return Rect{j.num("x"), j.num("y"), j.num("w"), j.num("h")};
}

Rgba rgbaFromJson(const Json& j) {
  if (j.isString()) {
    auto c = parseHexColor(j.asString());
    if (!c) throw JsonError("bad colour: " + j.asString());
    return *c;
  }
  return Rgba{j.num("r"), j.num("g"), j.num("b"), j.num("a", 1)};
}

UiNode nodeFromJson(const Json& j) {
  UiNode n;
  n.id = static_cast<int64_t>(j.num("id"));
  if (const Json* p = j.get("parent"); p && !p->isNull()) n.parent = static_cast<int64_t>(p->asNumber());
  n.depth = static_cast<int>(j.num("depth"));
  n.component = j.str("component", "View");
  if (const Json* f = j.get("frame")) n.frame = rectFromJson(*f);
  n.visible = j.boolean("visible", true);
  n.text = j.str("text");
  if (const Json* c = j.get("fg"); c && !c->isNull()) n.fg = rgbaFromJson(*c);
  if (const Json* fs = j.get("fontSize"); fs && !fs->isNull()) n.fontSize = fs->asNumber();
  n.bold = j.boolean("bold");
  if (const Json* c = j.get("bg"); c && !c->isNull()) n.bg = rgbaFromJson(*c);
  n.opacity = j.num("opacity", 1);
  if (const Json* a = j.get("a11y"); a && a->isObject()) {
    n.a11y.accessible = a->boolean("accessible");
    n.a11y.label = a->str("label");
    n.a11y.hint = a->str("hint");
    n.a11y.role = a->str("role");
    n.a11y.disabled = a->boolean("disabled");
    n.a11y.hidden = a->boolean("hidden");
    if (const Json* s = a->get("selected"); s && !s->isNull()) n.a11y.selected = s->asBool();
    if (const Json* c = a->get("checked"); c && !c->isNull()) {
      n.a11y.checked = c->isBool() ? (c->asBool() ? "true" : "false") : c->asString();
    }
  }
  n.actionable = j.boolean("actionable");
  n.name = j.str("name");
  n.testID = j.str("testID");
  n.nativeID = j.str("nativeID");
  n.imageSrc = j.str("imageSrc");
  n.placeholder = j.str("placeholder");
  if (const Json* runs = j.get("runs"); runs && runs->isArray()) {
    for (const auto& r : runs->asArray()) {
      TextRun run;
      if (const Json* c = r.get("fg")) run.fg = rgbaFromJson(*c);
      run.fontSize = r.num("fontSize", 14);
      run.bold = r.boolean("bold");
      n.runs.push_back(run);
    }
  }
  n.pressable = j.boolean("pressable");
  n.drawsImage = j.boolean("drawsImage");
  return n;
}

Snapshot snapshotFromJson(const Json& j) {
  if (!j.isObject()) throw JsonError("snapshot must be an object");
  Snapshot s;
  s.rev = j.str("rev");
  s.surfaceId = static_cast<int64_t>(j.num("surfaceId"));
  if (const Json* v = j.get("viewport")) s.viewport = rectFromJson(*v);
  if (const Json* nodes = j.get("nodes"); nodes && !nodes->isNull()) {
    for (const auto& n : nodes->asArray()) s.nodes.push_back(nodeFromJson(n));
  }
  s.error = j.str("error");
  s.partial = j.boolean("partial");
  return s;
}

}  // namespace waypoint
