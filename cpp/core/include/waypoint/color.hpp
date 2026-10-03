// sRGB colour maths for the contrast rule (RFC §7).
#pragma once

#include <optional>
#include <string>

namespace waypoint {

struct Rgba;

// Parses "#rgb", "#rrggbb" or "#rrggbbaa".
std::optional<Rgba> parseHexColor(const std::string& hex);
// "#rrggbb", alpha dropped.
std::string toHex(const Rgba& c);

// Linearises one sRGB channel in [0, 1].
double linearise(double c);
// WCAG relative luminance of an opaque colour.
double luminance(const Rgba& c);
// (Lmax + 0.05) / (Lmin + 0.05), in [1, 21].
double contrastRatio(const Rgba& a, const Rgba& b);
// Source-over compositing per channel: alpha * src + (1 - alpha) * dst, where
// alpha is src.a * extraAlpha. The result is opaque if dst is opaque.
Rgba compositeOver(const Rgba& src, const Rgba& dst, double extraAlpha = 1.0);

}  // namespace waypoint
