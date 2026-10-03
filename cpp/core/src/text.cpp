#include "waypoint/text.hpp"

#include <cctype>

namespace waypoint {

namespace {

bool isWordChar(unsigned char c) { return std::isalnum(c) || c >= 0x80; }

std::vector<std::string> fileTokens(const std::string& base) {
  // Split on separators and camelCase boundaries: "icGearOutline" -> ic, gear, outline.
  std::vector<std::string> out;
  std::string cur;
  for (size_t i = 0; i < base.size(); ++i) {
    unsigned char c = static_cast<unsigned char>(base[i]);
    if (!std::isalnum(c)) {
      if (!cur.empty()) out.push_back(cur), cur.clear();
      continue;
    }
    if (std::isupper(c) && !cur.empty() && std::islower(static_cast<unsigned char>(cur.back()))) {
      out.push_back(cur), cur.clear();
    }
    cur += static_cast<char>(std::tolower(c));
  }
  if (!cur.empty()) out.push_back(cur);
  return out;
}

std::string capitalise(std::string s) {
  if (!s.empty()) s[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(s[0])));
  return s;
}

}  // namespace

std::string trim(const std::string& s) {
  size_t b = 0, e = s.size();
  while (b < e && std::isspace(static_cast<unsigned char>(s[b]))) ++b;
  while (e > b && std::isspace(static_cast<unsigned char>(s[e - 1]))) --e;
  return s.substr(b, e - b);
}

std::string lower(const std::string& s) {
  std::string out = s;
  for (auto& c : out) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return out;
}

std::vector<std::string> words(const std::string& s) {
  std::vector<std::string> out;
  std::string cur;
  for (unsigned char c : s) {
    if (isWordChar(c)) {
      cur += static_cast<char>(c < 0x80 ? std::tolower(c) : c);
    } else if (!cur.empty()) {
      out.push_back(cur);
      cur.clear();
    }
  }
  if (!cur.empty()) out.push_back(cur);
  return out;
}

std::set<std::string> trigrams(const std::string& s) {
  std::string norm = " ";
  for (const auto& w : words(s)) norm += w + " ";
  std::set<std::string> out;
  if (norm.size() < 3) return out;
  for (size_t i = 0; i + 3 <= norm.size(); ++i) out.insert(norm.substr(i, 3));
  return out;
}

double jaccard(const std::set<std::string>& a, const std::set<std::string>& b) {
  if (a.empty() && b.empty()) return 0;
  size_t inter = 0;
  for (const auto& x : a) inter += b.count(x);
  size_t uni = a.size() + b.size() - inter;
  return uni == 0 ? 0 : static_cast<double>(inter) / static_cast<double>(uni);
}

double candidateScore(const std::string& goal, const std::string& name) {
  auto gw = words(goal), nw = words(name);
  std::set<std::string> gs(gw.begin(), gw.end()), ns(nw.begin(), nw.end());
  return 0.6 * jaccard(gs, ns) + 0.4 * jaccard(trigrams(goal), trigrams(name));
}

std::string sanitizeName(const std::string& s, size_t maxLen) {
  std::string out;
  bool space = false;
  for (unsigned char c : s) {
    if (c < 0x20 || c == 0x7F || c == ' ') {
      space = !out.empty();
      continue;
    }
    if (space) out += ' ', space = false;
    out += c == '"' ? '\'' : static_cast<char>(c);
  }
  if (out.size() > maxLen) {
    size_t cut = maxLen;
    // Do not split a UTF-8 sequence: back up over continuation bytes.
    while (cut > 0 && (static_cast<unsigned char>(out[cut]) & 0xC0) == 0x80) --cut;
    out = trim(out.substr(0, cut));
  }
  return out;
}

std::string basenameOf(const std::string& path) {
  size_t slash = path.find_last_of("/\\");
  std::string base = slash == std::string::npos ? path : path.substr(slash + 1);
  size_t q = base.find_first_of("?#");
  if (q != std::string::npos) base = base.substr(0, q);
  size_t dot = base.find('.');
  if (dot != std::string::npos && dot > 0) base = base.substr(0, dot);
  size_t at = base.find('@');
  if (at != std::string::npos && at > 0) base = base.substr(0, at);
  return base;
}

std::string humaniseFull(const std::string& basename) {
  std::string out;
  for (const auto& t : fileTokens(basename)) {
    if (!out.empty()) out += ' ';
    out += t;
  }
  return capitalise(out);
}

std::string humanise(const std::string& basename) {
  static const std::set<std::string> kPrefixes = {"ic", "icon", "icons", "img", "image", "btn", "button",
                                                  "baseline", "outline", "outlined", "filled", "round", "rounded",
                                                  "sharp", "black", "white", "24dp", "24px", "48dp", "fill"};
  std::string out;
  for (const auto& t : fileTokens(basename)) {
    if (kPrefixes.count(t)) continue;
    bool digits = true;
    for (char c : t) digits = digits && std::isdigit(static_cast<unsigned char>(c));
    if (digits) continue;
    if (!out.empty()) out += ' ';
    out += t;
  }
  return capitalise(out);
}

}  // namespace waypoint
