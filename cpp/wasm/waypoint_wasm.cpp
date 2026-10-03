// WebAssembly entry points: the same core as the device and the CLI, callable
// from a browser. Strings cross the boundary as NUL-terminated UTF-8 in linear
// memory; the caller frees what wp_call returns.
#include <cstdlib>
#include <cstring>
#include <string>

#include "waypoint/api.hpp"

extern "C" {

// wasm32-wasi has no C++ exception runtime here. The core only throws on malformed
// input; in this build a throw traps, and the JavaScript loader turns the trap into
// {"error": ...} and starts a fresh instance (see playground/waypoint-core.js).
void* __cxa_allocate_exception(size_t) { __builtin_trap(); }
void __cxa_throw(void*, void*, void (*)(void*)) { __builtin_trap(); }

__attribute__((export_name("wp_alloc"))) char* wp_alloc(size_t n) { return static_cast<char*>(std::malloc(n)); }

__attribute__((export_name("wp_free"))) void wp_free(char* p) { std::free(p); }

// Runs one core command (see waypoint::api::dispatch) and returns a malloc'd
// JSON string.
__attribute__((export_name("wp_call"))) char* wp_call(const char* cmd, const char* request) {
  std::string out = waypoint::api::dispatch(cmd ? cmd : "", request ? request : "{}");
  char* buf = static_cast<char*>(std::malloc(out.size() + 1));
  if (!buf) return nullptr;
  std::memcpy(buf, out.c_str(), out.size() + 1);
  return buf;
}

}  // extern "C"
