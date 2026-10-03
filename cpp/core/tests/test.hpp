// Tiny self-contained test harness (no third-party dependency, see plan D1).
#pragma once

#include <cmath>
#include <cstdio>
#include <functional>
#include <sstream>
#include <string>
#include <vector>

#include "waypoint/json.hpp"

namespace waypoint {
inline std::ostream& operator<<(std::ostream& os, const Json& j) { return os << j.dump(); }
}  // namespace waypoint

namespace wptest {

struct Case {
  const char* name;
  std::function<void()> fn;
};

inline std::vector<Case>& registry() {
  static std::vector<Case> r;
  return r;
}

struct Failure {
  std::string message;
};

struct Registrar {
  Registrar(const char* name, std::function<void()> fn) { registry().push_back({name, std::move(fn)}); }
};

template <class A, class B>
void checkEq(const A& a, const B& b, const char* ea, const char* eb, const char* file, int line) {
  if (!(a == b)) {
    std::ostringstream os;
    os << file << ":" << line << ": expected " << ea << " == " << eb << "\n  left:  " << a << "\n  right: " << b;
    throw Failure{os.str()};
  }
}

inline void checkNear(double a, double b, double tol, const char* ea, const char* eb, const char* file, int line) {
  if (std::fabs(a - b) > tol) {
    std::ostringstream os;
    os << file << ":" << line << ": expected " << ea << " ~= " << eb << " (tol " << tol << ")\n  left:  " << a
       << "\n  right: " << b;
    throw Failure{os.str()};
  }
}

inline int runAll() {
  int failed = 0;
  for (const auto& c : registry()) {
    try {
      c.fn();
      std::printf("[ OK ] %s\n", c.name);
    } catch (const Failure& f) {
      ++failed;
      std::printf("[FAIL] %s\n%s\n", c.name, f.message.c_str());
    } catch (const std::exception& e) {
      ++failed;
      std::printf("[FAIL] %s\n  unexpected exception: %s\n", c.name, e.what());
    }
  }
  std::printf("%zu tests, %d failed\n", registry().size(), failed);
  return failed == 0 ? 0 : 1;
}

}  // namespace wptest

#define WP_CAT2(a, b) a##b
#define WP_CAT(a, b) WP_CAT2(a, b)
#define TEST(name)                                                                     \
  static void WP_CAT(test_, name)();                                                   \
  static wptest::Registrar WP_CAT(reg_, name)(#name, WP_CAT(test_, name));             \
  static void WP_CAT(test_, name)()
#define EXPECT_EQ(a, b) wptest::checkEq((a), (b), #a, #b, __FILE__, __LINE__)
#define EXPECT_NEAR(a, b, tol) wptest::checkNear((a), (b), (tol), #a, #b, __FILE__, __LINE__)
#define EXPECT_TRUE(a) wptest::checkEq(static_cast<bool>(a), true, #a, "true", __FILE__, __LINE__)
#define EXPECT_FALSE(a) wptest::checkEq(static_cast<bool>(a), false, #a, "false", __FILE__, __LINE__)
#define EXPECT_THROWS(stmt)                                                                    \
  do {                                                                                         \
    bool threw_ = false;                                                                       \
    try {                                                                                      \
      stmt;                                                                                    \
    } catch (...) {                                                                            \
      threw_ = true;                                                                           \
    }                                                                                          \
    if (!threw_) throw wptest::Failure{std::string(__FILE__) + ": expected throw: " #stmt};    \
  } while (0)
