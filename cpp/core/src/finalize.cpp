#include "waypoint/finalize.hpp"

#include <cmath>
#include <cstdio>
#include <set>

namespace waypoint {

namespace {

const std::set<std::string> kInteractiveRoles = {
    "button", "link",       "switch",      "checkbox", "radio",    "tab",
    "menuitem", "togglebutton", "imagebutton", "search", "adjustable", "combobox"};

// Roles that make an accessible element focusable but not something to press.
const std::set<std::string> kNonInteractiveRoles = {
    "none", "text", "header", "image", "summary", "progressbar", "alert", "timer",
    "list", "grid", "tablist", "toolbar", "menu", "menubar", "scrollbar"};

constexpr uint64_t kFnvOffset = 1469598103934665603ULL;
constexpr uint64_t kFnvPrime = 1099511628211ULL;

void fnv(uint64_t& h, const std::string& s) {
  for (unsigned char c : s) {
    h ^= c;
    h *= kFnvPrime;
  }
  h ^= 0x1F;  // field separator, so ("ab","c") != ("a","bc")
  h *= kFnvPrime;
}

std::string ownText(const UiNode& n) {
  if (!n.text.empty()) return n.text;
  if (n.component == "TextInput") return n.placeholder;
  return "";
}

}  // namespace

bool isTextComponent(const std::string& c) {
  return c == "Paragraph" || c == "Text" || c == "RawText";
}

bool isInteractiveRole(const std::string& role) { return kInteractiveRoles.count(role) > 0; }
bool isNonInteractiveRole(const std::string& role) { return kNonInteractiveRoles.count(role) > 0; }

std::string computeRev(const Snapshot& snap) {
  uint64_t h = kFnvOffset;
  for (const auto& n : snap.nodes) {
    fnv(h, std::to_string(n.id));
    for (double v : {n.frame.x, n.frame.y, n.frame.w, n.frame.h}) fnv(h, std::to_string(std::llround(v)));
    fnv(h, n.name);
    fnv(h, n.text);
    // Additive: state changes (a toggled switch, a selected tab) are screen changes too.
    fnv(h, n.a11y.checked);
    fnv(h, n.a11y.selected ? (*n.a11y.selected ? "1" : "0") : "");
  }
  char buf[17];
  std::snprintf(buf, sizeof buf, "%016llx", static_cast<unsigned long long>(h));
  return buf;
}

void dropOverlay(Snapshot& snap) {
  bool any = false;
  for (const auto& n : snap.nodes) any = any || n.nativeID == kOverlayNativeId;
  if (!any) return;
  SnapshotIndex idx(snap);
  std::vector<bool> drop(snap.nodes.size(), false);
  for (size_t p = 0; p < snap.nodes.size(); ++p) {
    if (snap.nodes[p].nativeID != kOverlayNativeId) continue;
    for (int q = static_cast<int>(p); q < idx.subtreeEnd(static_cast<int>(p)); ++q) drop[q] = true;
  }
  std::vector<UiNode> kept;
  kept.reserve(snap.nodes.size());
  for (size_t p = 0; p < snap.nodes.size(); ++p) {
    if (!drop[p]) kept.push_back(std::move(snap.nodes[p]));
  }
  snap.nodes = std::move(kept);
}

void finalize(Snapshot& snap) {
  // 0. Waypoint's own overlay is never part of the app's UI.
  dropOverlay(snap);
  auto& nodes = snap.nodes;
  const int n = static_cast<int>(nodes.size());
  SnapshotIndex idx(snap);

  // 1. Hidden from assistive technology applies to the whole subtree.
  for (int p = 0; p < n; ++p) {
    int pp = idx.parentPos(p);
    if (pp >= 0 && nodes[pp].a11y.hidden) nodes[p].a11y.hidden = true;
  }

  // 2. Occlusion approximation: with a modal mounted, only its subtree is on screen.
  int modal = -1;
  for (int p = 0; p < n; ++p) {
    if (nodes[p].visible && (nodes[p].component == "ModalHostView" || nodes[p].component == "Modal")) modal = p;
  }
  if (modal >= 0) {
    for (int p = 0; p < n; ++p) {
      if (p != modal && !idx.isAncestor(modal, p)) nodes[p].visible = false;
    }
  }

  // 3. Accessible name. contrib[p] is what p contributes to an accessible
  //    ancestor's grouped name: its label, else its own text, else its children's.
  std::vector<std::string> contrib(n);
  for (int p = n - 1; p >= 0; --p) {
    const UiNode& node = nodes[p];
    if (node.a11y.hidden) continue;
    if (!node.a11y.label.empty()) {
      contrib[p] = node.a11y.label;
      continue;
    }
    std::string own = ownText(node);
    if (!own.empty()) {
      contrib[p] = own;
      continue;
    }
    std::string joined;
    for (int c : idx.children(p)) {
      if (contrib[c].empty()) continue;
      if (!joined.empty()) joined += ' ';
      joined += contrib[c];
    }
    contrib[p] = joined;
  }
  for (int p = 0; p < n; ++p) {
    UiNode& node = nodes[p];
    if (!node.a11y.label.empty()) node.name = node.a11y.label;
    else if (!ownText(node).empty()) node.name = ownText(node);
    else if (node.a11y.accessible && !node.a11y.hidden) node.name = contrib[p];
    else node.name.clear();
  }

  // 4. Actionability heuristic.
  for (auto& node : nodes) {
    bool base = node.visible && !node.a11y.hidden && !node.a11y.disabled;
    bool byRole = isInteractiveRole(node.a11y.role);
    bool byComponent = node.component == "TextInput" || node.component == "Switch";
    bool byAccessible = node.a11y.accessible && !isTextComponent(node.component) &&
                        node.component != "Image" && !isNonInteractiveRole(node.a11y.role);
    node.actionable = base && (byRole || byComponent || byAccessible || node.pressable);
  }

  // 5. Change detector.
  snap.rev = computeRev(snap);
}

}  // namespace waypoint
