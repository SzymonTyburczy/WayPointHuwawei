#include "waypoint/rules.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <unordered_map>

#include "waypoint/announce.hpp"
#include "waypoint/color.hpp"
#include "waypoint/finalize.hpp"
#include "waypoint/text.hpp"

namespace waypoint {

namespace {

double round2(double v) { return std::round(v * 100) / 100; }

std::string fmt(const char* f, double a, double b = 0) {
  char buf[128];
  std::snprintf(buf, sizeof buf, f, a, b);
  return buf;
}

bool drawsImage(const UiNode& n) { return n.drawsImage || n.component == "Image"; }

// True when an image or gradient may be painted behind the text at position p:
// on the text node or an ancestor, or as an earlier sibling of any node on the
// path (the ImageBackground pattern) whose frame overlaps the text.
bool imageBehind(const Snapshot& snap, const SnapshotIndex& idx, int p) {
  const auto& nodes = snap.nodes;
  for (int cur = p; cur >= 0; cur = idx.parentPos(cur)) {
    if (cur != p && drawsImage(nodes[cur])) return true;
    if (cur == p && nodes[cur].drawsImage) return true;
    int parent = idx.parentPos(cur);
    if (parent < 0) break;
    for (int sib : idx.children(parent)) {
      if (sib >= cur) break;
      for (int q = sib; q < idx.subtreeEnd(sib); ++q) {
        if (drawsImage(nodes[q]) && intersects(nodes[q].frame, nodes[p].frame)) return true;
      }
    }
  }
  return false;
}

Rgba effectiveBackground(const Snapshot& snap, const SnapshotIndex& idx, int p, const Rgba& windowBg) {
  std::vector<int> path;
  for (int cur = p; cur >= 0; cur = idx.parentPos(cur)) path.push_back(cur);
  Rgba bg = windowBg;
  bg.a = 1;
  for (auto it = path.rbegin(); it != path.rend(); ++it) {
    const UiNode& n = snap.nodes[*it];
    if (n.bg) bg = compositeOver(*n.bg, bg, n.opacity);
  }
  return bg;
}

}  // namespace

std::string findImageSrc(const Snapshot& snap, const SnapshotIndex& idx, int p) {
  for (int q = p; q < idx.subtreeEnd(p); ++q) {
    if (!snap.nodes[q].imageSrc.empty()) return snap.nodes[q].imageSrc;
  }
  return "";
}

std::optional<ContrastResult> evaluateContrast(const Snapshot& snap, const SnapshotIndex& idx, int p,
                                               const AuditOptions& opts) {
  const UiNode& n = snap.nodes[p];
  if (n.text.empty() || n.component == "TextInput") return std::nullopt;
  ContrastResult result;
  if (imageBehind(snap, idx, p)) {
    result.known = false;
    return result;
  }
  const Rgba bg = effectiveBackground(snap, idx, p, opts.windowBg);

  std::vector<TextRun> runs = n.runs;
  if (runs.empty()) runs.push_back(TextRun{n.fg.value_or(Rgba{0, 0, 0, 1}), n.fontSize.value_or(14), n.bold});

  bool first = true;
  double worstMargin = 0;
  for (const auto& run : runs) {
    const Rgba fg = compositeOver(run.fg, bg, n.opacity);
    const bool large = run.fontSize >= opts.largeTextVp || (run.bold && run.fontSize >= opts.largeBoldTextVp);
    const double threshold = large ? opts.largeContrast : opts.normalContrast;
    const double ratio = contrastRatio(fg, bg);
    const double margin = ratio / threshold;
    if (first || margin < worstMargin) {
      first = false;
      worstMargin = margin;
      result.ratio = ratio;
      result.threshold = threshold;
      result.large = large;
      result.fg = fg;
      result.bg = bg;
    }
  }
  return result;
}

AuditReport audit(const Snapshot& snap, const AuditOptions& opts) {
  AuditReport report;
  report.partial = snap.partial;
  report.nodeCount = snap.nodes.size();
  const SnapshotIndex idx(snap);
  const auto& nodes = snap.nodes;
  const int count = static_cast<int>(nodes.size());

  // R5 bookkeeping: first node seen for each normalised name.
  std::unordered_map<std::string, int64_t> firstByName;

  for (int p = 0; p < count; ++p) {
    const UiNode& n = nodes[p];
    auto add = [&](const char* rule, const char* severity, std::string message) -> Finding& {
      Finding f;
      f.rule = rule;
      f.severity = severity;
      f.nodeId = n.id;
      f.message = std::move(message);
      f.data.set("component", n.component);
      if (!n.testID.empty()) f.data.set("testID", n.testID);
      report.findings.push_back(std::move(f));
      return report.findings.back();
    };

    // R1: missing accessible name.
    if (n.actionable && trim(n.name).empty()) {
      Finding& f = add("R1", "error", "Actionable element has no accessible name");
      f.data.set("w", round2(n.frame.w));
      f.data.set("h", round2(n.frame.h));
      std::string src = findImageSrc(snap, idx, p);
      if (!src.empty()) f.data.set("imageSrc", src);
    }

    // R2: touch target too small.
    if (n.actionable) {
      double side = std::min(n.frame.w, n.frame.h);
      if (side < opts.recommendedTargetVp) {
        bool error = side < opts.minTargetVp;
        Finding& f = add("R2", error ? "error" : "warning",
                         error ? fmt("Touch target is %g vp; the minimum is 24 vp", round2(side))
                               : fmt("Touch target is %g vp; 44 vp is recommended", round2(side)));
        f.data.set("w", round2(n.frame.w));
        f.data.set("h", round2(n.frame.h));
      }
    }

    // R3: low text contrast.
    if (n.visible) {
      if (auto c = evaluateContrast(snap, idx, p, opts)) {
        if (!c->known) {
          report.contrastUnknown++;
        } else if (c->ratio < c->threshold) {
          Finding& f = add("R3", "error", fmt("Text contrast %.2f:1 is below %.1f:1", c->ratio, c->threshold));
          f.data.set("ratio", round2(c->ratio));
          f.data.set("threshold", c->threshold);
          f.data.set("fg", toHex(c->fg));
          f.data.set("bg", toHex(c->bg));
          f.data.set("large", c->large ? "yes" : "no");
        }
      }
    }

    // R4: missing role on a plain View.
    if (n.actionable && n.a11y.role.empty() && n.component == "View") {
      add("R4", "warning", "Actionable element has no accessibility role");
    }

    // R5: duplicate names among visible actionable nodes.
    if (n.actionable) {
      std::string key = lower(trim(n.name));
      if (!key.empty()) {
        auto [it, inserted] = firstByName.emplace(key, n.id);
        if (!inserted) {
          Finding& f = add("R5", "warning", "Another actionable element has the same name \"" + n.name + "\"");
          f.data.set("name", n.name);
          f.data.set("firstNodeId", static_cast<double>(it->second));
        }
      }
    }

    // R6: unnamed image outside any accessible element.
    if (n.component == "Image" && n.visible && !n.a11y.hidden && trim(n.name).empty()) {
      bool grouped = false;
      for (int a = idx.parentPos(p); a >= 0; a = idx.parentPos(a)) {
        if (nodes[a].a11y.accessible) {
          grouped = true;
          break;
        }
      }
      if (!grouped) {
        Finding& f = add("R6", "warning", "Image has no accessible name");
        if (!n.imageSrc.empty()) f.data.set("imageSrc", n.imageSrc);
      }
    }
  }
  // R8: focus order. Consecutive screen-reader stops should move down, or right
  // within a row (left-to-right UI). A stop entirely above the previous one, or
  // entirely to its left in the same row, makes the reader jump back.
  const auto order = screenReaderOrder(snap);
  for (size_t i = 1; i < order.size(); ++i) {
    const Rect& a = order[i - 1].frame;
    const Rect& b = order[i].frame;
    const double tol = 4;
    const double overlap = std::min(a.bottom(), b.bottom()) - std::max(a.y, b.y);
    const bool sameRow = overlap > 0.5 * std::min(a.h, b.h);
    const char* dir = nullptr;
    if (b.bottom() <= a.y - tol) dir = "up";
    else if (sameRow && b.right() <= a.x + tol) dir = "left";
    if (!dir) continue;
    const int p = idx.pos(order[i].id);
    if (p < 0) continue;
    Finding f;
    f.rule = "R8";
    f.severity = "warning";
    f.nodeId = order[i].id;
    f.message = std::string("Screen-reader focus jumps ") + dir + " from \"" + order[i - 1].text + "\"";
    f.data.set("component", nodes[p].component);
    if (!nodes[p].testID.empty()) f.data.set("testID", nodes[p].testID);
    f.data.set("direction", dir);
    f.data.set("from", order[i - 1].text);
    report.findings.push_back(std::move(f));
  }

  report.score = scoreScreen(snap, report, opts);
  return report;
}

A11yScore scoreScreen(const Snapshot& snap, const AuditReport& report, const AuditOptions& opts) {
  const SnapshotIndex idx(snap);
  int actionable = 0, texts = 0, images = 0;
  for (size_t p = 0; p < snap.nodes.size(); ++p) {
    const UiNode& n = snap.nodes[p];
    if (n.actionable) ++actionable;
    if (n.visible) {
      auto c = evaluateContrast(snap, idx, static_cast<int>(p), opts);
      if (c && c->known) ++texts;
    }
    if (n.component == "Image" && n.visible && !n.a11y.hidden) ++images;
  }
  double r1 = 0, r2 = 0, r3 = 0, r4 = 0, r5 = 0, r6 = 0;
  for (const auto& f : report.findings) {
    if (f.rule == "R1") r1 += 1;
    else if (f.rule == "R2") r2 += f.severity == "error" ? 1.0 : 0.5;
    else if (f.rule == "R3") r3 += 1;
    else if (f.rule == "R4") r4 += 1;
    else if (f.rule == "R5") r5 += 1;
    else if (f.rule == "R6") r6 += 1;
  }
  auto share = [](double bad, int total) { return total == 0 ? 1.0 : std::clamp(1.0 - bad / total, 0.0, 1.0); };
  A11yScore s;
  s.actionable = actionable;
  s.distinct = std::max(0, actionable - static_cast<int>(r1 + r5));
  s.names = share(r1 + r5, actionable);
  s.targets = share(r2, actionable);
  s.contrast = share(r3, texts);
  s.roles = share(r4, actionable);
  // Grouped images (inside an accessible element) never produce R6, so they pass.
  s.images = share(r6, images);
  s.score = static_cast<int>(std::lround(40 * s.names + 20 * s.targets + 20 * s.contrast + 10 * s.roles + 10 * s.images));
  s.grade = s.score >= 90 ? "A" : s.score >= 80 ? "B" : s.score >= 70 ? "C" : s.score >= 60 ? "D" : "F";
  return s;
}

}  // namespace waypoint
