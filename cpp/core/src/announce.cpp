#include "waypoint/announce.hpp"

#include <cctype>
#include <map>

#include "waypoint/finalize.hpp"
#include "waypoint/text.hpp"

namespace waypoint {

namespace {

// Spoken role words, close to what TalkBack-style screen readers say.
const std::map<std::string, std::string> kRoleWords = {
    {"button", "button"},       {"link", "link"},           {"tab", "tab"},
    {"switch", "switch"},       {"checkbox", "checkbox"},   {"radio", "radio button"},
    {"header", "heading"},      {"image", "image"},         {"imagebutton", "button"},
    {"menuitem", "menu item"},  {"togglebutton", "toggle button"},
    {"search", "search field"}, {"adjustable", "adjustable"}, {"combobox", "combo box"},
    {"alert", "alert"},         {"progressbar", "progress bar"}, {"summary", "summary"},
};

std::string roleWord(const UiNode& n) {
  auto it = kRoleWords.find(n.a11y.role);
  if (it != kRoleWords.end()) return it->second;
  if (n.component == "TextInput") return "edit box";
  if (n.component == "Switch") return "switch";
  if (n.component == "Image" && n.a11y.accessible) return "image";
  return "";
}

std::string stateWords(const UiNode& n, const std::string& role) {
  std::vector<std::string> s;
  if (n.a11y.selected.value_or(false)) s.push_back("selected");
  if (!n.a11y.checked.empty()) {
    bool sw = role == "switch" || role == "toggle button";
    if (n.a11y.checked == "true") s.push_back(sw ? "on" : "checked");
    else if (n.a11y.checked == "false") s.push_back(sw ? "off" : "not checked");
    else s.push_back("partially checked");
  }
  if (n.a11y.disabled) s.push_back("disabled");
  std::string out;
  for (size_t i = 0; i < s.size(); ++i) out += (i ? ", " : "") + s[i];
  return out;
}

}  // namespace

std::vector<Announcement> screenReaderOrder(const Snapshot& snap) {
  SnapshotIndex idx(snap);
  const auto& nodes = snap.nodes;
  const int count = static_cast<int>(nodes.size());
  std::vector<bool> grouped(count, false);
  for (int p = 0; p < count; ++p) {
    int pp = idx.parentPos(p);
    grouped[p] = pp >= 0 && (grouped[pp] || nodes[pp].a11y.accessible);
  }
  std::vector<Announcement> out;
  for (int p = 0; p < count; ++p) {
    const UiNode& n = nodes[p];
    if (!n.visible || n.a11y.hidden || grouped[p]) continue;
    bool text = isTextComponent(n.component) && !n.text.empty();
    bool focusable = n.a11y.accessible || text || n.component == "TextInput" || n.component == "Switch";
    if (!focusable) continue;
    // An accessible container with nothing inside it and no role is skipped by screen readers.
    std::string name = sanitizeName(n.name, 120);
    std::string role = roleWord(n);
    if (name.empty() && role.empty() && !n.actionable) continue;
    Announcement a;
    a.id = n.id;
    a.name = name;
    a.role = role;
    a.states = stateWords(n, role);
    a.unnamed = name.empty() && n.actionable;
    a.frame = n.frame;
    std::string t = name;
    // Unnamed interactive elements: readers fall back to the role, or "unlabelled".
    if (t.empty()) t = role.empty() ? "unlabelled" : "";
    if (!role.empty()) t += t.empty() ? role : ", " + role;
    if (!a.states.empty()) t += ", " + a.states;
    if (!n.a11y.hint.empty()) t += ". " + sanitizeName(n.a11y.hint, 120);
    if (!t.empty()) t[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(t[0])));
    a.text = t;
    out.push_back(std::move(a));
  }
  return out;
}

Json toJson(const Announcement& a) {
  Json j = Json::object();
  j.set("id", static_cast<double>(a.id));
  j.set("text", a.text);
  j.set("name", a.name);
  if (!a.role.empty()) j.set("role", a.role);
  if (!a.states.empty()) j.set("states", a.states);
  if (a.unnamed) j.set("unnamed", true);
  j.set("frame", toJson(a.frame));
  return j;
}

}  // namespace waypoint
