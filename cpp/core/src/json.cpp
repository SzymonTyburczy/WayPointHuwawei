#include "waypoint/json.hpp"

#include <cmath>
#include <cstdio>
#include <cstdlib>

namespace waypoint {

namespace {

const Json kNull;

const char* typeName(Json::Type t) {
  switch (t) {
    case Json::Type::Null: return "null";
    case Json::Type::Bool: return "bool";
    case Json::Type::Number: return "number";
    case Json::Type::String: return "string";
    case Json::Type::Array: return "array";
    case Json::Type::Object: return "object";
  }
  return "?";
}

[[noreturn]] void typeError(Json::Type want, Json::Type got) {
  throw JsonError(std::string("JSON type error: expected ") + typeName(want) + ", got " + typeName(got));
}

void appendUtf8(std::string& out, uint32_t cp) {
  if (cp < 0x80) {
    out += static_cast<char>(cp);
  } else if (cp < 0x800) {
    out += static_cast<char>(0xC0 | (cp >> 6));
    out += static_cast<char>(0x80 | (cp & 0x3F));
  } else if (cp < 0x10000) {
    out += static_cast<char>(0xE0 | (cp >> 12));
    out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (cp & 0x3F));
  } else {
    out += static_cast<char>(0xF0 | (cp >> 18));
    out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
    out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (cp & 0x3F));
  }
}

class Parser {
 public:
  explicit Parser(const std::string& s) : s_(s) {}

  Json parseDocument() {
    skipWs();
    Json v = parseValue(0);
    skipWs();
    if (i_ != s_.size()) fail("trailing characters");
    return v;
  }

 private:
  static constexpr int kMaxDepth = 256;

  [[noreturn]] void fail(const std::string& what) const {
    throw JsonError("JSON parse error at offset " + std::to_string(i_) + ": " + what);
  }

  void skipWs() {
    while (i_ < s_.size() && (s_[i_] == ' ' || s_[i_] == '\t' || s_[i_] == '\n' || s_[i_] == '\r')) ++i_;
  }

  bool consume(const char* lit) {
    size_t n = 0;
    while (lit[n]) ++n;
    if (s_.compare(i_, n, lit) == 0) {
      i_ += n;
      return true;
    }
    return false;
  }

  Json parseValue(int depth) {
    if (depth > kMaxDepth) fail("nesting too deep");
    if (i_ >= s_.size()) fail("unexpected end of input");
    char c = s_[i_];
    if (c == '{') return parseObject(depth);
    if (c == '[') return parseArray(depth);
    if (c == '"') return Json(parseString());
    if (c == '-' || (c >= '0' && c <= '9')) return Json(parseNumber());
    if (consume("true")) return Json(true);
    if (consume("false")) return Json(false);
    if (consume("null")) return Json();
    fail(std::string("unexpected character '") + c + "'");
  }

  Json parseObject(int depth) {
    ++i_;  // {
    Json::Object obj;
    skipWs();
    if (i_ < s_.size() && s_[i_] == '}') {
      ++i_;
      return Json(std::move(obj));
    }
    while (true) {
      skipWs();
      if (i_ >= s_.size() || s_[i_] != '"') fail("expected object key");
      std::string key = parseString();
      skipWs();
      if (i_ >= s_.size() || s_[i_] != ':') fail("expected ':'");
      ++i_;
      skipWs();
      Json value = parseValue(depth + 1);
      bool replaced = false;
      for (auto& kv : obj) {
        if (kv.first == key) {
          kv.second = std::move(value);
          replaced = true;
          break;
        }
      }
      if (!replaced) obj.emplace_back(std::move(key), std::move(value));
      skipWs();
      if (i_ < s_.size() && s_[i_] == ',') {
        ++i_;
        continue;
      }
      if (i_ < s_.size() && s_[i_] == '}') {
        ++i_;
        return Json(std::move(obj));
      }
      fail("expected ',' or '}'");
    }
  }

  Json parseArray(int depth) {
    ++i_;  // [
    Json::Array arr;
    skipWs();
    if (i_ < s_.size() && s_[i_] == ']') {
      ++i_;
      return Json(std::move(arr));
    }
    while (true) {
      skipWs();
      arr.push_back(parseValue(depth + 1));
      skipWs();
      if (i_ < s_.size() && s_[i_] == ',') {
        ++i_;
        continue;
      }
      if (i_ < s_.size() && s_[i_] == ']') {
        ++i_;
        return Json(std::move(arr));
      }
      fail("expected ',' or ']'");
    }
  }

  uint32_t parseHex4() {
    if (i_ + 4 > s_.size()) fail("truncated \\u escape");
    uint32_t v = 0;
    for (int k = 0; k < 4; ++k) {
      char c = s_[i_++];
      v <<= 4;
      if (c >= '0' && c <= '9') v |= static_cast<uint32_t>(c - '0');
      else if (c >= 'a' && c <= 'f') v |= static_cast<uint32_t>(c - 'a' + 10);
      else if (c >= 'A' && c <= 'F') v |= static_cast<uint32_t>(c - 'A' + 10);
      else fail("bad hex digit in \\u escape");
    }
    return v;
  }

  std::string parseString() {
    ++i_;  // opening quote
    std::string out;
    while (true) {
      if (i_ >= s_.size()) fail("unterminated string");
      unsigned char c = static_cast<unsigned char>(s_[i_++]);
      if (c == '"') return out;
      if (c < 0x20) fail("control character in string");
      if (c != '\\') {
        out += static_cast<char>(c);
        continue;
      }
      if (i_ >= s_.size()) fail("unterminated escape");
      char e = s_[i_++];
      switch (e) {
        case '"': out += '"'; break;
        case '\\': out += '\\'; break;
        case '/': out += '/'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'u': {
          uint32_t cp = parseHex4();
          if (cp >= 0xD800 && cp <= 0xDBFF) {
            if (!(i_ + 1 < s_.size() && s_[i_] == '\\' && s_[i_ + 1] == 'u')) fail("lone high surrogate");
            i_ += 2;
            uint32_t lo = parseHex4();
            if (lo < 0xDC00 || lo > 0xDFFF) fail("bad low surrogate");
            cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
          } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
            fail("lone low surrogate");
          }
          appendUtf8(out, cp);
          break;
        }
        default: fail("bad escape");
      }
    }
  }

  double parseNumber() {
    size_t start = i_;
    if (s_[i_] == '-') ++i_;
    if (i_ >= s_.size()) fail("bad number");
    if (s_[i_] == '0') {
      ++i_;
    } else if (s_[i_] >= '1' && s_[i_] <= '9') {
      while (i_ < s_.size() && s_[i_] >= '0' && s_[i_] <= '9') ++i_;
    } else {
      fail("bad number");
    }
    if (i_ < s_.size() && s_[i_] == '.') {
      ++i_;
      if (i_ >= s_.size() || !(s_[i_] >= '0' && s_[i_] <= '9')) fail("bad fraction");
      while (i_ < s_.size() && s_[i_] >= '0' && s_[i_] <= '9') ++i_;
    }
    if (i_ < s_.size() && (s_[i_] == 'e' || s_[i_] == 'E')) {
      ++i_;
      if (i_ < s_.size() && (s_[i_] == '+' || s_[i_] == '-')) ++i_;
      if (i_ >= s_.size() || !(s_[i_] >= '0' && s_[i_] <= '9')) fail("bad exponent");
      while (i_ < s_.size() && s_[i_] >= '0' && s_[i_] <= '9') ++i_;
    }
    std::string token = s_.substr(start, i_ - start);
    return std::strtod(token.c_str(), nullptr);
  }

  const std::string& s_;
  size_t i_ = 0;
};

}  // namespace

bool Json::asBool() const {
  if (type_ != Type::Bool) typeError(Type::Bool, type_);
  return bool_;
}

double Json::asNumber() const {
  if (type_ != Type::Number) typeError(Type::Number, type_);
  return num_;
}

const std::string& Json::asString() const {
  if (type_ != Type::String) typeError(Type::String, type_);
  return str_;
}

const Json::Array& Json::asArray() const {
  if (type_ != Type::Array) typeError(Type::Array, type_);
  return *arr_;
}

Json::Array& Json::asArray() {
  if (type_ != Type::Array) typeError(Type::Array, type_);
  ensureUnique();
  return *arr_;
}

const Json::Object& Json::asObject() const {
  if (type_ != Type::Object) typeError(Type::Object, type_);
  return *obj_;
}

void Json::ensureUnique() {
  if (arr_ && arr_.use_count() > 1) arr_ = std::make_shared<Array>(*arr_);
  if (obj_ && obj_.use_count() > 1) obj_ = std::make_shared<Object>(*obj_);
}

const Json* Json::get(const std::string& key) const {
  if (type_ != Type::Object) return nullptr;
  for (const auto& kv : *obj_) {
    if (kv.first == key) return &kv.second;
  }
  return nullptr;
}

Json& Json::set(const std::string& key, Json value) {
  if (type_ == Type::Null) {
    type_ = Type::Object;
    obj_ = std::make_shared<Object>();
  }
  if (type_ != Type::Object) typeError(Type::Object, type_);
  ensureUnique();
  for (auto& kv : *obj_) {
    if (kv.first == key) {
      kv.second = std::move(value);
      return kv.second;
    }
  }
  obj_->emplace_back(key, std::move(value));
  return obj_->back().second;
}

const Json& Json::operator[](const std::string& key) const {
  const Json* v = get(key);
  return v ? *v : kNull;
}

void Json::push(Json value) {
  if (type_ == Type::Null) {
    type_ = Type::Array;
    arr_ = std::make_shared<Array>();
  }
  if (type_ != Type::Array) typeError(Type::Array, type_);
  ensureUnique();
  arr_->push_back(std::move(value));
}

size_t Json::size() const {
  if (type_ == Type::Array) return arr_->size();
  if (type_ == Type::Object) return obj_->size();
  return 0;
}

const Json& Json::operator[](size_t i) const {
  if (type_ != Type::Array) typeError(Type::Array, type_);
  if (i >= arr_->size()) throw JsonError("JSON index out of range");
  return (*arr_)[i];
}

double Json::num(const std::string& key, double def) const {
  const Json* v = get(key);
  if (!v || v->isNull()) return def;
  return v->asNumber();
}

bool Json::boolean(const std::string& key, bool def) const {
  const Json* v = get(key);
  if (!v || v->isNull()) return def;
  return v->asBool();
}

std::string Json::str(const std::string& key, const std::string& def) const {
  const Json* v = get(key);
  if (!v || v->isNull()) return def;
  return v->asString();
}

std::string jsonQuote(const std::string& s) {
  std::string out;
  out.reserve(s.size() + 2);
  out += '"';
  for (unsigned char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof buf, "\\u%04x", c);
          out += buf;
        } else {
          out += static_cast<char>(c);
        }
    }
  }
  out += '"';
  return out;
}

std::string formatNumber(double v) {
  if (!std::isfinite(v)) return "null";
  if (v == std::floor(v) && std::fabs(v) < 1e15) {
    char buf[32];
    std::snprintf(buf, sizeof buf, "%.0f", v);
    std::string s(buf);
    return s == "-0" ? "0" : s;
  }
  // Shortest representation that round-trips.
  char buf[40];
  for (int prec = 1; prec <= 17; ++prec) {
    std::snprintf(buf, sizeof buf, "%.*g", prec, v);
    if (std::strtod(buf, nullptr) == v) break;
  }
  return buf;
}

void Json::dumpTo(std::string& out) const {
  switch (type_) {
    case Type::Null: out += "null"; break;
    case Type::Bool: out += bool_ ? "true" : "false"; break;
    case Type::Number: out += formatNumber(num_); break;
    case Type::String: out += jsonQuote(str_); break;
    case Type::Array: {
      out += '[';
      bool first = true;
      for (const auto& v : *arr_) {
        if (!first) out += ',';
        first = false;
        v.dumpTo(out);
      }
      out += ']';
      break;
    }
    case Type::Object: {
      out += '{';
      bool first = true;
      for (const auto& kv : *obj_) {
        if (!first) out += ',';
        first = false;
        out += jsonQuote(kv.first);
        out += ':';
        kv.second.dumpTo(out);
      }
      out += '}';
      break;
    }
  }
}

std::string Json::dump() const {
  std::string out;
  dumpTo(out);
  return out;
}

Json Json::parse(const std::string& text) { return Parser(text).parseDocument(); }

bool Json::operator==(const Json& o) const {
  if (type_ != o.type_) return false;
  switch (type_) {
    case Type::Null: return true;
    case Type::Bool: return bool_ == o.bool_;
    case Type::Number: return num_ == o.num_;
    case Type::String: return str_ == o.str_;
    case Type::Array: return *arr_ == *o.arr_;
    case Type::Object: {
      if (obj_->size() != o.obj_->size()) return false;
      for (const auto& kv : *obj_) {
        const Json* other = o.get(kv.first);
        if (!other || !(*other == kv.second)) return false;
      }
      return true;
    }
  }
  return false;
}

}  // namespace waypoint
