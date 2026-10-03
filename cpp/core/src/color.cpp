#include "waypoint/color.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "waypoint/model.hpp"

namespace waypoint {

namespace {

int hexDigit(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

}  // namespace

std::optional<Rgba> parseHexColor(const std::string& hex) {
  if (hex.empty() || hex[0] != '#') return std::nullopt;
  std::string h = hex.substr(1);
  if (h.size() == 3) h = std::string{h[0], h[0], h[1], h[1], h[2], h[2]};
  if (h.size() != 6 && h.size() != 8) return std::nullopt;
  double ch[4] = {0, 0, 0, 1};
  for (size_t k = 0; k < h.size() / 2; ++k) {
    int hi = hexDigit(h[2 * k]), lo = hexDigit(h[2 * k + 1]);
    if (hi < 0 || lo < 0) return std::nullopt;
    ch[k] = (hi * 16 + lo) / 255.0;
  }
  return Rgba{ch[0], ch[1], ch[2], ch[3]};
}

std::string toHex(const Rgba& c) {
  auto byte = [](double v) { return static_cast<int>(std::lround(std::clamp(v, 0.0, 1.0) * 255)); };
  char buf[8];
  std::snprintf(buf, sizeof buf, "#%02X%02X%02X", byte(c.r), byte(c.g), byte(c.b));
  return buf;
}

double linearise(double c) {
  return c <= 0.04045 ? c / 12.92 : std::pow((c + 0.055) / 1.055, 2.4);
}

double luminance(const Rgba& c) {
  return 0.2126 * linearise(c.r) + 0.7152 * linearise(c.g) + 0.0722 * linearise(c.b);
}

double contrastRatio(const Rgba& a, const Rgba& b) {
  double la = luminance(a), lb = luminance(b);
  double hi = std::max(la, lb), lo = std::min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

Rgba compositeOver(const Rgba& src, const Rgba& dst, double extraAlpha) {
  double alpha = std::clamp(src.a * extraAlpha, 0.0, 1.0);
  Rgba out;
  out.r = alpha * src.r + (1 - alpha) * dst.r;
  out.g = alpha * src.g + (1 - alpha) * dst.g;
  out.b = alpha * src.b + (1 - alpha) * dst.b;
  out.a = alpha + (1 - alpha) * dst.a;
  return out;
}

}  // namespace waypoint
