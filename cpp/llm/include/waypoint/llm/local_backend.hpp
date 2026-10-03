// On-device inference on llama.cpp (RFC-001 §10): one context, grammar sampler
// followed by greedy sampling, and the static prompt prefix kept in the KV cache
// so each guide step evaluates only the new suffix.
//
// Thread-safety: one call at a time (guarded by a mutex). The RNOH module runs
// calls on a dedicated worker thread, never on the JS thread.
#pragma once

#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

struct llama_model;
struct llama_context;

namespace waypoint::llm {

struct LoadOptions {
  std::string path;
  int nCtx = 2048;
  int nThreads = 4;
  std::string sha256;  // expected lower-case hex; empty skips the check
};

struct Completion {
  std::string text;
  int promptTokens = 0;   // tokens evaluated for this call (the uncached suffix)
  int cachedTokens = 0;   // prefix reused from the KV cache
  int genTokens = 0;
  double ms = 0;
};

class LlmError : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

class LocalBackend {
 public:
  LocalBackend();
  ~LocalBackend();
  LocalBackend(const LocalBackend&) = delete;
  LocalBackend& operator=(const LocalBackend&) = delete;

  // Returns false (with a reason) when the file is missing, the checksum differs
  // or llama.cpp cannot load it. Never throws.
  bool load(const LoadOptions& opts, std::string* error = nullptr);
  bool loaded() const;
  // Throws LlmError when nothing is loaded, the grammar does not parse or decoding fails.
  Completion complete(const std::string& system, const std::string& prompt, const std::string& grammar, int maxTokens);
  void unload();
  std::string modelName() const;
  int nCtx() const;

  // Chat formatting with the model's own template; ChatML when it has none.
  std::string formatChat(const std::string& system, const std::string& prompt) const;

 private:
  std::vector<int> tokenize(const std::string& text, bool addSpecial) const;
  std::string piece(int token) const;

  mutable std::mutex mu_;
  llama_model* model_ = nullptr;
  llama_context* ctx_ = nullptr;
  std::vector<int> cached_;  // tokens currently in the KV cache (sequence 0)
  std::string name_;
  int nCtx_ = 0;
};

}  // namespace waypoint::llm
