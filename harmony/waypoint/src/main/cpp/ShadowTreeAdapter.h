// Adapter that lets waypoint::TreeWalker traverse React Native's committed shadow
// tree (RFC-001 §6). This is the only file that touches React Native internals.
//
// Names follow upstream React Native 0.77. They are NOT yet verified against the
// RNOH fork: spike S2 (docs/SPIKES.md) checks every API marked "S2" below and
// records the result. Plan B (a JS registry feeding WaypointCore.finalize) needs
// none of this.
#pragma once

#include <cmath>
#include <string>

#include <react/renderer/attributedstring/AttributedString.h>
#include <react/renderer/components/image/ImageProps.h>
#include <react/renderer/components/text/ParagraphShadowNode.h>
#include <react/renderer/components/view/ViewProps.h>
#include <react/renderer/core/LayoutableShadowNode.h>
#include <react/renderer/core/ShadowNode.h>
#include <react/renderer/graphics/Color.h>

#include "waypoint/model.hpp"

namespace waypoint::rnoh {

using facebook::react::LayoutableShadowNode;
using facebook::react::ShadowNode;
using facebook::react::ViewProps;

inline std::optional<Rgba> toRgba(const facebook::react::SharedColor& c) {
  if (!c) return std::nullopt;
  auto comps = facebook::react::colorComponentsFromColor(c);  // S2: RNOH platform Color
  return Rgba{comps.red, comps.green, comps.blue, comps.alpha};
}

// Host component names differ per platform; the core expects a small fixed set.
inline std::string normaliseComponent(const std::string& name) {
  if (name == "Paragraph" || name == "Text") return "Paragraph";
  if (name.find("TextInput") != std::string::npos) return "TextInput";
  if (name.find("Switch") != std::string::npos) return "Switch";
  if (name == "Image" || name == "FastImageView") return "Image";
  if (name.find("ScrollView") != std::string::npos) return "ScrollView";
  if (name == "ModalHostView") return "ModalHostView";
  return name.empty() ? "View" : name;
}

// AccessibilityState::checked is an unnamed enum in RN 0.77.
inline std::string checkedString(const facebook::react::AccessibilityState& s) {
  using AS = facebook::react::AccessibilityState;
  if (s.checked == AS::Checked) return "true";
  if (s.checked == AS::Unchecked) return "false";
  if (s.checked == AS::Mixed) return "mixed";
  return "";
}

struct ShadowTreeAdapter {
  using Node = ShadowNode;

  int64_t tag(const Node& n) const { return n.getTag(); }

  static const LayoutableShadowNode* layoutable(const Node& n) {
    return dynamic_cast<const LayoutableShadowNode*>(&n);
  }

  Rect layoutFrame(const Node& n) const {
    const auto* l = layoutable(n);
    if (!l) return {};
    const auto& f = l->getLayoutMetrics().frame;
    return Rect{f.origin.x, f.origin.y, f.size.width, f.size.height};
  }

  bool displayNone(const Node& n) const {
    const auto* l = layoutable(n);
    return l && l->getLayoutMetrics().displayType == facebook::react::DisplayType::None;
  }

  double opacity(const Node& n) const {
    auto props = std::dynamic_pointer_cast<const ViewProps>(n.getProps());
    return props ? props->opacity : 1.0;
  }

  // ScrollView reports its content offset as a negative content origin (S2).
  Rect scrollOffset(const Node& n) const {
    const auto* l = layoutable(n);
    if (!l || normaliseComponent(n.getComponentName()) != "ScrollView") return {};
    auto origin = l->getContentOriginOffset(false);
    return Rect{-origin.x, -origin.y, 0, 0};
  }

  bool clipsChildren(const Node& n) const {
    if (normaliseComponent(n.getComponentName()) == "ScrollView") return true;
    auto props = std::dynamic_pointer_cast<const ViewProps>(n.getProps());
    return props && props->getClipsContentToBounds();
  }

  void fill(const Node& n, UiNode& out) const {
    out.component = normaliseComponent(n.getComponentName());
    if (auto props = std::dynamic_pointer_cast<const ViewProps>(n.getProps())) {
      out.bg = toRgba(props->backgroundColor);
      out.a11y.accessible = props->accessible;
      out.a11y.label = props->accessibilityLabel;
      out.a11y.hint = props->accessibilityHint;
      out.a11y.role = props->accessibilityRole;
      if (props->accessibilityState) {
        out.a11y.disabled = props->accessibilityState->disabled;
        out.a11y.selected = props->accessibilityState->selected;
        out.a11y.checked = checkedString(*props->accessibilityState);
      }
      out.a11y.hidden = props->accessibilityElementsHidden ||
                        props->importantForAccessibility == facebook::react::ImportantForAccessibility::NoHideDescendants;
      out.testID = props->testId;
      out.nativeID = props->nativeId;
    }
    if (out.component == "Paragraph") fillParagraph(n, out);
    if (out.component == "Image") {
      if (auto img = std::dynamic_pointer_cast<const facebook::react::ImageProps>(n.getProps())) {
        if (!img->sources.empty()) out.imageSrc = img->sources.front().uri;
      }
    }
    // TextInput values are never read: secureTextEntry fields must not leak (RFC §13),
    // and plain values are not needed for any rule. Placeholders are a known gap.
  }

  static void fillParagraph(const Node& n, UiNode& out) {
    const auto* p = dynamic_cast<const facebook::react::ParagraphShadowNode*>(&n);
    if (!p) return;
    // S2: the attributed string lives in the paragraph's state in RN 0.77.
    const auto& as = p->getStateData().attributedString;
    bool first = true;
    bool mixed = false;
    Rgba firstFg{0, 0, 0, 1};
    double firstSize = 14;
    bool firstBold = false;
    std::vector<TextRun> runs;
    for (const auto& frag : as.getFragments()) {
      out.text += frag.string;
      const auto& ta = frag.textAttributes;
      Rgba fg = toRgba(ta.foregroundColor).value_or(Rgba{0, 0, 0, 1});
      double size = std::isnan(ta.fontSize) ? 14.0 : ta.fontSize;
      bool bold = ta.fontWeight && static_cast<int>(*ta.fontWeight) >= 600;
      runs.push_back(TextRun{fg, size, bold});
      if (first) {
        firstFg = fg, firstSize = size, firstBold = bold, first = false;
      } else if (fg.r != firstFg.r || fg.g != firstFg.g || fg.b != firstFg.b || fg.a != firstFg.a || size != firstSize ||
                 bold != firstBold) {
        mixed = true;
      }
    }
    out.fg = firstFg;
    out.fontSize = firstSize;
    out.bold = firstBold;
    if (mixed) out.runs = std::move(runs);
  }

  template <class F>
  void forEachChild(const Node& n, F&& f) const {
    // Paragraph children are virtual text nodes; their text was collected above.
    if (normaliseComponent(n.getComponentName()) == "Paragraph") return;
    for (const auto& child : n.getChildren()) {
      if (layoutable(*child)) f(*child);
    }
  }
};

}  // namespace waypoint::rnoh
