// Minimal JSON value, parser and serializer.
//
// The core has no third-party dependencies (see docs/IMPLEMENTATION_PLAN.md, D1),
// so it carries its own JSON. Objects keep insertion order, which makes the
// serialised output stable and diff-friendly.
#pragma once

#include <cstdint>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace waypoint {

class JsonError : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

class Json {
 public:
  enum class Type { Null, Bool, Number, String, Array, Object };
  using Array = std::vector<Json>;
  using Object = std::vector<std::pair<std::string, Json>>;

  Json() = default;
  Json(std::nullptr_t) {}
  Json(bool b) : type_(Type::Bool), bool_(b) {}
  Json(int n) : type_(Type::Number), num_(n) {}
  Json(long n) : type_(Type::Number), num_(static_cast<double>(n)) {}
  Json(long long n) : type_(Type::Number), num_(static_cast<double>(n)) {}
  Json(unsigned n) : type_(Type::Number), num_(n) {}
  Json(unsigned long n) : type_(Type::Number), num_(static_cast<double>(n)) {}
  Json(unsigned long long n) : type_(Type::Number), num_(static_cast<double>(n)) {}
  Json(double n) : type_(Type::Number), num_(n) {}
  Json(float n) : type_(Type::Number), num_(n) {}
  Json(const char* s) : type_(Type::String), str_(s) {}
  Json(std::string s) : type_(Type::String), str_(std::move(s)) {}
  Json(Array a) : type_(Type::Array), arr_(std::make_shared<Array>(std::move(a))) {}
  Json(Object o) : type_(Type::Object), obj_(std::make_shared<Object>(std::move(o))) {}

  static Json array() { return Json(Array{}); }
  static Json object() { return Json(Object{}); }

  Type type() const { return type_; }
  bool isNull() const { return type_ == Type::Null; }
  bool isBool() const { return type_ == Type::Bool; }
  bool isNumber() const { return type_ == Type::Number; }
  bool isString() const { return type_ == Type::String; }
  bool isArray() const { return type_ == Type::Array; }
  bool isObject() const { return type_ == Type::Object; }

  bool asBool() const;
  double asNumber() const;
  const std::string& asString() const;
  const Array& asArray() const;
  Array& asArray();
  const Object& asObject() const;

  // Object access. `get` returns nullptr when the key is absent.
  const Json* get(const std::string& key) const;
  bool has(const std::string& key) const { return get(key) != nullptr; }
  // Inserts or replaces a key; the object keeps first-insertion order.
  Json& set(const std::string& key, Json value);
  const Json& operator[](const std::string& key) const;

  // Array access.
  void push(Json value);
  size_t size() const;
  const Json& operator[](size_t i) const;

  // Typed lookups with defaults; absent or null keys return the default.
  double num(const std::string& key, double def = 0) const;
  bool boolean(const std::string& key, bool def = false) const;
  std::string str(const std::string& key, const std::string& def = "") const;

  std::string dump() const;
  static Json parse(const std::string& text);

  bool operator==(const Json& other) const;
  bool operator!=(const Json& other) const { return !(*this == other); }

 private:
  void ensureUnique();
  void dumpTo(std::string& out) const;

  Type type_ = Type::Null;
  bool bool_ = false;
  double num_ = 0;
  std::string str_;
  // Shared storage keeps copies cheap; mutation copies on write.
  std::shared_ptr<Array> arr_;
  std::shared_ptr<Object> obj_;
};

// Escapes a string as a JSON string literal, including the quotes.
std::string jsonQuote(const std::string& s);
// Formats a number the way Json::dump does: integers without a fraction,
// other values with up to 6 significant decimals, no exponent for typical ranges.
std::string formatNumber(double v);

}  // namespace waypoint
