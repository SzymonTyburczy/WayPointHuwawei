#include "builder.hpp"
#include "test.hpp"
#include "waypoint/finalize.hpp"
#include "waypoint/raw_tree.hpp"
#include "waypoint/walker.hpp"

using namespace waypoint;
using namespace wptest;

namespace {

RawNode raw(int64_t tag, const char* component, Rect frame) {
  RawNode r;
  r.tag = tag;
  r.frame = frame;
  r.props.component = component;
  return r;
}

Snapshot walk(const RawNode& root) { return walkTree(RawAdapter{}, root, Rect{0, 0, 360, 780}, 1); }

}  // namespace

TEST(walker_absolute_frames_and_preorder) {
  RawNode root = raw(1, "View", {0, 0, 360, 780});
  RawNode a = raw(2, "View", {10, 20, 100, 100});
  a.children.push_back(raw(3, "View", {5, 5, 10, 10}));
  root.children.push_back(a);
  root.children.push_back(raw(4, "View", {0, 200, 50, 50}));
  Snapshot s = walk(root);
  EXPECT_EQ(s.nodes.size(), size_t{4});
  EXPECT_EQ(s.nodes[2].id, int64_t{3});
  EXPECT_EQ(s.nodes[2].frame.x, 15.0);
  EXPECT_EQ(s.nodes[2].frame.y, 25.0);
  EXPECT_EQ(s.nodes[2].depth, 2);
  EXPECT_EQ(*s.nodes[2].parent, int64_t{2});
  EXPECT_EQ(s.nodes[3].id, int64_t{4});
  EXPECT_FALSE(s.nodes[0].parent.has_value());
}

TEST(walker_scroll_offset_and_clipping) {
  RawNode root = raw(1, "View", {0, 0, 360, 780});
  RawNode scroll = raw(2, "ScrollView", {0, 100, 360, 400});
  scroll.scrollY = 300;
  scroll.clip = true;
  RawNode content = raw(3, "View", {0, 0, 360, 1200});
  content.children.push_back(raw(4, "View", {0, 0, 360, 50}));    // scrolled out above
  content.children.push_back(raw(5, "View", {0, 350, 360, 50}));  // on screen at y=150
  content.children.push_back(raw(6, "View", {0, 900, 360, 50}));  // below the clip
  scroll.children.push_back(content);
  root.children.push_back(scroll);
  Snapshot s = walk(root);
  EXPECT_EQ(byId(s, 4).frame.y, -200.0);
  EXPECT_FALSE(byId(s, 4).visible);
  EXPECT_EQ(byId(s, 5).frame.y, 150.0);
  EXPECT_TRUE(byId(s, 5).visible);
  EXPECT_FALSE(byId(s, 6).visible);
}

TEST(walker_opacity_display_none_and_viewport) {
  RawNode root = raw(1, "View", {0, 0, 360, 780});
  RawNode faded = raw(2, "View", {0, 0, 100, 100});
  faded.opacity = 0.5;
  RawNode inner = raw(3, "View", {0, 0, 10, 10});
  inner.opacity = 0.5;
  faded.children.push_back(inner);
  root.children.push_back(faded);
  RawNode gone = raw(4, "View", {0, 0, 100, 100});
  gone.displayNone = true;
  gone.children.push_back(raw(5, "View", {0, 0, 10, 10}));
  root.children.push_back(gone);
  RawNode zero = raw(6, "View", {0, 0, 100, 100});
  zero.opacity = 0;
  root.children.push_back(zero);
  root.children.push_back(raw(7, "View", {400, 0, 10, 10}));  // off screen to the right
  Snapshot s = walk(root);
  EXPECT_NEAR(byId(s, 3).opacity, 0.25, 1e-12);
  EXPECT_TRUE(byId(s, 3).visible);
  EXPECT_FALSE(byId(s, 4).visible);
  EXPECT_FALSE(byId(s, 5).visible);
  EXPECT_FALSE(byId(s, 6).visible);
  EXPECT_FALSE(byId(s, 7).visible);
}

TEST(walker_caps_at_max_nodes) {
  RawNode root = raw(1, "View", {0, 0, 360, 780});
  for (int i = 0; i < 600; ++i) root.children.push_back(raw(10 + i, "View", {0, 0, 1, 1}));
  Snapshot s = walk(root);
  EXPECT_EQ(s.nodes.size(), size_t{500});
  EXPECT_TRUE(s.partial);
}

TEST(raw_tree_from_json) {
  Json j = Json::parse(R"({"tag":1,"component":"View","frame":{"x":0,"y":0,"w":360,"h":780},
    "children":[{"tag":2,"component":"Paragraph","frame":{"x":10,"y":10,"w":100,"h":20},
                 "props":{"text":"Hello","fg":"#333333","fontSize":16}}]})");
  Snapshot s = walk(rawNodeFromJson(j));
  finalize(s);
  EXPECT_EQ(s.nodes.size(), size_t{2});
  EXPECT_EQ(s.nodes[1].component, std::string("Paragraph"));
  EXPECT_EQ(s.nodes[1].name, std::string("Hello"));
  EXPECT_EQ(s.nodes[1].frame.x, 10.0);
}

TEST(name_label_then_text_then_grouped_children) {
  Builder b;
  b.add(1, std::nullopt, "View", {0, 0, 360, 780});
  UiNode& labelled = b.add(2, 1, "View", {0, 0, 100, 48});
  labelled.a11y.accessible = true;
  labelled.a11y.label = "Settings";
  b.add(3, 2, "Paragraph", {0, 0, 100, 48}).text = "Gear";
  UiNode& group = b.add(4, 1, "View", {0, 50, 200, 48});
  group.a11y.accessible = true;
  b.add(5, 4, "View", {0, 50, 100, 48});
  b.add(6, 5, "Paragraph", {0, 50, 100, 24}).text = "Anna";
  b.add(7, 4, "Paragraph", {0, 74, 100, 24}).text = "Kowalska";
  UiNode& hidden = b.add(8, 4, "Paragraph", {0, 74, 100, 24});
  hidden.text = "secret";
  hidden.a11y.hidden = true;
  UiNode& plain = b.add(9, 1, "View", {0, 100, 100, 48});  // not accessible, no own text
  (void)plain;
  b.add(10, 9, "Paragraph", {0, 100, 100, 48}).text = "child";
  UiNode& input = b.add(11, 1, "TextInput", {0, 150, 200, 48});
  input.placeholder = "Phone number";
  Snapshot s = b.done();
  EXPECT_EQ(byId(s, 2).name, std::string("Settings"));
  EXPECT_EQ(byId(s, 3).name, std::string("Gear"));
  EXPECT_EQ(byId(s, 4).name, std::string("Anna Kowalska"));
  EXPECT_EQ(byId(s, 9).name, std::string(""));
  EXPECT_EQ(byId(s, 11).name, std::string("Phone number"));
}

TEST(hidden_is_inherited) {
  Builder b;
  b.add(1, std::nullopt, "View", {0, 0, 360, 780}).a11y.hidden = true;
  UiNode& btn = b.add(2, 1, "View", {0, 0, 100, 48});
  btn.a11y.accessible = true;
  btn.a11y.role = "button";
  Snapshot s = b.done();
  EXPECT_TRUE(byId(s, 2).a11y.hidden);
  EXPECT_FALSE(byId(s, 2).actionable);
}

TEST(actionability_truth_table) {
  Builder b;
  b.add(1, std::nullopt, "View", {0, 0, 360, 780});
  b.add(2, 1, "View", {0, 0, 50, 50}).a11y.role = "link";             // role
  b.add(3, 1, "TextInput", {0, 0, 50, 50});                           // component
  b.add(4, 1, "View", {0, 0, 50, 50}).a11y.accessible = true;         // accessible view
  UiNode& text = b.add(5, 1, "Paragraph", {0, 0, 50, 50});            // text is not actionable
  text.a11y.accessible = true;
  text.text = "x";
  UiNode& header = b.add(6, 1, "View", {0, 0, 50, 50});               // non-interactive role
  header.a11y.accessible = true;
  header.a11y.role = "header";
  UiNode& disabled = b.add(7, 1, "View", {0, 0, 50, 50});
  disabled.a11y.role = "button";
  disabled.a11y.disabled = true;
  UiNode& invisible = b.add(8, 1, "View", {0, 0, 50, 50});
  invisible.a11y.role = "button";
  invisible.visible = false;
  b.add(9, 1, "View", {0, 0, 50, 50}).pressable = true;               // plan B registry
  UiNode& img = b.add(10, 1, "Image", {0, 0, 50, 50});
  img.a11y.accessible = true;
  b.add(11, 1, "View", {0, 0, 50, 50});                               // plain container
  Snapshot s = b.done();
  EXPECT_TRUE(byId(s, 2).actionable);
  EXPECT_TRUE(byId(s, 3).actionable);
  EXPECT_TRUE(byId(s, 4).actionable);
  EXPECT_FALSE(byId(s, 5).actionable);
  EXPECT_FALSE(byId(s, 6).actionable);
  EXPECT_FALSE(byId(s, 7).actionable);
  EXPECT_FALSE(byId(s, 8).actionable);
  EXPECT_TRUE(byId(s, 9).actionable);
  EXPECT_FALSE(byId(s, 10).actionable);
  EXPECT_FALSE(byId(s, 11).actionable);
}

TEST(modal_occludes_everything_else) {
  Builder b;
  b.add(1, std::nullopt, "View", {0, 0, 360, 780});
  b.button(2, 1, {0, 0, 100, 48}, "Behind");
  b.add(3, 1, "ModalHostView", {0, 0, 360, 780});
  b.button(4, 3, {0, 0, 100, 48}, "Confirm");
  Snapshot s = b.done();
  EXPECT_FALSE(byId(s, 2).visible);
  EXPECT_FALSE(byId(s, 2).actionable);
  EXPECT_TRUE(byId(s, 4).actionable);
}

TEST(rev_is_stable_and_detects_name_change) {
  Builder b;
  b.add(1, std::nullopt, "View", {0, 0, 360, 780});
  b.button(2, 1, {0, 0, 100, 48}, "Display");
  Snapshot s1 = b.done();
  Snapshot s2 = b.done();
  EXPECT_EQ(s1.rev, s2.rev);
  EXPECT_EQ(s1.rev.size(), size_t{16});
  b.node(200).text = "Displays";
  Snapshot s3 = b.done();
  EXPECT_TRUE(s1.rev != s3.rev);
  // Sub-pixel jitter does not change rev.
  b.node(200).text = "Display";
  b.node(2).frame.x = 0.2;
  EXPECT_EQ(b.done().rev, s1.rev);
  // A toggled state is a change.
  b.node(2).a11y.checked = "true";
  EXPECT_TRUE(b.done().rev != s1.rev);
}

TEST(finalize_is_idempotent) {
  Builder b;
  b.add(1, std::nullopt, "View", {0, 0, 360, 780});
  b.button(2, 1, {0, 0, 100, 48}, "OK");
  Snapshot s1 = b.done();
  Snapshot s2 = s1;
  finalize(s2);
  EXPECT_EQ(toJson(s1).dump(), toJson(s2).dump());
}

TEST(snapshot_json_roundtrip) {
  Builder b;
  b.add(1, std::nullopt, "View", {0, 0, 360, 780}).bg = hex("#FAFAFA");
  UiNode& t = b.add(2, 1, "Paragraph", {1.5, 2, 3, 4});
  t.text = "Hi";
  t.fg = hex("#123456");
  t.fontSize = 18;
  t.bold = true;
  t.a11y.selected = true;
  t.a11y.checked = "mixed";
  t.runs.push_back(TextRun{hex("#FF0000"), 12, false});
  Snapshot s = b.done();
  Snapshot back = snapshotFromJson(Json::parse(toJson(s).dump()));
  EXPECT_EQ(toJson(back).dump(), toJson(s).dump());
}

TEST(overlay_subtree_is_dropped) {
  Builder b;
  b.add(1, std::nullopt, "View", {0, 0, 360, 780});
  b.button(2, 1, {0, 0, 100, 48}, "App button");
  b.add(3, 1, "View", {0, 0, 360, 780}).nativeID = "waypoint-overlay";
  b.button(4, 3, {0, 700, 100, 48}, "Stop guide");
  b.button(5, 1, {0, 100, 100, 48}, "After");
  Snapshot s = b.done();
  EXPECT_EQ(s.nodes.size(), size_t{5});
  for (const auto& n : s.nodes) EXPECT_TRUE(n.name != "Stop guide");
  EXPECT_EQ(s.nodes.back().name, std::string("After"));
}
