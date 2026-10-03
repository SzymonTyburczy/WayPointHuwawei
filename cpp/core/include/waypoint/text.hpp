// Small string helpers shared by the planner, the label module and the rules.
// ASCII case folding only: the MVP is English-only (RFC §3 non-goals).
#pragma once

#include <set>
#include <string>
#include <vector>

namespace waypoint {

std::string trim(const std::string& s);
std::string lower(const std::string& s);
// Lower-cased words of letters and digits.
std::vector<std::string> words(const std::string& s);
// Character trigrams of the lower-cased, space-normalised string, padded with spaces.
std::set<std::string> trigrams(const std::string& s);
double jaccard(const std::set<std::string>& a, const std::set<std::string>& b);
// 0.6 * J_word + 0.4 * J_tri (RFC §9).
double candidateScore(const std::string& goal, const std::string& name);
// Removes control characters and newlines, collapses whitespace, replaces double
// quotes with single quotes and cuts to maxLen bytes on a UTF-8 boundary.
std::string sanitizeName(const std::string& s, size_t maxLen = 60);
// "assets/icons/ic_gear@2x.png" -> "ic_gear"
std::string basenameOf(const std::string& path);
// "ic_gear" -> "Ic gear"  (every token kept)
std::string humaniseFull(const std::string& basename);
// "ic_gear" -> "Gear"     (common icon prefixes dropped)
std::string humanise(const std::string& basename);

}  // namespace waypoint
