#include <algorithm>

#include "builder.hpp"
#include "test.hpp"
#include "waypoint/rules.hpp"

using namespace waypoint;
using namespace wptest;

namespace {

int countRule(const AuditReport& r, const std::string& rule) {
  return static_cast<int>(std::count_if(r.findings.begin(), r.findings.end(),
                                        [&](const Finding& f) { return f.rule == rule; }));
}

const Finding* findRule(const AuditReport& r, const std::string& rule, int64_t id) {
  for (const auto& f : r.findings) {
    if (f.rule == rule && f.nodeId == id) return &f;
  }
  return nullptr;
}

Builder screen() {
  Builder b;
  b.add(1, std::nullopt, "View", {0, 0, 360, 780});
  return b;
}

}  // namespace

TEST(r1_missing_name_fires_and_reports_image) {
  Builder b = screen();
  UiNode& icon = b.add(2, 1, "View", {300, 10, 48, 48});
  icon.a11y.accessible = true;
  icon.a11y.role = "button";
  b.add(3, 2, "Image", {312, 22, 24, 24}).imageSrc = "assets/ic_gear.png";
  b.button(4, 1, {0, 100, 360, 48}, "Named");
  AuditReport r = audit(b.done());
  EXPECT_EQ(countRule(r, "R1"), 1);
  const Finding* f = findRule(r, "R1", 2);
  EXPECT_TRUE(f != nullptr);
  EXPECT_EQ(f->severity, std::string("error"));
  EXPECT_EQ(f->data.str("imageSrc"), std::string("assets/ic_gear.png"));
  EXPECT_EQ(f->data.num("w"), 48.0);
}

TEST(r2_thresholds_at_boundaries) {
  Builder b = screen();
  b.button(2, 1, {0, 0, 100, 23.9}, "A");
  b.button(3, 1, {0, 50, 100, 24}, "B");
  b.button(4, 1, {0, 100, 100, 43.9}, "C");
  b.button(5, 1, {0, 150, 44, 44}, "D");
  AuditReport r = audit(b.done());
  EXPECT_EQ(findRule(r, "R2", 2)->severity, std::string("error"));
  EXPECT_EQ(findRule(r, "R2", 3)->severity, std::string("warning"));
  EXPECT_EQ(findRule(r, "R2", 4)->severity, std::string("warning"));
  EXPECT_TRUE(findRule(r, "R2", 5) == nullptr);
}

TEST(r3_low_contrast_normal_and_large_text) {
  Builder b = screen();
  UiNode& grey = b.add(2, 1, "Paragraph", {0, 0, 200, 20});
  grey.text = "Grey";
  grey.fg = hex("#999999");
  grey.fontSize = 30;  // large text still fails at 2.85
  UiNode& half = b.add(3, 1, "Paragraph", {0, 40, 200, 20});
  half.text = "Half black normal";
  half.fg = Rgba{0, 0, 0, 0.5};
  half.fontSize = 14;
  UiNode& halfLarge = b.add(4, 1, "Paragraph", {0, 80, 200, 20});
  halfLarge.text = "Half black large bold";
  halfLarge.fg = Rgba{0, 0, 0, 0.5};
  halfLarge.fontSize = 18.66;
  halfLarge.bold = true;
  UiNode& ok = b.add(5, 1, "Paragraph", {0, 120, 200, 20});
  ok.text = "Fine";
  ok.fg = hex("#767676");
  AuditReport r = audit(b.done());
  EXPECT_NEAR(findRule(r, "R3", 2)->data.num("ratio"), 2.85, 0.001);
  EXPECT_NEAR(findRule(r, "R3", 3)->data.num("ratio"), 3.98, 0.001);
  EXPECT_TRUE(findRule(r, "R3", 4) == nullptr);
  EXPECT_TRUE(findRule(r, "R3", 5) == nullptr);
}

TEST(r3_resolves_backgrounds_and_opacity) {
  // White text on a dark card that is 50 % transparent over white: the effective
  // background is mid grey, so contrast drops.
  Builder b = screen();
  UiNode& card = b.add(2, 1, "View", {0, 0, 360, 100});
  card.bg = Rgba{0, 0, 0, 0.5};
  UiNode& t = b.add(3, 2, "Paragraph", {10, 10, 200, 20});
  t.text = "On card";
  t.fg = hex("#FFFFFF");
  AuditReport r = audit(b.done());
  const Finding* f = findRule(r, "R3", 3);
  EXPECT_TRUE(f != nullptr);
  EXPECT_NEAR(f->data.num("ratio"), 3.98, 0.001);
  EXPECT_EQ(f->data.str("bg"), std::string("#808080"));

  // The same card at full alpha passes.
  Builder b2 = screen();
  b2.add(2, 1, "View", {0, 0, 360, 100}).bg = hex("#000000");
  UiNode& t2 = b2.add(3, 2, "Paragraph", {10, 10, 200, 20});
  t2.text = "On card";
  t2.fg = hex("#FFFFFF");
  EXPECT_EQ(countRule(audit(b2.done()), "R3"), 0);
}

TEST(r3_image_behind_text_is_unknown) {
  Builder b = screen();
  UiNode& bgView = b.add(2, 1, "View", {0, 0, 360, 200});
  (void)bgView;
  b.add(3, 2, "Image", {0, 0, 360, 200}).imageSrc = "hero.jpg";
  UiNode& t = b.add(4, 2, "Paragraph", {10, 10, 200, 20});
  t.text = "Over image";
  t.fg = hex("#999999");
  UiNode& grad = b.add(5, 1, "View", {0, 300, 360, 100});
  grad.drawsImage = true;
  UiNode& t2 = b.add(6, 5, "Paragraph", {0, 300, 100, 20});
  t2.text = "Over gradient";
  t2.fg = hex("#999999");
  AuditReport r = audit(b.done());
  EXPECT_EQ(countRule(r, "R3"), 0);
  EXPECT_EQ(r.contrastUnknown, 2);
}

TEST(r3_mixed_runs_checks_worst_fragment) {
  Builder b = screen();
  UiNode& t = b.add(2, 1, "Paragraph", {0, 0, 200, 20});
  t.text = "Total: 42";
  t.fg = hex("#000000");
  t.runs = {TextRun{hex("#000000"), 16, false}, TextRun{hex("#AAAAAA"), 16, false}};
  AuditReport r = audit(b.done());
  EXPECT_EQ(countRule(r, "R3"), 1);
}

TEST(r4_missing_role_on_plain_view_only) {
  Builder b = screen();
  UiNode& noRole = b.add(2, 1, "View", {0, 0, 100, 48});
  noRole.a11y.accessible = true;
  b.add(3, 2, "Paragraph", {0, 0, 100, 48}).text = "Tap me";
  b.button(4, 1, {0, 50, 100, 48}, "Has role");
  b.add(5, 1, "TextInput", {0, 100, 200, 48}).a11y.label = "Phone";
  AuditReport r = audit(b.done());
  EXPECT_EQ(countRule(r, "R4"), 1);
  EXPECT_TRUE(findRule(r, "R4", 2) != nullptr);
}

TEST(r5_duplicate_names_flag_later_occurrences) {
  Builder b = screen();
  b.button(2, 1, {0, 0, 100, 48}, "Edit");
  b.button(3, 1, {0, 50, 100, 48}, "edit ");
  b.button(4, 1, {0, 100, 100, 48}, "Edit");
  b.add(5, 1, "Paragraph", {0, 150, 100, 48}).text = "Edit";  // not actionable
  AuditReport r = audit(b.done());
  EXPECT_EQ(countRule(r, "R5"), 2);
  EXPECT_TRUE(findRule(r, "R5", 2) == nullptr);
  EXPECT_EQ(findRule(r, "R5", 4)->data.num("firstNodeId"), 2.0);
}

TEST(r6_unnamed_image_outside_accessible_elements) {
  Builder b = screen();
  b.add(2, 1, "Image", {0, 0, 100, 100}).imageSrc = "banner.png";       // fires
  b.add(3, 1, "Image", {0, 100, 100, 100}).a11y.label = "Map of zones";  // named
  UiNode& decorative = b.add(4, 1, "Image", {0, 200, 100, 100});
  decorative.a11y.hidden = true;                                         // hidden
  b.button(5, 1, {0, 300, 100, 48}, "Profile");
  b.add(6, 5, "Image", {0, 300, 24, 24});                                // grouped
  AuditReport r = audit(b.done());
  EXPECT_EQ(countRule(r, "R6"), 1);
  EXPECT_TRUE(findRule(r, "R6", 2) != nullptr);
}

TEST(clean_screen_has_no_findings) {
  Builder b = screen();
  UiNode& title = b.add(2, 1, "Paragraph", {16, 16, 200, 32});
  title.text = "Settings";
  title.fontSize = 24;
  title.fg = hex("#111111");
  title.a11y.accessible = true;
  title.a11y.role = "header";
  b.button(3, 1, {0, 64, 360, 56}, "Display");
  b.button(4, 1, {0, 120, 360, 56}, "Notifications");
  b.add(5, 1, "Image", {0, 200, 100, 100}).a11y.hidden = true;
  AuditReport r = audit(b.done());
  EXPECT_EQ(r.findings.size(), size_t{0});
  EXPECT_EQ(r.contrastUnknown, 0);
}

TEST(report_json_has_counts) {
  Builder b = screen();
  b.button(2, 1, {0, 0, 20, 20}, "");
  Json j = toJson(audit(b.done()));
  EXPECT_EQ(j["counts"].num("R1"), 1.0);
  EXPECT_EQ(j["counts"].num("R2"), 1.0);
  EXPECT_EQ(j["counts"].num("errors"), 2.0);
  EXPECT_EQ(j["counts"].num("R6"), 0.0);
}

TEST(score_is_100_for_a_clean_screen_and_drops_with_defects) {
  Builder clean = screen();
  clean.button(2, 1, {0, 0, 360, 56}, "Display");
  clean.button(3, 1, {0, 60, 360, 56}, "Privacy");
  AuditReport good = audit(clean.done());
  EXPECT_EQ(good.score.score, 100);
  EXPECT_EQ(good.score.grade, std::string("A"));
  EXPECT_EQ(good.score.distinct, 2);

  // Four unnamed tabs and one named button: names share 1/5.
  Builder tabs = screen();
  for (int i = 0; i < 4; ++i) {
    UiNode& t = tabs.add(10 + i, 1, "View", {i * 90.0, 716, 90, 64});
    t.a11y.accessible = true;
    t.a11y.role = "tab";
  }
  tabs.button(2, 1, {0, 64, 360, 56}, "Plan a journey");
  AuditReport bad = audit(tabs.done());
  EXPECT_NEAR(bad.score.names, 0.2, 1e-9);
  EXPECT_EQ(bad.score.distinct, 1);
  EXPECT_EQ(bad.score.score, 68);  // 40 * 0.2 + 20 + 20 + 10 + 10
  EXPECT_EQ(bad.score.grade, std::string("D"));
  Json j = toJson(bad);
  EXPECT_EQ(j["score"].num("score"), 68.0);
  EXPECT_EQ(j["score"].str("grade"), std::string("D"));
}

TEST(score_weights_r2_warnings_half) {
  Builder b = screen();
  b.button(2, 1, {0, 0, 100, 40}, "Warn");    // 40 vp: warning
  b.button(3, 1, {0, 50, 100, 56}, "Fine");
  AuditReport r = audit(b.done());
  EXPECT_NEAR(r.score.targets, 0.75, 1e-9);
  EXPECT_EQ(r.score.score, 95);
}
