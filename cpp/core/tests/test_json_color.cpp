#include "builder.hpp"
#include "test.hpp"
#include "waypoint/color.hpp"
#include "waypoint/json.hpp"

using namespace waypoint;
using wptest::hex;

TEST(json_roundtrip_preserves_order_and_values) {
  std::string src = R"({"b":1,"a":[true,false,null,-2.5,"x\n\"y\""],"c":{"d":"\u00e9\ud83d\ude00"}})";
  Json j = Json::parse(src);
  EXPECT_EQ(j["b"].asNumber(), 1.0);
  EXPECT_EQ(j["a"].size(), size_t{5});
  EXPECT_EQ(j["a"][4].asString(), std::string("x\n\"y\""));
  EXPECT_EQ(j["c"]["d"].asString(), std::string("\xC3\xA9\xF0\x9F\x98\x80"));
  EXPECT_EQ(Json::parse(j.dump()), j);
  EXPECT_EQ(j.dump().substr(0, 6), std::string("{\"b\":1"));
}

TEST(json_rejects_malformed_input) {
  for (const char* bad : {"", "{", "[1,]", "{\"a\" 1}", "tru", "\"unterminated", "01", "1.", "{\"a\":1}x",
                          "\"\\ud800\"", "[\"\x01\"]"}) {
    EXPECT_THROWS(Json::parse(bad));
  }
}

TEST(json_deep_nesting_is_bounded) {
  std::string deep(1000, '[');
  EXPECT_THROWS(Json::parse(deep));
}

TEST(json_numbers_format_shortest) {
  EXPECT_EQ(formatNumber(3), std::string("3"));
  EXPECT_EQ(formatNumber(-0.0), std::string("0"));
  EXPECT_EQ(formatNumber(2.85), std::string("2.85"));
  EXPECT_EQ(formatNumber(0.1 + 0.2), std::string("0.30000000000000004"));
}

TEST(json_copy_on_write) {
  Json a = Json::object();
  a.set("x", 1);
  Json b = a;
  b.set("x", 2);
  EXPECT_EQ(a.num("x"), 1.0);
  EXPECT_EQ(b.num("x"), 2.0);
}

TEST(contrast_black_on_white_is_21) {
  EXPECT_NEAR(contrastRatio(hex("#000000"), hex("#FFFFFF")), 21.0, 1e-9);
}

TEST(contrast_grey_999_on_white_is_2_85) {
  // RFC §7 worked example 1.
  EXPECT_NEAR(linearise(0.6), 0.3185, 5e-5);
  EXPECT_NEAR(contrastRatio(hex("#999999"), hex("#FFFFFF")), 2.85, 0.005);
}

TEST(contrast_767676_on_white_passes) {
  double cr = contrastRatio(hex("#767676"), hex("#FFFFFF"));
  EXPECT_NEAR(cr, 4.54, 0.005);
  EXPECT_TRUE(cr >= 4.5);
}

TEST(contrast_translucent_black_on_white_is_3_98) {
  // RFC §7 worked example 2: 50 % black composites to 0.5 grey.
  Rgba fg = compositeOver(Rgba{0, 0, 0, 1}, hex("#FFFFFF"), 0.5);
  EXPECT_NEAR(fg.r, 0.5, 1e-12);
  EXPECT_NEAR(linearise(0.5), 0.2140, 5e-5);
  EXPECT_NEAR(contrastRatio(fg, hex("#FFFFFF")), 3.98, 0.005);
}

TEST(composite_nested_translucent_backgrounds) {
  Rgba bg = hex("#FFFFFF");
  bg = compositeOver(Rgba{0, 0, 0, 0.5}, bg);       // 0.5 grey
  bg = compositeOver(Rgba{1, 0, 0, 0.5}, bg);       // half red over grey
  EXPECT_NEAR(bg.r, 0.75, 1e-12);
  EXPECT_NEAR(bg.g, 0.25, 1e-12);
  EXPECT_NEAR(bg.a, 1.0, 1e-12);
  // Opacity multiplies alpha.
  Rgba c = compositeOver(Rgba{0, 0, 0, 0.5}, hex("#FFFFFF"), 0.5);
  EXPECT_NEAR(c.r, 0.75, 1e-12);
}

TEST(hex_parse_and_format) {
  EXPECT_EQ(toHex(hex("#abc")), std::string("#AABBCC"));
  EXPECT_NEAR(hex("#00000080").a, 128 / 255.0, 1e-12);
  EXPECT_FALSE(parseHexColor("123456").has_value());
  EXPECT_FALSE(parseHexColor("#12345").has_value());
  EXPECT_FALSE(parseHexColor("#gg0000").has_value());
}
