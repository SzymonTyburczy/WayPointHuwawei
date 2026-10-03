#include "waypoint/labels.hpp"

#include <set>
#include <stdexcept>

#include "waypoint/json.hpp"
#include "waypoint/planner.hpp"
#include "waypoint/rules.hpp"
#include "waypoint/text.hpp"

namespace waypoint {

const char* const kLabelSystemPrompt =
    "You label unlabelled controls in a mobile app for screen-reader users.\n"
    "Reply with a label of one to four words. Describe the action, not the icon.";

const char* const kLabelGrammar =
    "root ::= \"{\\\"label\\\":\\\"\" word (\" \" word){0,3} \"\\\"}\"\n"
    "word ::= [A-Za-z] [a-z]{0,14}\n";

namespace {

constexpr size_t kNeighbours = 3;
constexpr size_t kContextNameLen = 40;

const std::set<std::string> kGeneric = {"button", "image", "icon", "view", "click here", "tap here",
                                        "tab", "link", "control", "label", "unlabelled", "unlabeled"};

std::string quoted(const std::vector<std::string>& names) {
  std::string out;
  for (size_t i = 0; i < names.size(); ++i) {
    if (i) out += ", ";
    out += "\"" + names[i] + "\"";
  }
  return out;
}

}  // namespace

LabelContext buildLabelContext(const Snapshot& snap, int64_t nodeId) {
  SnapshotIndex idx(snap);
  const int p = idx.pos(nodeId);
  if (p < 0) throw std::out_of_range("unknown node " + std::to_string(nodeId));
  const auto& nodes = snap.nodes;
  const UiNode& n = nodes[p];

  LabelContext ctx;
  ctx.component = n.component;
  ctx.role = n.a11y.role;
  std::string src = findImageSrc(snap, idx, p);
  if (!src.empty()) ctx.image = basenameOf(src);
  ctx.testID = n.testID;
  ctx.nativeID = n.nativeID;
  ctx.screen = screenTitle(snap);

  // Reading units: named, visible, not hidden, not grouped into an accessible ancestor.
  const int count = static_cast<int>(nodes.size());
  std::vector<bool> grouped(count, false);
  for (int q = 0; q < count; ++q) {
    int pp = idx.parentPos(q);
    grouped[q] = pp >= 0 && (grouped[pp] || nodes[pp].a11y.accessible);
  }
  auto isUnit = [&](int q) {
    return q != p && !idx.isAncestor(p, q) && !idx.isAncestor(q, p) && nodes[q].visible &&
           !nodes[q].a11y.hidden && !grouped[q] && !trim(nodes[q].name).empty();
  };
  for (int q = p - 1; q >= 0 && ctx.before.size() < kNeighbours; --q) {
    if (isUnit(q)) ctx.before.insert(ctx.before.begin(), sanitizeName(nodes[q].name, kContextNameLen));
  }
  for (int q = idx.subtreeEnd(p); q < count && ctx.after.size() < kNeighbours; ++q) {
    if (isUnit(q)) ctx.after.push_back(sanitizeName(nodes[q].name, kContextNameLen));
  }
  for (int a = idx.parentPos(p); a >= 0; a = idx.parentPos(a)) {
    if (!trim(nodes[a].name).empty()) {
      ctx.ancestor = sanitizeName(nodes[a].name, kContextNameLen);
      break;
    }
  }
  return ctx;
}

std::string formatLabelPrompt(const LabelContext& ctx) {
  std::string p;
  p += "screen: " + (ctx.screen.empty() ? std::string("(untitled)") : ctx.screen) + "\n";
  p += "control: " + ctx.component;
  if (!ctx.role.empty()) p += " role=" + ctx.role;
  if (!ctx.image.empty()) p += " image=" + ctx.image;
  if (!ctx.testID.empty()) p += " testID=" + sanitizeName(ctx.testID, kContextNameLen);
  if (!ctx.nativeID.empty()) p += " nativeID=" + sanitizeName(ctx.nativeID, kContextNameLen);
  p += "\n";
  if (!ctx.ancestor.empty()) p += "inside: \"" + ctx.ancestor + "\"\n";
  if (!ctx.before.empty()) p += "before: " + quoted(ctx.before) + "\n";
  if (!ctx.after.empty()) p += "after: " + quoted(ctx.after) + "\n";
  return p;
}

LabelRequest labelRequest(const Snapshot& snap, int64_t nodeId) {
  LabelContext ctx = buildLabelContext(snap, nodeId);
  LabelRequest req;
  req.system = kLabelSystemPrompt;
  req.prompt = formatLabelPrompt(ctx);
  req.grammar = kLabelGrammar;
  if (!ctx.image.empty()) {
    std::string fb = humanise(ctx.image);
    if (validateLabel(snap, nodeId, fb).ok) req.fallback = fb;
  }
  return req;
}

LabelValidation validateLabel(const Snapshot& snap, int64_t nodeId, const std::string& label) {
  LabelValidation v;
  const std::string norm = lower(trim(label));
  if (norm.empty()) {
    v.reason = "empty";
    return v;
  }
  if (words(norm).size() > 4) {
    v.reason = "too-long";
    return v;
  }
  if (kGeneric.count(norm)) {
    v.reason = "generic";
    return v;
  }
  SnapshotIndex idx(snap);
  const int p = idx.pos(nodeId);
  for (int q = 0; q < static_cast<int>(snap.nodes.size()); ++q) {
    const UiNode& o = snap.nodes[q];
    if (q == p || (p >= 0 && idx.isAncestor(p, q))) continue;
    if (o.visible && o.actionable && lower(trim(o.name)) == norm) {
      v.reason = "duplicate";
      return v;
    }
  }
  if (p >= 0) {
    std::string src = findImageSrc(snap, idx, p);
    if (!src.empty()) {
      std::string base = basenameOf(src);
      if (norm == lower(humaniseFull(base)) || norm == lower(base)) {
        v.reason = "file-name-echo";
        return v;
      }
    }
  }
  v.ok = true;
  return v;
}

std::optional<std::string> parseLabelReply(const std::string& text) {
  try {
    Json j = Json::parse(trim(text));
    if (!j.isObject()) return std::nullopt;
    const Json* l = j.get("label");
    if (!l || !l->isString()) return std::nullopt;
    std::string label = trim(sanitizeName(l->asString(), 60));
    if (label.empty()) return std::nullopt;
    return label;
  } catch (const JsonError&) {
    return std::nullopt;
  }
}

std::string labelPatch(const std::string& label) {
  std::string escaped;
  for (char c : label) {
    if (c == '"') escaped += "\\\"";
    else escaped += c;
  }
  return "accessibilityLabel=\"" + escaped + "\"";
}

}  // namespace waypoint
